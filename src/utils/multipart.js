const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20 MB

export async function parseMultipartRequest(req, options = {}) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data')) {
    throw new Error('Unsupported content type');
  }
  const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
  if (!boundaryMatch) {
    throw new Error('Missing multipart boundary');
  }
  const boundary = `--${boundaryMatch[1]}`;
  const maxSize = options.maxFileSize || MAX_UPLOAD_SIZE;

  const buffer = await collectBody(req, maxSize);
  const parts = buffer.toString('latin1').split(boundary).slice(1, -1);
  const fields = {};
  let file = null;

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [rawHeaders, ...rest] = trimmed.split('\r\n\r\n');
    const bodyString = rest.join('\r\n\r\n');
    const headers = parseHeaders(rawHeaders);
    const disposition = headers['content-disposition'];
    if (!disposition) {
      continue;
    }
    const nameMatch = disposition.match(/name="([^"]+)"/i);
    if (!nameMatch) {
      continue;
    }
    const fieldName = nameMatch[1];
    const filenameMatch = disposition.match(/filename="([^"]*)"/i);
    const dataBuffer = Buffer.from(bodyString.replace(/\r\n$/, ''), 'latin1');
    if (filenameMatch && filenameMatch[1]) {
      file = {
        fieldName,
        originalName: filenameMatch[1],
        mimeType: headers['content-type'] || 'application/octet-stream',
        buffer: dataBuffer,
        size: dataBuffer.length,
      };
    } else {
      fields[fieldName] = bodyString.replace(/\r\n$/, '').trim();
    }
  }

  if (!file) {
    throw new Error('File not provided');
  }
  if (file.size > maxSize) {
    throw new Error('File too large');
  }
  if (!file.originalName.toLowerCase().endsWith('.pdf')) {
    throw new Error('Only PDF files are allowed');
  }
  if (file.mimeType && !file.mimeType.toLowerCase().includes('pdf')) {
    throw new Error('Invalid file type');
  }

  return { fields, file };
}

function collectBody(req, maxSize) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new Error('File too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (error) => reject(error));
  });
}

function parseHeaders(rawHeaders) {
  return rawHeaders
    .split('\r\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((acc, line) => {
      const [key, ...rest] = line.split(':');
      if (!key || !rest.length) {
        return acc;
      }
      acc[key.trim().toLowerCase()] = rest.join(':').trim();
      return acc;
    }, {});
}
