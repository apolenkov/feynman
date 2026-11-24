#!/usr/bin/env node
// lib/lint/parser.ts — ASCII diagram block parser
// Returns AST: [{type:'diagram', content, startLine, endLine, indent}]
// Detection: ``` fences (generic only) OR standalone blocks ≥30% diagram chars, ≥3 lines
// Zero deps. ESM only.

import { hasFlowArrow } from './arrows.ts';
import { boxes } from './boxes.ts';

// Box-drawing Unicode specifically (high-confidence indicators)
const BOX_DRAWING_CHARS = new Set([
  '┌',
  '┐',
  '└',
  '┘',
  '─',
  '│',
  '├',
  '┤',
  '┬',
  '┴',
  '┼',
  '→',
  '←',
  '↑',
  '↓',
  '▲',
  '▼',
]);

export interface DiagramNode {
  readonly type: 'diagram';
  readonly content: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly indent: number;
}

interface DiagramCharStats {
  readonly boxDrawingCount: number;
  readonly nonSpaceCount: number;
}

function countDiagramChars(text: string): DiagramCharStats {
  let boxDrawingCount = 0;
  let nonSpaceCount = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    nonSpaceCount++;
    if (BOX_DRAWING_CHARS.has(ch)) boxDrawingCount++;
  }
  return { boxDrawingCount, nonSpaceCount };
}

function isProseLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  const wordChars = (trimmed.match(/[a-zA-Z]/g) ?? []).length;
  const boxChars = Array.from(trimmed).filter((ch) => BOX_DRAWING_CHARS.has(ch)).length;
  return wordChars > 5 && boxChars > 0 && wordChars > boxChars * 3;
}

function hasDiagramDensity(
  boxDrawingCount: number,
  nonSpaceCount: number,
  isProse: boolean,
): boolean {
  return nonSpaceCount >= 3 && boxDrawingCount / nonSpaceCount >= 0.15 && !isProse;
}

/**
 * Check if a block of text looks like a diagram.
 * Heuristic: box-drawing Unicode dominant OR structural pattern (flow/tree/table/priority)
 * Explicitly excludes prose lines where box-chars appear incidentally in sentences.
 * @param {string[]} lines
 * @returns {boolean}
 */
function looksLikeDiagram(lines: readonly string[]): boolean {
  const text = lines.join('\n');
  const { nonSpaceCount, boxDrawingCount } = countDiagramChars(text);

  // Must have minimum content
  if (nonSpaceCount < 3) return false;

  if (hasDiagramDensity(boxDrawingCount, nonSpaceCount, lines.every(isProseLine))) return true;

  // Check for structural patterns (these override prose check)
  // Tree structure: lines starting with ├── or └──
  if (/^[\s│]*[├└]──/m.test(text)) return true;

  // Flow diagram: [Box] connected with arrows
  if (hasFlowArrow(text) && boxes(text).next().done !== true) return true;

  // Priority scale: ▲ or ▼ on their own
  if (/^[\s]*[▲▼]/m.test(text)) return true;

  // Table: multiple lines starting with |
  const tableRows = lines.filter((l) => /^\s*\|.*\|/.test(l));
  if (tableRows.length >= 2) return true;

  return false;
}

// On a rejected block, a suffix cannot introduce a structural indicator. Its
// character density and all-prose classification can still change.
function diagramSuffixStart(lines: readonly string[]): number {
  let start = -1;
  let boxDrawingCount = 0;
  let nonSpaceCount = 0;
  let isProse = true;
  for (let i = lines.length - 1; i > 0; i--) {
    const line = lines[i];
    if (line === undefined) break;
    const stats = countDiagramChars(line);
    boxDrawingCount += stats.boxDrawingCount;
    nonSpaceCount += stats.nonSpaceCount;
    isProse = isProse && isProseLine(line);
    if (
      !line.trimStart().startsWith('<!--') &&
      hasDiagramDensity(boxDrawingCount, nonSpaceCount, isProse)
    ) {
      start = i;
    }
  }
  return start;
}

/**
 * Get leading indent (number of spaces) of a line
 * @param {string} line
 * @returns {number}
 */
function getIndent(line: string): number {
  return /^ */.exec(line)?.[0].length ?? 0;
}

/**
 * Parse markdown string into AST of diagram nodes.
 * @param {string} markdown
 * @returns {Array<DiagramNode>}
 */
export function parse(markdown: string): readonly DiagramNode[] {
  // Normalise CRLF/CR to LF first: a trailing \r left on each line inflates
  // visualWidth, skewing the width-sensitive rules (L08/L11/L12). Splitting on
  // the line-ending family keeps the same line count, so line numbers are intact.
  const lines = markdown.split(/\r\n?|\n/);
  const nodes: DiagramNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;
    const trimmed = line.trim();

    // Check for fenced code block: a line that is exactly three backticks plus an
    // optional language word. KNOWN LIMITATION (won't-fix): only exactly-three
    // backtick fences are recognised — longer fences (````, valid CommonMark used
    // to nest a ``` block inside) and nested fences are not parsed; the first inner
    // ``` is treated as the outer close. No shipped rules/ or examples/ content uses
    // them, so this stays a documented edge rather than added parser state. Revisit
    // only if a real diagram needs a nested or 4-backtick fence.
    const fenceMatch = /^```(\w*)$/.exec(trimmed);
    if (fenceMatch) {
      const lang = (fenceMatch[1] ?? '').toLowerCase();

      // Skip named language blocks (js, bash, python, mermaid, etc.)
      // Only process generic ``` fences (empty lang tag)
      if (lang !== '') {
        // Advance to closing fence, skip this block
        i++;
        while ((lines[i]?.trim() ?? '```') !== '```') i++;
        i++; // skip closing ```
        continue;
      }

      // Generic fence — collect content
      const indent = getIndent(line);
      const blockLines: string[] = [];
      i++; // move past opening fence
      const startLine = i + 1; // 1-based line number of first content line
      while ((lines[i]?.trim() ?? '```') !== '```') {
        const blockLine = lines[i];
        if (blockLine === undefined) break;
        blockLines.push(blockLine);
        i++;
      }
      const endLine = i + 1; // 1-based (points to closing ```)
      i++; // skip closing ```

      // Check if it looks like a diagram
      // Fenced blocks: also accept multiple [Box] tokens (even without arrows)
      // since those are clearly intended as flow diagrams (L05 will catch missing arrows)
      const hasFencedBoxPattern = blockLines.some((line) => {
        const [, secondBox] = boxes(line);
        return secondBox !== undefined;
      });
      if (blockLines.length >= 1 && (looksLikeDiagram(blockLines) || hasFencedBoxPattern)) {
        nodes.push({
          type: 'diagram',
          content: blockLines.join('\n'),
          startLine,
          endLine,
          indent,
        });
      }
      continue;
    }

    // Standalone block detection: accumulate consecutive non-empty lines
    // that collectively look like a diagram
    if (trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.startsWith('<!--')) {
      const startLine = i + 1; // 1-based
      const indent = getIndent(line);
      const blockLines = [line];
      let j = i + 1;

      // Extend block: include lines until we hit blank or markdown heading/fence
      while (j < lines.length) {
        const nextLine = lines[j];
        if (nextLine === undefined) break;
        const nextTrimmed = nextLine.trim();

        // Stop at blank lines, headings, or fences
        if (nextTrimmed === '' || nextTrimmed.startsWith('#') || nextTrimmed.startsWith('```'))
          break;
        blockLines.push(nextLine);
        j++;
      }

      // Check for structural diagram indicators (order matters — strongest first)
      const text = blockLines.join('\n');
      const { boxDrawingCount, nonSpaceCount } = countDiagramChars(text);
      const hasBoxToken = hasFlowArrow(text) && boxes(text).next().done !== true;
      // Multiple [Box] tokens on one line without natural language between them
      // (even without arrows — L05 will catch missing arrows)
      // "Natural language between" means: word chars NOT in brackets between the boxes
      const hasMultiBox = blockLines.some((l) => {
        const matches = [...boxes(l)];
        if (matches.length < 2) return false;
        // Check what's between the first and last box
        const first = matches[0];
        const last = matches.at(-1);
        if (!first || !last) return false;
        const firstEnd = first.end;
        const lastStart = last.start;
        const between = l.slice(firstEnd, lastStart);
        // If "between" contains regular English words (sequences of alpha), it's prose
        // Allow: spaces, arrows, punctuation, special chars
        if (/[a-zA-Z]{3,}/.test(between)) return false; // prose words between boxes
        return true;
      });
      const hasTree = /[├└]──/.test(text);
      const hasPriority = /^[\s]*[▲▼]/m.test(text);
      const hasTable = blockLines.filter((l) => /^\s*\|.*\|/.test(l)).length >= 2;

      const isDiagram =
        hasBoxToken ||
        hasMultiBox ||
        hasTree ||
        hasPriority ||
        hasTable ||
        hasDiagramDensity(boxDrawingCount, nonSpaceCount, blockLines.every(isProseLine));

      if (isDiagram) {
        nodes.push({
          type: 'diagram',
          content: text,
          startLine,
          endLine: j, // 1-based (last line index + 1)
          indent,
        });
      } else if (boxDrawingCount > 0) {
        const suffix = diagramSuffixStart(blockLines);
        const first = blockLines[suffix];
        if (first !== undefined) {
          nodes.push({
            type: 'diagram',
            content: blockLines.slice(suffix).join('\n'),
            startLine: startLine + suffix,
            endLine: j,
            indent: getIndent(first),
          });
        }
      }
      i = j;
      continue;
    }

    i++;
  }

  return nodes;
}
