#!/usr/bin/env node
// lib/lint/parser.ts — ASCII diagram block parser
// Returns AST: [{type:'diagram', content, startLine, endLine, indent}]
// Detection: ``` fences (generic only) OR standalone blocks ≥30% diagram chars, ≥3 lines
// Zero deps. ESM only.

// Characters that indicate ASCII diagram content
// Box-drawing: ┌┐└┘─│├┤┬┴┼ Tree: ├── └── Arrows: →←↑↓▲▼
// Also count: + - | < > brackets used in ASCII art context
const DIAGRAM_CHARS = new Set([
  '┌', '┐', '└', '┘', '─', '│', '├', '┤', '┬', '┴', '┼',
  '→', '←', '↑', '↓', '▲', '▼',
  '+', '-', '|'
]);

// Box-drawing Unicode specifically (high-confidence indicators)
const BOX_DRAWING_CHARS = new Set([
  '┌', '┐', '└', '┘', '─', '│', '├', '┤', '┬', '┴', '┼',
  '→', '←', '↑', '↓', '▲', '▼'
]);

export interface DiagramNode {
  type: 'diagram';
  content: string;
  startLine: number;
  endLine: number;
  indent: number;
}

interface DiagramCharStats {
  diagramCount: number;
  nonSpaceCount: number;
  hasBoxDrawing: boolean;
}

/**
 * Count diagram chars in a string (non-space chars only for ratio)
 * @param {string} text
 * @returns {{diagramCount: number, nonSpaceCount: number, hasBoxDrawing: boolean}}
 */
function countDiagramChars(text: string): DiagramCharStats {
  let diagramCount = 0;
  let nonSpaceCount = 0;
  let hasBoxDrawing = false;

  for (const ch of text) {
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') continue;
    nonSpaceCount++;
    if (DIAGRAM_CHARS.has(ch)) diagramCount++;
    if (BOX_DRAWING_CHARS.has(ch)) hasBoxDrawing = true;
  }
  return { diagramCount, nonSpaceCount, hasBoxDrawing };
}

/**
 * Check if a block of text looks like a diagram.
 * Heuristic: box-drawing Unicode dominant OR structural pattern (flow/tree/table/priority)
 * Explicitly excludes prose lines where box-chars appear incidentally in sentences.
 * @param {string[]} lines
 * @returns {boolean}
 */
function looksLikeDiagram(lines: string[]): boolean {
  const text = lines.join('\n');
  const { nonSpaceCount, hasBoxDrawing } = countDiagramChars(text);

  // Must have minimum content
  if (nonSpaceCount < 3) return false;

  // If any line looks like natural prose (has word chars AND box chars but ratio is low)
  // then exclude it from standalone detection.
  // Prose check: line has alphabetic words AND box chars but < 20% diagram chars overall
  const isProse = lines.every(line => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    // If the line has natural language (multiple word chars) and any box chars
    // but the box chars are embedded in prose (not structural)
    const wordChars = (trimmed.match(/[a-zA-Z]/g) || []).length;
    const boxChars = [...trimmed].filter(ch => BOX_DRAWING_CHARS.has(ch)).length;
    // Prose: more letters than box chars by a significant margin
    if (wordChars > 5 && boxChars > 0 && wordChars > boxChars * 3) return true;
    return !trimmed; // blank lines are neutral
  });

  // For standalone blocks (not fenced), require structural indicators
  // Box-drawing Unicode dominant (≥40% of non-space chars are box-drawing)
  const boxDrawingCount = [...text].filter(ch => BOX_DRAWING_CHARS.has(ch)).length;
  const boxRatio = nonSpaceCount > 0 ? boxDrawingCount / nonSpaceCount : 0;

  if (hasBoxDrawing && boxRatio >= 0.15 && !isProse) return true;

  // Check for structural patterns (these override prose check)
  // Tree structure: lines starting with ├── or └──
  if (/^[\s│]*[├└]──/m.test(text)) return true;

  // Flow diagram: [Box] connected with arrows
  if (/\[[^\]]+\]/.test(text) && /-->|→|─→|──>/.test(text)) return true;

  // Priority scale: ▲ or ▼ on their own
  if (/^[\s]*[▲▼]/m.test(text)) return true;

  // Table: multiple lines starting with |
  const tableRows = lines.filter(l => /^\s*\|.*\|/.test(l));
  if (tableRows.length >= 2) return true;

  return false;
}

/**
 * Get leading indent (number of spaces) of a line
 * @param {string} line
 * @returns {number}
 */
function getIndent(line: string): number {
  let i = 0;
  while (i < line.length && line[i] === ' ') i++;
  return i;
}

/**
 * Parse markdown string into AST of diagram nodes.
 * @param {string} markdown
 * @returns {Array<DiagramNode>}
 */
export function parse(markdown: string): DiagramNode[] {
  const lines = markdown.split('\n');
  const nodes: DiagramNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Check for fenced code block: ```
    const fenceMatch = trimmed.match(/^```(\w*)$/);
    if (fenceMatch) {
      const lang = fenceMatch[1]!.toLowerCase();

      // Skip named language blocks (js, bash, python, mermaid, etc.)
      // Only process generic ``` fences (empty lang tag)
      if (lang !== '') {
        // Advance to closing fence, skip this block
        i++;
        while (i < lines.length && lines[i]!.trim() !== '```') i++;
        i++; // skip closing ```
        continue;
      }

      // Generic fence — collect content
      const indent = getIndent(line);
      const blockLines: string[] = [];
      i++; // move past opening fence
      const startLine = i + 1; // 1-based line number of first content line
      while (i < lines.length && lines[i]!.trim() !== '```') {
        blockLines.push(lines[i]!);
        i++;
      }
      const endLine = i + 1; // 1-based (points to closing ```)
      i++; // skip closing ```

      // Check if it looks like a diagram
      // Fenced blocks: also accept multiple [Box] tokens (even without arrows)
      // since those are clearly intended as flow diagrams (L05 will catch missing arrows)
      const hasFencedBoxPattern = blockLines.some(line => {
        const boxes = [...line.matchAll(/\[[^\]]+\]/g)];
        return boxes.length >= 2;
      });
      if (blockLines.length >= 1 && (looksLikeDiagram(blockLines) || hasFencedBoxPattern)) {
        nodes.push({
          type: 'diagram',
          content: blockLines.join('\n'),
          startLine,
          endLine,
          indent
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
        const nextLine = lines[j]!;
        const nextTrimmed = nextLine.trim();

        // Stop at blank lines, headings, or fences
        if (nextTrimmed === '' || nextTrimmed.startsWith('#') || nextTrimmed.startsWith('```')) break;
        blockLines.push(nextLine);
        j++;
      }

      // Check for structural diagram indicators (order matters — strongest first)
      const text = blockLines.join('\n');
      const { hasBoxDrawing } = countDiagramChars(text);
      const hasBoxToken = /\[[^\]]+\]/.test(text) && /-->|→|─>|──>/.test(text);
      // Multiple [Box] tokens on one line without natural language between them
      // (even without arrows — L05 will catch missing arrows)
      // "Natural language between" means: word chars NOT in brackets between the boxes
      const hasMultiBox = blockLines.some(l => {
        const matches = [...l.matchAll(/\[[^\]]+\]/g)];
        if (matches.length < 2) return false;
        // Check what's between the first and last box
        const firstEnd = matches[0]!.index! + matches[0]![0]!.length;
        const lastStart = matches[matches.length - 1]!.index!;
        const between = l.slice(firstEnd, lastStart);
        // If "between" contains regular English words (sequences of alpha), it's prose
        // Allow: spaces, arrows, punctuation, special chars
        if (/[a-zA-Z]{3,}/.test(between)) return false; // prose words between boxes
        return true;
      });
      const hasTree = /[├└]──/.test(text);
      const hasPriority = /^[\s]*[▲▼]/m.test(text);
      const hasTable = blockLines.filter(l => /^\s*\|.*\|/.test(l)).length >= 2;

      const isDiagram = hasBoxDrawing || hasBoxToken || hasMultiBox || hasTree || hasPriority || hasTable;

      if (isDiagram && (looksLikeDiagram(blockLines) || hasMultiBox || hasTree || hasPriority || hasTable)) {
        nodes.push({
          type: 'diagram',
          content: text,
          startLine,
          endLine: j, // 1-based (last line index + 1)
          indent
        });
        i = j;
        continue;
      }
    }

    i++;
  }

  return nodes;
}
