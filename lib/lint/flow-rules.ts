import { type ASTNode, type Issue, issue } from './lint-diagnostics.ts';
import { boxes } from './boxes.ts';

// ---------------------------------------------------------------------------
// L02 — Tree chars
// Last child must use └── not ├──
// Detect: line with ├── where the NEXT tree-level sibling doesn't exist
// (i.e. ├── is used as the last item in its group)
// ---------------------------------------------------------------------------
export function L02_tree_chars(ast: ASTNode): Issue[] {
  if (ast.content.length === 0) return [];

  const content = ast.content;
  // Skip if no tree chars at all
  if (!content.includes('├') && !content.includes('└')) return [];

  const lines = content.split('\n');
  const issues: Issue[] = [];
  const baseLineNum = ast.startLine;

  for (const [li, line] of lines.entries()) {
    // Check for ├── lines
    const miteeMatch = /^(\s*(?:│\s*)*)├──/.exec(line);
    if (!miteeMatch) continue;

    // This line uses ├──. Now check if it should be └──.
    // The rule: if this is the LAST sibling at its indent level, it's wrong.
    // Determine the indent prefix (everything before ├)
    const prefixLen = miteeMatch[0].length - 3; // length without '├──'
    const prefix = line.slice(0, prefixLen); // e.g. "    │   "

    // Look for subsequent sibling lines: same prefix + (├── or └──)
    let hasNextSibling = false;
    for (let lj = li + 1; lj < lines.length; lj++) {
      const next = lines[lj] ?? '';
      if (next.trim() === '') break; // blank line ends the block

      // A sibling would start with same prefix then ├── or └──
      if (next.startsWith(prefix + '├──') || next.startsWith(prefix + '└──')) {
        hasNextSibling = true;
        break;
      }

      // A line that is "shallower" (shorter prefix) means we've gone up
      // Check: if line doesn't start with prefix at all (excluding │ continuation)
      if (!next.startsWith(prefix) || next.startsWith(prefix.replace(/\s*$/, '').slice(0, -4))) {
        // could be end of parent block
        if (next.trim().startsWith('└') || next.trim().startsWith('├')) {
          // same or shallower level — no more siblings
          break;
        }
      }
    }

    if (!hasNextSibling) {
      issues.push(
        issue(
          'L02',
          'error',
          baseLineNum + li,
          prefixLen + 1,
          `Last tree child uses '├──' but should use '└──'`,
          `Replace '├──' with '└──' for the last child in each group`,
        ),
      );
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// L03 — Arrow style
// Only ONE arrow style allowed per diagram.
// Allowed styles: -->, →, ─→, ──>, and seq-msg family (->> / -->>)
//
// Sequence family: ->> (sync call) and -->> (return) are two variants of ONE
// logical style. Both map to name 'seq-msg' so a normal sequence diagram that
// uses both does NOT trigger L03 mixed-styles.
//
// Pattern order matters — longest / most-specific first so that -->> is
// matched before --> (which would otherwise eat the first two dashes).
//
// Mixing seq-msg with flow arrows (e.g. -->) IS flagged as mixed styles;
// the two families represent fundamentally different diagram idioms.
// ---------------------------------------------------------------------------
const ARROW_PATTERNS: { name: string; re: RegExp }[] = [
  // seq-msg family: -->> first (return), then ->> (sync call, not tail of -->>)
  { name: 'seq-msg', re: /-{2}>>/ },
  { name: 'seq-msg', re: /(?<!-)->>/ }, // ->> not preceded by - (so it isn't the tail of -->>)
  // flow arrows — --> must exclude --> that is the head of -->> (handled by seq-msg above),
  // but since seq-msg is checked first and found.set() guards duplicates, we only need to
  // avoid counting -->> as --> which the seq-msg pattern already captures.
  // The (?!>) lookahead ensures --> inside -->> isn't double-counted as a flow arrow.
  { name: '-->', re: /-{2}>(?!>)/ },
  { name: '→', re: /(?<![─-])→/ },
  { name: '─→', re: /─→/ },
  { name: '──>', re: /──>/ },
];

export function L03_arrow_style(ast: ASTNode): Issue[] {
  if (ast.content.length === 0) return [];

  const content = ast.content;
  const lines = content.split('\n');
  const baseLineNum = ast.startLine;

  // Collect which arrow styles appear and on which lines
  const found = new Map<string, number>(); // style name -> first line number (1-based relative to doc)

  for (const [li, line] of lines.entries()) {
    const docLine = baseLineNum + li;

    for (const { name, re } of ARROW_PATTERNS) {
      if (re.test(line) && !found.has(name)) {
        found.set(name, docLine);
      }
    }
  }

  if (found.size <= 1) return []; // 0 or 1 style — OK

  // Multiple styles found — report on the second+ style
  const styles = [...found.entries()];
  const firstStyle = styles[0]?.[0] ?? '';
  return styles
    .slice(1)
    .map(([name, lineNum]) =>
      issue(
        'L03',
        'error',
        lineNum,
        1,
        `Mixed arrow styles: diagram uses '${firstStyle}' and '${name}' — pick one style`,
        `Use a single arrow style throughout the diagram (e.g. '${firstStyle}' only)`,
      ),
    );
}

// ---------------------------------------------------------------------------
// L04 — Column widths (markdown table consistency)
// Rows | col | col | must have same column count
// Separator |---|---| must match column count
// ---------------------------------------------------------------------------
export function L04_column_widths(ast: ASTNode): Issue[] {
  if (ast.content.length === 0) return [];

  const content = ast.content;
  if (!content.includes('|')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;

  // Find table-like rows: lines starting with | AND that look like markdown table rows
  // Exclude lines that are just diagram connectors (| as vertical bar in flow diagrams)
  // A proper table row: starts with |, has at least one cell with a word char, multiple pipes
  const tableLines = lines.flatMap((line, li) => {
    const pipeCount = (line.match(/\|/g) ?? []).length;
    const isTableRow =
      /^\s*\|/.test(line) &&
      pipeCount >= 2 &&
      (/\w/.test(line) || /^\s*\|[\s\-|:]+\|\s*$/.test(line));
    return isTableRow ? [{ li, line }] : [];
  });

  if (tableLines.length < 2) return [];

  // Count columns per row by splitting on |
  function countCols(line: string): number {
    // Split on unescaped pipes only: a `\|` inside a cell is GFM-escaped content,
    // not a column boundary. Splitting on a bare `|` over-counts and flags valid
    // tables as malformed.
    const parts = line.split(/(?<!\\)\|/);
    // Remove leading/trailing empty strings from the outer pipes
    const start = (parts[0] ?? '').trim() === '' ? 1 : 0;
    const end = (parts.at(-1) ?? '').trim() === '' ? parts.length - 1 : parts.length;
    return end - start;
  }

  // Determine reference column count (from first non-separator row)
  function isSeparatorRow(line: string): boolean {
    return /^\s*\|[\s\-|:]+\|?\s*$/.test(line);
  }

  const referenceIndex = tableLines.findIndex(({ line }) => !isSeparatorRow(line));
  const reference = tableLines[referenceIndex];
  if (reference === undefined) return [];
  const refCols = countCols(reference.line);

  return tableLines.slice(referenceIndex + 1).flatMap(({ li, line }) => {
    const cols = countCols(line);
    if (cols === refCols) return [];
    const what = isSeparatorRow(line) ? 'separator' : 'row';
    return [
      issue(
        'L04',
        'error',
        baseLineNum + li,
        1,
        `Table ${what} has ${cols} columns but header has ${refCols} columns`,
        `Ensure all table rows and separators have ${refCols} columns`,
      ),
    ];
  });
}

// ---------------------------------------------------------------------------
// L05 — Flow integrity
// Two [Box] tokens on same line require an explicit connection between them.
// Connections may be directed or intentionally undirected.
// ---------------------------------------------------------------------------
const BARE_CONNECTION_RE = /^\s*(?:(?:<-+>|<-+|-+>{1,2})|(?:←|↔|→|─+(?:→|>))|-{2,})\s*$/;

const CONNECTION_PREFIX_RE = /^<?-{2,}/;

// Try each dash run once, including in malformed connections with many runs.
const CONNECTION_SUFFIX_RE = /(?<!-)-{2,}>?$/;

const INVALID_CONNECTION_LABEL_RE = /[\r\n\u2028\u2029]|<-|->|←|↔|→|─>/;

const PARALLEL_BRANCH_COLUMN_RE = /^\s{3,}\+-{2}>\s*$/;

function isCompleteConnection(value: string): boolean {
  if (BARE_CONNECTION_RE.test(value)) return true;
  const connection = value.trim();
  const prefix = CONNECTION_PREFIX_RE.exec(connection)?.[0];
  const suffix = CONNECTION_SUFFIX_RE.exec(connection);
  if (prefix === undefined || suffix === null) return false;

  const gap = connection.slice(prefix.length, suffix.index);
  const label = gap.trim();
  if (label.length > 0) return !INVALID_CONNECTION_LABEL_RE.test(label);

  // Preserve dash-only captures when the boundary has a spare dash. The old
  // match preferred whitespace to a leading dash unless dot could not match it.
  return (
    suffix[0].startsWith('---') || (prefix.endsWith('---') && !/[^\r\n\u2028\u2029]/.test(gap))
  );
}

export function L05_flow_integrity(ast: ASTNode): Issue[] {
  if (ast.content.length === 0) return [];

  const content = ast.content;
  if (!content.includes('[')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;
  return lines.flatMap((line, li) => {
    const labels = [...boxes(line)];

    if (labels.length < 2) return [];

    // Check between each consecutive pair of boxes
    const hasViolation = labels.slice(0, -1).some((currentBox, bi) => {
      const nextBox = labels[bi + 1];
      if (nextBox === undefined) return false;
      const curEnd = currentBox.end;
      const nextStart = nextBox.start;
      const between = line.slice(curEnd, nextStart);

      // If between region is pure whitespace (≥3 spaces), treat as parallel layout (not connected)
      // Parallel layout means boxes are in separate columns, not sequentially connected
      if (/^\s{3,}$/.test(between) || PARALLEL_BRANCH_COLUMN_RE.test(between)) return false;

      // Between region has content but is not one complete connection — violation.
      return !isCompleteConnection(between);
    });

    return hasViolation
      ? [
          issue(
            'L05',
            'error',
            baseLineNum + li,
            (labels[0]?.start ?? 0) + 1,
            `${labels.length} boxes on same line with no connection between them: ${labels.map(({ start, end }) => line.slice(start, end)).join(', ')}`,
            `Add a connection (for example --, -->, or →) between consecutive boxes`,
          ),
        ]
      : [];
  });
}

// ---------------------------------------------------------------------------
// L06 — Priority scale
// If ▲ appears, ▼ must also appear (and vice versa)
// ---------------------------------------------------------------------------
export function L06_priority_scale(ast: ASTNode): Issue[] {
  if (ast.content.length === 0) return [];

  const content = ast.content;
  const hasUp = /^[\s]*▲\s+\S/m.test(content);
  const hasDown = /^[\s]*▼\s+\S/m.test(content);

  if (hasUp === hasDown) return []; // both present or both absent — OK

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;
  // Find the line with the existing marker
  return lines
    .flatMap((line, li) => {
      const upMatch = /^(\s*)▲\s+\S/.exec(line);
      if (hasUp && upMatch) {
        return [
          issue(
            'L06',
            'warn',
            baseLineNum + li,
            (upMatch[1] ?? '').length + 1,
            `Priority scale has '▲' but missing '▼' — scales require both ends`,
            `Add a '▼' marker to indicate the low end of the priority scale`,
          ),
        ];
      }
      const downMatch = /^(\s*)▼\s+\S/.exec(line);
      if (hasDown && downMatch) {
        return [
          issue(
            'L06',
            'warn',
            baseLineNum + li,
            (downMatch[1] ?? '').length + 1,
            `Priority scale has '▼' but missing '▲' — scales require both ends`,
            `Add a '▲' marker to indicate the high end of the priority scale`,
          ),
        ];
      }
      return [];
    })
    .slice(0, 1);
}

// ---------------------------------------------------------------------------
// L07 — No mermaid + ASCII mix
// If ``` mermaid ``` block exists alongside ASCII diagram, flag.
// This rule operates on fullText, not a single AST node.
// ---------------------------------------------------------------------------
// Labels can span line breaks. Only the gaps on either side of the arrow
// must be on one line. A nested opening can also start the right label.
function hasAsciiFlow(text: string): boolean {
  const labels = boxes(text);
  let next = labels.next();
  const lastClose = text.lastIndexOf(']');
  let left = false;
  let arrow = false;
  for (let i = 0; i < lastClose; i++) {
    if (next.done !== true && next.value.end === i) {
      left = true;
      next = labels.next();
    }
    const ch = text[i];
    if (ch === '[' && arrow && text[i + 1] !== ']') return true;
    if (ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029') {
      left = false;
      arrow = false;
    } else if (left && text.startsWith('-->', i)) {
      arrow = true;
    }
  }
  return false;
}

export function L07_no_mermaid_mix(fullText: string): Issue[] {
  if (!fullText) return [];

  // Mermaid must be a real opening fence at the start of a line — not a
  // `\`\`\`mermaid` mention in prose or inline code, which would warn on any
  // answer that merely references mermaid next to an ASCII diagram.
  const lines = fullText.split('\n');
  const mermaidIdx = lines.findIndex((l) => /^\s*```+\s*mermaid\b/i.test(l));
  if (mermaidIdx === -1) return [];

  // Check for ASCII diagram indicators
  const hasAsciiBoxDrawing = /[┌┐└┘─│├┤┬┴┼→←↑↓▲▼]/.test(fullText);
  const hasTree = /[├└]──/.test(fullText);

  if (!hasAsciiBoxDrawing && !hasTree && !hasAsciiFlow(fullText)) return [];

  const mermaidLine = mermaidIdx + 1;

  return [
    issue(
      'L07',
      'warn',
      mermaidLine,
      1,
      `Response mixes Mermaid (line ${mermaidLine}) and ASCII diagrams — use one format only`,
      `Remove the \`\`\`mermaid block and use ASCII diagrams throughout`,
    ),
  ];
}
