const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20 MB

const DOUBLE_CRLF = Buffer.from('\r\n\r\n');

export async function parseMultipartRequest(req, options = {}) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data')) {
    throw new Error('Unsupported content type');
  }
  const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
  if (!boundaryMatch) {
    throw new Error('Missing multipart boundary');
  }
  let boundary = boundaryMatch[1].trim();
  if (boundary.startsWith('"') && boundary.endsWith('"')) {
    boundary = boundary.slice(1, -1);
  }
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const maxSize = options.maxFileSize || MAX_UPLOAD_SIZE;

  const bodyBuffer = await collectBody(req, maxSize);
  const fields = {};
  let file = null;

  let cursor = bodyBuffer.indexOf(boundaryBuffer);
  if (cursor === -1) {
    throw new Error('Malformed multipart payload');
  }
  while (cursor !== -1) {
    cursor += boundaryBuffer.length;

    // 检查是否已经到达结束边界
    if (bodyBuffer[cursor] === 0x2d && bodyBuffer[cursor + 1] === 0x2d) {
      break;
    }

    // 跳过换行
    if (bodyBuffer[cursor] === 0x0d && bodyBuffer[cursor + 1] === 0x0a) {
      cursor += 2;
    } else if (bodyBuffer[cursor] === 0x0a) {
      cursor += 1;
    }

    const nextBoundaryIndex = bodyBuffer.indexOf(boundaryBuffer, cursor);
    if (nextBoundaryIndex === -1) {
      break;
    }

    let partBuffer = bodyBuffer.slice(cursor, nextBoundaryIndex);
    partBuffer = stripTrailingLineBreak(partBuffer);

    const headersEndIndex = partBuffer.indexOf(DOUBLE_CRLF);
    if (headersEndIndex === -1) {
      cursor = nextBoundaryIndex;
      continue;
    }

    const rawHeaders = partBuffer.slice(0, headersEndIndex).toString('utf-8');
    const headers = parseHeaders(rawHeaders);
    const content = partBuffer.slice(headersEndIndex + DOUBLE_CRLF.length);
    const disposition = headers['content-disposition'];

    if (!disposition) {
      cursor = nextBoundaryIndex;
      continue;
    }

    const nameMatch = disposition.match(/name="([^"]+)"/i);
    if (!nameMatch) {
      cursor = nextBoundaryIndex;
      continue;
    }

    const fieldName = nameMatch[1];
    const filenameMatch = disposition.match(/filename="([^"]*)"/i);

    if (filenameMatch && filenameMatch[1]) {
      const originalName = filenameMatch[1];
      const fileBuffer = content;
      const mimeType = headers['content-type'] || 'application/octet-stream';
      file = {
        fieldName,
        originalName,
        mimeType,
        buffer: fileBuffer,
        size: fileBuffer.length,
      };
    } else {
      fields[fieldName] = stripTrailingLineBreak(content).toString('utf-8');
    }

    cursor = nextBoundaryIndex;
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
  if (
    file.mimeType &&
    !/pdf/i.test(file.mimeType) &&
    file.mimeType.toLowerCase() !== 'application/octet-stream'
  ) {
    throw new Error('Invalid file type');
  }

  return { fields, file };
}

function collectBody(req, maxSize) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let aborted = false;

    const onData = (chunk) => {
      if (aborted) {
        return;
      }
      size += chunk.length;
      if (size > maxSize) {
        aborted = true;
        chunks.length = 0;
        reject(new Error('File too large'));
        req.removeListener('data', onData);
        req.resume();
        return;
      }
      chunks.push(chunk);
    };

    req.on('data', onData);
    req.on('end', () => {
      if (aborted) {
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    req.on('aborted', () => {
      if (aborted) {
        return;
      }
      aborted = true;
      reject(new Error('Request aborted'));
    });
    req.on('error', (error) => {
      if (aborted) {
        return;
      }
      aborted = true;
      reject(error);
    });
  });
}

function stripTrailingLineBreak(buffer) {
  if (buffer.length >= 2 && buffer[buffer.length - 2] === 0x0d && buffer[buffer.length - 1] === 0x0a) {
    return buffer.slice(0, buffer.length - 2);
  }
  if (buffer.length >= 1 && (buffer[buffer.length - 1] === 0x0a || buffer[buffer.length - 1] === 0x0d)) {
    return buffer.slice(0, buffer.length - 1);
  }
  return buffer;
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
