export function formatContent(text, format) {
  switch (format) {
    case 'md':
      return formatAsMarkdown(text);
    case 'csv':
      return formatAsCsv(text);
    case 'txt':
    default:
      return text;
  }
}

function formatAsMarkdown(text) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const converted = paragraphs.map((paragraph) => {
    const lines = paragraph.split(/\n/);
    if (lines.length > 1) {
      return lines
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return '';
          }
          if (/^[-*•]/.test(trimmed)) {
            return `- ${trimmed.replace(/^[-*•]\s*/, '')}`;
          }
          return trimmed;
        })
        .join('\n');
    }
    return paragraph;
  });
  return converted.join('\n\n');
}

function formatAsCsv(text) {
  const rows = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, ' ').trim())
    .filter(Boolean);
  if (!rows.length) {
    return '';
  }
  const header = '"Paragraph"';
  const body = rows
    .map((row) => `"${row.replace(/"/g, '""')}"`)
    .join('\n');
  return `${header}\n${body}`;
}
