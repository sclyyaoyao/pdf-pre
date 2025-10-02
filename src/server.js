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
  try {
    if (req.method === 'GET') {
      await handleGet(req, res);
      return;
    }
    if (req.method === 'POST' && req.url === '/api/convert') {
      await handleConvert(req, res);
      return;
    }
    if (req.method === 'OPTIONS' && req.url === '/api/convert') {
      res.writeHead(204, defaultCorsHeaders());
      res.end();
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

async function handleGet(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
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
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found' }));
  }
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
