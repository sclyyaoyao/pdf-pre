import http from 'http';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { parseMultipartRequest } from './utils/multipart.js';
import { extractTextFromPdf } from './utils/pdfExtractor.js';
import { normalizeLineBreaks } from './utils/lineBreaks.js';
import { formatContent } from './utils/formatters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 5002;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  let pathname = null;
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    pathname = url.pathname;
  } catch (error) {
    console.error('无法解析请求 URL', error);
    res.writeHead(400, { 'Content-Type': 'application/json', ...defaultCorsHeaders() });
    res.end(JSON.stringify({ error: 'Invalid request URL' }));
    return;
  }
  try {
    if (req.method === 'GET') {
      await handleGet(req, res, pathname);
      return;
    }
    if (req.method === 'POST' && isConvertPath(pathname)) {
      await handleConvert(req, res);
      return;
    }
    if (req.method === 'OPTIONS' && isConvertPath(pathname)) {
      res.writeHead(204, defaultCorsHeaders());
      res.end();
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json', ...defaultCorsHeaders() });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json', ...defaultCorsHeaders() });
    }
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.on('clientError', (error, socket) => {
  console.error('Client error', error);
  if (socket.writable) {
    const body = JSON.stringify({ error: 'Malformed request' });
    socket.end(
      `HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: ${Buffer.byteLength(
        body,
        'utf-8',
      )}\r\nConnection: close\r\n\r\n${body}`,
    );
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

async function handleGet(req, res, pathname) {
  const targetPath = pathname === '/' ? 'index.html' : pathname;
  const normalizedTarget = sanitizePublicPath(targetPath);
  if (normalizedTarget === null) {
    res.writeHead(403, { 'Content-Type': 'application/json', ...defaultCorsHeaders() });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }
  let filePath = path.join(PUBLIC_DIR, normalizedTarget);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'application/json', ...defaultCorsHeaders() });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }
  const ext = path.extname(filePath);
  try {
    const content = await readFile(filePath);
    const headers = {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      ...defaultCorsHeaders(),
    };
    res.writeHead(200, headers);
    res.end(content);
  } catch (error) {
    if (ext === '') {
      try {
        filePath = `${filePath}.html`;
        const fallback = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...defaultCorsHeaders() });
        res.end(fallback);
        return;
      } catch (innerError) {
        console.error(innerError);
      }
    }
    res.writeHead(404, { 'Content-Type': 'application/json', ...defaultCorsHeaders() });
    res.end(JSON.stringify({ error: 'File not found' }));
  }
}

function sanitizePublicPath(rawPath) {
  const withoutLeadingSlash = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
  const normalized = path.normalize(withoutLeadingSlash);
  if (normalized === '' || normalized === '.') {
    return 'index.html';
  }
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    return null;
  }
  return normalized;
}

async function handleConvert(req, res) {
  try {
    const { fields, file } = await parseMultipartRequest(req);
    const format = normalizeFormat(fields.format);
    const shouldNormalize = fields.normalizeLineBreaks === 'true';

    const text = extractTextFromPdf(file.buffer);
    const processedText = shouldNormalize ? normalizeLineBreaks(text) : text;
    const output = formatContent(processedText, format);

    const filename = buildFilename(file.originalName, format);
    const headers = {
      ...defaultCorsHeaders(),
      'Content-Type': mimeForFormat(format),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': Buffer.byteLength(output, 'utf-8'),
    };
    res.writeHead(200, headers);
    res.end(output, 'utf-8');
  } catch (error) {
    console.error(error);
    res.writeHead(400, { 'Content-Type': 'application/json', ...defaultCorsHeaders() });
    res.end(JSON.stringify({ error: error.message || 'Conversion failed' }));
  }
}

function normalizeFormat(value) {
  if (!value) return 'txt';
  const allowed = ['txt', 'md', 'csv'];
  return allowed.includes(value) ? value : 'txt';
}

function buildFilename(originalName, format) {
  const base = originalName.replace(/\.pdf$/i, '');
  return `${base}.${format}`;
}

function mimeForFormat(format) {
  switch (format) {
    case 'md':
      return 'text/markdown; charset=utf-8';
    case 'csv':
      return 'text/csv; charset=utf-8';
    case 'txt':
    default:
      return 'text/plain; charset=utf-8';
  }
}

function defaultCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function isConvertPath(pathname) {
  if (!pathname) return false;
  if (pathname === '/api/convert') return true;
  if (pathname.endsWith('/')) {
    return pathname.slice(0, -1) === '/api/convert';
  }
  return false;
}
