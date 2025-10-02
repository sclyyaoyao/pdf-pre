export function normalizeLineBreaks(text = '') {
  if (!text) {
    return '';
  }
  const paragraphs = text
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter((section) => section.length > 0);

  const rebuilt = paragraphs.map((paragraph) => joinSoftWrappedLines(paragraph));
  return rebuilt.join('\n\n');
}

function joinSoftWrappedLines(paragraph) {
  const lines = paragraph.split(/\n/);
  if (lines.length === 1) {
    return lines[0].trim();
  }
  let output = lines[0].trim();
  for (let i = 1; i < lines.length; i += 1) {
    const current = lines[i].trim();
    if (!current) {
      continue;
    }
    const previousChar = output[output.length - 1];
    const endsSentence = /[.!?。！？;；:：]/u.test(previousChar);
    const startsList = /^[-•\u2022]/.test(current);
    const startsUpperLatin = /^[A-Z]/.test(current);
    const shouldMerge =
      previousChar &&
      !endsSentence &&
      !startsList &&
      !startsUpperLatin &&
      !/\s/.test(previousChar);

    if (shouldMerge) {
      if (previousChar === '-') {
        output = output.slice(0, -1) + current;
      } else {
        output += ` ${current}`;
      }
    } else {
      output += `\n${current}`;
    }
  }
  return output;
}
