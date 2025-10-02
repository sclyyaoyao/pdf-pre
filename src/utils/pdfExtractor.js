import { inflateSync } from 'zlib';

const STREAM = Buffer.from('stream');
const END_STREAM = Buffer.from('endstream');

function sliceStream(buffer, startIndex) {
  let start = startIndex + STREAM.length;
  // Skip CRLF or LF after stream keyword
  if (buffer[start] === 0x0d && buffer[start + 1] === 0x0a) {
    start += 2;
  } else if (buffer[start] === 0x0a) {
    start += 1;
  }
  const end = buffer.indexOf(END_STREAM, start);
  if (end === -1) {
    return null;
  }
  let actualEnd = end;
  // Trim trailing newline characters before endstream
  while (
    actualEnd > start &&
    (buffer[actualEnd - 1] === 0x0d || buffer[actualEnd - 1] === 0x0a)
  ) {
    actualEnd -= 1;
  }
  return buffer.slice(start, actualEnd);
}

function decodeStreamContent(streamBuffer) {
  if (!streamBuffer) return '';
  try {
    return inflateSync(streamBuffer).toString('latin1');
  } catch (error) {
    return streamBuffer.toString('latin1');
  }
}

function readStringLiteral(content, index) {
  let i = index + 1;
  let depth = 1;
  let value = '';
  while (i < content.length && depth > 0) {
    const char = content[i];
    if (char === '\\') {
      const next = content[i + 1];
      if (next === undefined) {
        break;
      }
      switch (next) {
        case 'n':
          value += '\n';
          break;
        case 'r':
          value += '\r';
          break;
        case 't':
          value += '\t';
          break;
        case 'b':
          value += '\b';
          break;
        case 'f':
          value += '\f';
          break;
        case '(':
        case ')':
        case '\\':
          value += next;
          break;
        default:
          value += next;
      }
      i += 2;
      continue;
    }
    if (char === '(') {
      depth += 1;
      value += char;
      i += 1;
      continue;
    }
    if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        i += 1;
        break;
      }
      value += char;
      i += 1;
      continue;
    }
    value += char;
    i += 1;
  }
  return { value, nextIndex: i };
}

function tokenizeContent(content) {
  const tokens = [];
  let i = 0;
  while (i < content.length) {
    const char = content[i];
    if (char === '(') {
      const { value, nextIndex } = readStringLiteral(content, i);
      tokens.push({ type: 'string', value });
      i = nextIndex;
      continue;
    }
    if (char === '[') {
      tokens.push({ type: 'arrayStart' });
      i += 1;
      continue;
    }
    if (char === ']') {
      tokens.push({ type: 'arrayEnd' });
      i += 1;
      continue;
    }
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < content.length && !/[\s\[\]()]/.test(content[j])) {
      j += 1;
    }
    const raw = content.slice(i, j);
    if (!Number.isNaN(Number(raw))) {
      tokens.push({ type: 'number', value: Number(raw) });
    } else {
      tokens.push({ type: 'name', value: raw });
    }
    i = j;
  }
  return tokens;
}

function textFromTokens(tokens) {
  const chunks = [];
  let buffer = [];
  for (const token of tokens) {
    if (token.type === 'string') {
      buffer.push(token.value);
      continue;
    }
    if (token.type === 'name') {
      if (token.value === 'Tj') {
        if (buffer.length) {
          chunks.push(buffer[buffer.length - 1]);
        }
        buffer = [];
      } else if (token.value === 'TJ') {
        if (buffer.length) {
          chunks.push(buffer.join(''));
        }
        buffer = [];
      } else if (token.value === 'Td' || token.value === 'TD' || token.value === 'Tm') {
        if (buffer.length) {
          chunks.push(buffer.join(''));
          buffer = [];
        }
        chunks.push('\n');
      } else {
        buffer = [];
      }
    }
    if (token.type === 'arrayEnd') {
      continue;
    }
    if (token.type === 'arrayStart' || token.type === 'number') {
      continue;
    }
  }
  if (buffer.length) {
    chunks.push(buffer.join(''));
  }
  return chunks
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractTextFromPdf(buffer) {
  if (!buffer || !buffer.length) {
    throw new Error('Empty PDF buffer');
  }
  const texts = [];
  let index = buffer.indexOf(STREAM, 0);
  while (index !== -1) {
    const streamBuffer = sliceStream(buffer, index);
    if (streamBuffer) {
      const decoded = decodeStreamContent(streamBuffer);
      if (decoded) {
        const tokens = tokenizeContent(decoded);
        const text = textFromTokens(tokens);
        if (text) {
          texts.push(text);
        }
      }
    }
    index = buffer.indexOf(STREAM, index + STREAM.length);
  }
  return texts.join('\n\n');
}
