import "server-only";

import type { PDFFont } from "pdf-lib";

function widthOf(text: string, font: PDFFont, fontSize: number): number {
  return font.widthOfTextAtSize(text, fontSize);
}

/**
 * Word-oriented wrap; if a single word exceeds `maxWidth`, hard-breaks the word.
 */
export function wrapTextToLines(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let currentLine = "";

  const flush = () => {
    if (currentLine) {
      lines.push(currentLine);
      currentLine = "";
    }
  };

  for (const word of words) {
    if (widthOf(word, font, fontSize) > maxWidth) {
      flush();
      let w = word;
      while (w.length > 0) {
        let len = w.length;
        while (
          len > 0 &&
          widthOf(w.slice(0, len), font, fontSize) > maxWidth
        ) {
          len -= 1;
        }
        if (len === 0) len = 1;
        lines.push(w.slice(0, len));
        w = w.slice(len);
      }
      continue;
    }

    const trial = currentLine ? `${currentLine} ${word}` : word;
    if (widthOf(trial, font, fontSize) <= maxWidth) {
      currentLine = trial;
    } else {
      flush();
      currentLine = word;
    }
  }
  flush();
  return lines;
}
