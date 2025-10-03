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

export function createServer() {
  const server = http.createServer(async (req, res) => {
    let pathname = null;
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      pathname = url.pathname;
    } catch (error) {
      console.error('无法解析请求 URL', error);
      const body = JSON.stringify({ error: 'Invalid request URL' });
      const length = Buffer.byteLength(body, 'utf-8');
      res.writeHead(400, jsonHeaders(length));
      res.end(body);
      return;
    }

    try {
      if (req.method === 'OPTIONS' && isConvertPath(pathname)) {
        res.writeHead(204, defaultCorsHeaders());
        res.end();
        return;
      }

      if (req.method === 'POST' && isConvertPath(pathname)) {
        await handleConvert(req, res);
        return;
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        await handleStatic(req, res, pathname);
        return;
      }

      const body = JSON.stringify({ error: 'Not found' });
      const length = Buffer.byteLength(body, 'utf-8');
      res.writeHead(404, jsonHeaders(length));
      res.end(body);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        const body = JSON.stringify({ error: 'Internal server error' });
        const length = Buffer.byteLength(body, 'utf-8');
        res.writeHead(500, jsonHeaders(length));
        res.end(body);
      } else {
        res.end();
      }
    }
  });

  server.on('clientError', (error, socket) => {
    console.error('Client error', error);
    if (socket.writable) {
      const body = JSON.stringify({ error: 'Malformed request' });
      socket.end(
        `HTTP/1.1 400 Bad Request\r\nContent-Type: application/json; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET,POST,OPTIONS,HEAD\r\nAccess-Control-Allow-Headers: Content-Type, Accept\r\nContent-Length: ${Buffer.byteLength(
          body,
          'utf-8',
        )}\r\nConnection: close\r\n\r\n${body}`,
      );
    } else {
      socket.destroy();
    }
  });

  return server;
}

async function handleStatic(req, res, pathname) {
  if (isConvertPath(pathname)) {
    const body = JSON.stringify({ error: 'Not found' });
    const length = Buffer.byteLength(body, 'utf-8');
    res.writeHead(404, jsonHeaders(length));
    res.end(body);
    return;
  }

  const targetPath = pathname === '/' ? 'index.html' : pathname;
  const normalizedTarget = sanitizePublicPath(targetPath);
  if (normalizedTarget === null) {
    const body = JSON.stringify({ error: 'Forbidden' });
    const length = Buffer.byteLength(body, 'utf-8');
    res.writeHead(403, jsonHeaders(length));
    res.end(body);
    return;
  }
  const filePath = path.resolve(PUBLIC_DIR, normalizedTarget);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    const body = JSON.stringify({ error: 'Forbidden' });
    const length = Buffer.byteLength(body, 'utf-8');
    res.writeHead(403, jsonHeaders(length));
    res.end(body);
    return;
  }
  const ext = path.extname(filePath);
  try {
    const content = await readFile(filePath);
    sendStatic(res, content, MIME_TYPES[ext] || 'application/octet-stream', req.method);
  } catch (error) {
    if (ext === '') {
      try {
        const fallback = await readFile(`${filePath}.html`);
        sendStatic(res, fallback, 'text/html; charset=utf-8', req.method);
        return;
      } catch (innerError) {
        console.error(innerError);
      }
    }
    const body = JSON.stringify({ error: 'File not found' });
    const length = Buffer.byteLength(body, 'utf-8');
    res.writeHead(404, jsonHeaders(length));
    res.end(body);
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
    const body = JSON.stringify({ error: error.message || 'Conversion failed' });
    const length = Buffer.byteLength(body, 'utf-8');
    res.writeHead(400, jsonHeaders(length));
    res.end(body);
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
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS,HEAD',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
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

function sendStatic(res, content, contentType, method = 'GET') {
  const headers = {
    ...defaultCorsHeaders(),
    'Content-Type': contentType,
    'Content-Length': content.length,
  };
  res.writeHead(200, headers);
  if (method === 'HEAD') {
    res.end();
    return;
  }
  res.end(content);
}

function jsonHeaders(length) {
  return {
    ...defaultCorsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': length,
  };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}
