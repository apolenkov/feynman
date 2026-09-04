// lib/lint/width.ts — single source of truth for visual-width calculations.
// Used by rules.ts (L01, L08, L09) and autofix.ts. Zero deps. ESM only.

const ANSI_AT_START_RE = /^\x1b\[[0-9;]*m/;
const ZERO_WIDTH_RE = /[\u0300-\u036f\u200b-\u200f\ufeff]/u;

export interface VisualCharacter {
  readonly character: string;
  readonly column: number;
  readonly sourceColumn: number;
}

export function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3040 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0xa4cf) ||
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xac00 && code <= 0xd7ff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe1f) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f64f) ||
    (code >= 0x1f900 && code <= 0x1f9ff) ||
    (code >= 0x20000 && code <= 0x2fffd) ||
    (code >= 0x30000 && code <= 0x3fffd)
  );
}

/**
 * Single-pass terminal-column scanner. The local cursor and result buffer are
 * owned by this call so ANSI sequences and Unicode code points are processed
 * in linear time without copying the remaining suffix on every character.
 */
export function visualCharacters(line: string): readonly VisualCharacter[] {
  const characters: VisualCharacter[] = [];
  let column = 0;
  let offset = 0;

  while (offset < line.length) {
    if (line.charCodeAt(offset) === 0x1b && line[offset + 1] === '[') {
      const ansi = ANSI_AT_START_RE.exec(line.slice(offset))?.[0];
      if (ansi !== undefined) {
        offset += ansi.length;
        continue;
      }
    }

    const code = line.codePointAt(offset);
    if (code === undefined) break;
    const character = String.fromCodePoint(code);
    const sourceColumn = offset + 1;
    offset += character.length;

    if (ZERO_WIDTH_RE.test(character)) {
      characters.push({ character, column, sourceColumn });
      continue;
    }
    column += isWide(code) ? 2 : 1;
    characters.push({ character, column, sourceColumn });
  }

  return characters;
}

export function visualWidth(line: string | undefined | null): number {
  if (line === undefined || line === null || line.length === 0) return 0;
  return visualCharacters(line).at(-1)?.column ?? 0;
}

export function lastVisualColumnOf(line: string, character: string): number {
  return (
    visualCharacters(line)
      .filter((entry) => entry.character === character)
      .at(-1)?.column ?? -1
  );
}

export function firstVisualColumnOf(line: string, character: string): number {
  return visualCharacters(line).find((entry) => entry.character === character)?.column ?? -1;
}
