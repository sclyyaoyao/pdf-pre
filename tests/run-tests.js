import { strict as assert } from 'assert';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

import { normalizeLineBreaks } from '../src/utils/lineBreaks.js';
import { formatContent } from '../src/utils/formatters.js';
import { extractTextFromPdf } from '../src/utils/pdfExtractor.js';
import { parseMultipartRequest } from '../src/utils/multipart.js';
import { createServer } from '../src/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('normalizeLineBreaks should merge软换行并保留段落', () => {
  const input = '这是第一行\n继续第一行\n\n这是第二段\n- 列表项';
  const expected = '这是第一行 继续第一行\n\n这是第二段\n- 列表项';
  const result = normalizeLineBreaks(input);
  assert.equal(result, expected);
});

test('formatContent 输出 markdown 和 csv', () => {
  const text = '段落一\n\n段落二\n- 列表';
  const md = formatContent(text, 'md');
  assert(md.includes('- 列表'));
  const csv = formatContent(text, 'csv');
  assert(csv.startsWith('"Paragraph"'));
  assert(csv.split('\n').length === 3);
});

test('extractTextFromPdf 能读取示例 PDF', async () => {
  const pdfPath = path.join(__dirname, 'fixtures', 'simple.pdf');
  const buffer = await readFile(pdfPath);
  const text = extractTextFromPdf(buffer);
  assert(text.includes('Hello PDF World'));
});

test('parseMultipartRequest 可解析 multipart 请求并支持 octet-stream', async () => {
  const boundary = '----testboundary7f1a';
  const pdfPath = path.join(__dirname, 'fixtures', 'simple.pdf');
  const pdfBuffer = await readFile(pdfPath);

  const parts = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="format"\r\n\r\nmd\r\n`, 'utf-8'),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="normalizeLineBreaks"\r\n\r\ntrue\r\n`, 'utf-8'),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="simple.pdf"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      'utf-8',
    ),
    pdfBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8'),
  ];

  const body = Buffer.concat(parts);
  const req = Readable.from(body);
  req.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
  };

  const { fields, file } = await parseMultipartRequest(req);
  assert.equal(fields.format, 'md');
  assert.equal(fields.normalizeLineBreaks, 'true');
  assert.equal(file.originalName, 'simple.pdf');
  assert.equal(file.mimeType, 'application/octet-stream');
  assert.equal(file.size, pdfBuffer.length);
  assert.equal(Buffer.compare(file.buffer, pdfBuffer), 0);
});

test('parseMultipartRequest 支持带引号的 boundary', async () => {
  const boundary = '----quotedBoundary5d6c';
  const pdfPath = path.join(__dirname, 'fixtures', 'simple.pdf');
  const pdfBuffer = await readFile(pdfPath);

  const parts = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="simple.pdf"\r\nContent-Type: application/pdf\r\n\r\n`, 'utf-8'),
    pdfBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8'),
  ];

  const body = Buffer.concat(parts);
  const req = Readable.from(body);
  req.headers = {
    'content-type': `multipart/form-data; boundary="${boundary}"`,
  };

  const { file } = await parseMultipartRequest(req);
  assert.equal(file.size, pdfBuffer.length);
  assert.equal(file.originalName, 'simple.pdf');
});

test('HTTP 服务支持静态资源访问和转换接口', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const headResponse = await fetch(`${baseUrl}/styles.css`, { method: 'HEAD' });
    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.headers.get('content-type'), 'text/css; charset=utf-8');

    const pageResponse = await fetch(`${baseUrl}/`);
    assert.equal(pageResponse.status, 200);
    const html = await pageResponse.text();
    assert(html.includes('PDF 文本转换'));

    const pdfPath = path.join(__dirname, 'fixtures', 'simple.pdf');
    const pdfBuffer = await readFile(pdfPath);
    const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
    const formData = new FormData();
    formData.set('file', pdfBlob, 'simple.pdf');
    formData.set('format', 'txt');
    formData.set('normalizeLineBreaks', 'true');

    const convertResponse = await fetch(`${baseUrl}/api/convert`, {
      method: 'POST',
      body: formData,
    });

    assert.equal(convertResponse.status, 200);
    assert.equal(convertResponse.headers.get('content-type'), 'text/plain; charset=utf-8');
    const text = await convertResponse.text();
    assert(text.includes('Hello PDF World'));
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }),
    );
  }
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      await result;
    }
    console.log(`✅ ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

console.log(`\n共执行 ${tests.length} 项测试，通过 ${passed} 项。`);
