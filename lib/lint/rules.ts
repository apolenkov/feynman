// lib/lint/rules.ts — lint rules for ASCII diagrams
// Each rule: (ast: ASTNode, fullText: string) => Issue[]
// Issue: {rule, severity, line, column, message, suggestion?}
// Zero deps. ESM only.

import { visualCharacters, visualWidth, firstVisualColumnOf, lastVisualColumnOf } from './width.ts';
import { iterateFrames } from './frames.ts';
import { STATE_MARKER_RE } from './markers.ts';

export interface Issue {
  readonly rule: string;
  readonly severity: 'error' | 'warn';
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly suggestion?: string;
  readonly token?: string;
}

export interface ASTNode {
  readonly type: string;
  readonly content: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly indent: number;
}

/**
 * Create an issue object
 * @param {string} rule - e.g. 'L01'
 * @param {'error'|'warn'} severity
 * @param {number} line - 1-based
 * @param {number} column - 1-based
 * @param {string} message
 * @param {string} [suggestion]
 * @returns {Issue}
 */
function issue(
  rule: string,
  severity: 'error' | 'warn',
  line: number,
  column: number,
  message: string,
  suggestion?: string,
): Issue {
  return {
    rule,
    severity,
    line,
    column,
    message,
    ...(suggestion === undefined || suggestion.length === 0 ? {} : { suggestion }),
  };
}

// ---------------------------------------------------------------------------
// L01 — Box closure
// Every ┌ must have a matching └ at the same column.
// Every ─┐ must have a matching ─┘ at the same column.
// Vertical │ chars must align between top and bottom.
// ---------------------------------------------------------------------------
export function L01_box_closure(ast: ASTNode): Issue[] {
  if (!ast.content) return [];

  const lines = ast.content.split('\n');
  // Don't run on diagrams with no box chars
  if (!ast.content.includes('┌') && !ast.content.includes('─┐') && !ast.content.includes('┐')) {
    return [];
  }

  const baseLineNum = ast.startLine;

  // Find all top-left corners (┌) and their columns
  // Also find top-right corners (┐) and bottom corners (└, ┘)
  // We track "open" top corners and look for matching bottoms

  // Collect positions of each corner type
  const corners = lines.flatMap((line, lineIndex) =>
    visualCharacters(line)
      .filter(({ character }) => /[┌┐└┘]/u.test(character))
      .map(({ character, column, sourceColumn }) => ({
        character,
        line: baseLineNum + lineIndex,
        visualCol: column,
        col: sourceColumn,
      })),
  );
  const topLefts = corners.filter(({ character }) => character === '┌');
  const topRights = corners.filter(({ character }) => character === '┐');
  const botLefts = corners.filter(({ character }) => character === '└');
  const botRights = corners.filter(({ character }) => character === '┘');

  // Check: every ┌ must have a └ at the same column
  const unclosedLeftIssues = topLefts.flatMap((tl) =>
    botLefts.some((bl) => bl.visualCol === tl.visualCol && bl.line > tl.line)
      ? []
      : [
          issue(
            'L01',
            'error',
            tl.line,
            tl.col,
            `Unclosed box: '┌' at line ${tl.line}, col ${tl.col} has no matching '└' at same column`,
            'Add a closing └ at the same column position',
          ),
        ],
  );

  // Check: every └ must have a ┌ at the same column
  const orphanLeftIssues = botLefts.flatMap((bl) =>
    topLefts.some((tl) => tl.visualCol === bl.visualCol && tl.line < bl.line)
      ? []
      : [
          issue(
            'L01',
            'error',
            bl.line,
            bl.col,
            `Orphan closing '└' at line ${bl.line}, col ${bl.col} has no matching '┌' at same column`,
            'Add an opening ┌ at the same column position',
          ),
        ],
  );

  // Check: every ┐ must have a ┘ at the same column
  const unclosedRightIssues = topRights.flatMap((tr) =>
    botRights.some((br) => br.visualCol === tr.visualCol && br.line > tr.line)
      ? []
      : [
          issue(
            'L01',
            'error',
            tr.line,
            tr.col,
            `Unclosed box: '┐' at line ${tr.line}, col ${tr.col} has no matching '┘' at same column`,
            'Add a closing ┘ at the same column position',
          ),
        ],
  );

  // Check: every ┘ must have a ┐ at the same column
  const orphanRightIssues = botRights.flatMap((br) =>
    topRights.some((tr) => tr.visualCol === br.visualCol && tr.line < br.line)
      ? []
      : [
          issue(
            'L01',
            'error',
            br.line,
            br.col,
            `Orphan closing '┘' at line ${br.line}, col ${br.col} has no matching '┐' at same column`,
            'Add an opening ┐ at the same column position',
          ),
        ],
  );

  return [...unclosedLeftIssues, ...orphanLeftIssues, ...unclosedRightIssues, ...orphanRightIssues];
}

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
  { name: 'seq-msg', re: /-->>/ },
  { name: 'seq-msg', re: /(?<!-)->>/ }, // ->> not preceded by - (so it isn't the tail of -->>)
  // flow arrows — --> must exclude --> that is the head of -->> (handled by seq-msg above),
  // but since seq-msg is checked first and found.set() guards duplicates, we only need to
  // avoid counting -->> as --> which the seq-msg pattern already captures.
  // The (?!>) lookahead ensures --> inside -->> isn't double-counted as a flow arrow.
  { name: '-->', re: /-->(?!>)/ },
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
const BOX_RE = /\[[^\]]+\]/g;
const BARE_CONNECTION_RE = /^\s*(?:(?:<-+>|<-+|-+>{1,2})|(?:←|↔|→|─+(?:→|>))|-{2,})\s*$/;
// Labels may be compact (`--request-->`) or spaced (`-- load > 8 -->`). The
// boundary arrowheads carry direction; arrow tokens inside the label are invalid.
const LABELED_CONNECTION_RE = /^\s*<?-{2,}\s*(.+?)\s*-{2,}>?\s*$/;
const ARROW_TOKEN_RE = /<-|->|←|↔|→|─+(?:→|>)/;
const PARALLEL_BRANCH_COLUMN_RE = /^\s{3,}\+-->\s*$/;

function isCompleteConnection(value: string): boolean {
  if (BARE_CONNECTION_RE.test(value)) return true;
  const label = LABELED_CONNECTION_RE.exec(value)?.[1]?.trim();
  return label !== undefined && label.length > 0 && !ARROW_TOKEN_RE.test(label);
}

export function L05_flow_integrity(ast: ASTNode): Issue[] {
  if (ast.content.length === 0) return [];

  const content = ast.content;
  if (!content.includes('[')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;
  return lines.flatMap((line, li) => {
    const boxes = [...line.matchAll(BOX_RE)];

    if (boxes.length < 2) return [];

    // Check between each consecutive pair of boxes
    const hasViolation = boxes.slice(0, -1).some((currentBox, bi) => {
      const nextBox = boxes[bi + 1];
      if (nextBox === undefined) return false;
      const curEnd = currentBox.index + currentBox[0].length;
      const nextStart = nextBox.index;
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
            (boxes[0]?.index ?? 0) + 1,
            `${boxes.length} boxes on same line with no connection between them: ${boxes.map((m) => m[0]).join(', ')}`,
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
  const hasAsciiFlow = /\[[^\]]+\].*(?:-->|→).*\[[^\]]+\]/.test(fullText);
  const hasTree = /[├└]──/.test(fullText);

  if (!hasAsciiBoxDrawing && !hasAsciiFlow && !hasTree) return [];

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

// ---------------------------------------------------------------------------
// L08 — Frame width discipline
// All rows inside ┌─...─┐ frame have consistent display width
// ---------------------------------------------------------------------------
export function L08_frame_width(ast: ASTNode): Issue[] {
  if (ast.content.length === 0) return [];

  const content = ast.content;
  if (!content.includes('┌')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;
  const issues: Issue[] = [];

  let frameStartLine = 0;
  let frameWidth: number | null = null;

  for (const [li, line] of lines.entries()) {
    const docLine = baseLineNum + li;

    // Detect frame open line (contains ┌ and ┐)
    if (frameWidth === null && line.includes('┌') && line.includes('┐')) {
      frameStartLine = docLine;
      frameWidth = visualWidth(line.trimEnd());
      continue;
    }

    if (frameWidth !== null) {
      // Detect frame close line (contains └ and ┘)
      if (line.includes('└') && line.includes('┘')) {
        const closeWidth = visualWidth(line.trimEnd());
        if (closeWidth !== frameWidth) {
          issues.push(
            issue(
              'L08',
              'error',
              docLine,
              1,
              `Frame close row width ${closeWidth} differs from frame open width ${frameWidth} (line ${frameStartLine})`,
              `Make all frame rows the same display width`,
            ),
          );
        }
        frameWidth = null;
        continue;
      }

      // Check internal row width
      // Internal rows may have │ at start and end, or be content lines
      if (line.includes('│')) {
        const rowWidth = visualWidth(line.trimEnd());
        if (rowWidth !== frameWidth) {
          issues.push(
            issue(
              'L08',
              'error',
              docLine,
              1,
              `Frame row width ${rowWidth} differs from frame header width ${frameWidth} (line ${frameStartLine})`,
              `Make all frame rows the same display width`,
            ),
          );
        }
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// L09 — Right-edge alignment (severity: error)
// For each frame, the closing │ on every inner row and the bottom ┘ MUST land
// at the same VISUAL column as the top ┐. ANSI escapes, combining marks, and
// zero-width joiners are stripped before column comparison; CJK wide chars
// count as 2 cols (shared with L08 via lib/lint/width.ts).
// ---------------------------------------------------------------------------
export function L09_right_edge_alignment(ast: ASTNode): Issue[] {
  if (ast.content.length === 0) return [];
  const content = ast.content;
  if (!content.includes('┌')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;
  const issues: Issue[] = [];

  let li = 0;
  while (li < lines.length) {
    const topLine = lines[li] ?? '';
    // A frame opens on a line that contains both ┌ and ┐
    if (topLine.includes('┌') && topLine.includes('┐')) {
      const anchorTopCol = firstVisualColumnOf(topLine, '┌');
      const anchorCol = lastVisualColumnOf(topLine, '┐');
      const topAbsLine = baseLineNum + li;

      // Find the matching close: first subsequent line where └ is at the same
      // visual column as ┌ AND the line contains ┘.
      let closeLi = -1;
      for (let lj = li + 1; lj < lines.length; lj++) {
        const candidate = lines[lj] ?? '';
        if (!candidate.includes('└') || !candidate.includes('┘')) continue;
        const candidateLeftCol = firstVisualColumnOf(candidate, '└');
        if (candidateLeftCol === anchorTopCol) {
          closeLi = lj;
          break;
        }
      }

      if (closeLi === -1) {
        // Frame never closes — skip silently (L01 already flags this).
        li++;
        continue;
      }

      // Inner rows: strictly between top and close
      for (let lj = li + 1; lj < closeLi; lj++) {
        const innerLine = lines[lj] ?? '';
        if (!innerLine.includes('│')) continue; // skip decorative gap lines
        const actualCol = lastVisualColumnOf(innerLine, '│');
        if (actualCol !== anchorCol) {
          issues.push(
            issue(
              'L09',
              'error',
              baseLineNum + lj,
              anchorCol,
              `Frame inner row '│' at col ${actualCol} does not align with top '┐' at col ${anchorCol} (line ${topAbsLine})`,
              `Pad or trim the row so the closing │/┘ lands at column ${anchorCol}`,
            ),
          );
        }
      }

      // Bottom corner: ┘ column must match anchorCol
      const closeLine = lines[closeLi] ?? '';
      const actualBotCol = lastVisualColumnOf(closeLine, '┘');
      if (actualBotCol !== anchorCol) {
        issues.push(
          issue(
            'L09',
            'error',
            baseLineNum + closeLi,
            anchorCol,
            `Frame bottom '┘' at col ${actualBotCol} does not align with top '┐' at col ${anchorCol} (line ${topAbsLine})`,
            `Pad or trim the row so the closing │/┘ lands at column ${anchorCol}`,
          ),
        );
      }

      // Advance past the closed frame so we can detect a stacked sibling frame next.
      li = closeLi + 1;
      continue;
    }
    li++;
  }

  return issues;
}

// ---------------------------------------------------------------------------
// L10 — mixed-script (Cyrillic + Latin within one word)
// ---------------------------------------------------------------------------
// Severity: warn (not error). Hyphenated kebab-case tokens, numeric-suffixed
// idents are whitelisted. Operates on raw text, not AST — runs in addition to other
// rules without disturbing them.

export function L10_mixed_script(textOrAst: string | ASTNode | null | undefined): Issue[] {
  // Accept both raw text and AST shapes — most callers in this file pass the
  // AST that the harness built; some pass plain text via fixtures harness.
  const text = typeof textOrAst === 'string' ? textOrAst : (textOrAst?.content ?? '');
  const lineOffset = typeof textOrAst === 'string' ? 0 : (textOrAst?.startLine ?? 1) - 1;
  const lines = text.split('\n');
  // Word = run of letters/digits/_/-, including Cyrillic via \p{L}.
  const tokenRe = /[\p{L}\p{N}_-]+/gu;
  return lines.flatMap((line, i) =>
    Array.from(line.matchAll(tokenRe)).flatMap((m) => {
      const token = m[0];
      // Hyphenated kebab tokens are project identifiers (worktree-agent-X,
      // gsd-sdk, etc.) — whitelist regardless of script.
      if (token.includes('-')) return [];
      // Numeric-suffixed alpha (foo123) — code identifier, whitelist.
      if (/^[A-Za-zА-Яа-яЁё]+\d+$/.test(token)) return [];
      const hasCyr = /[А-Яа-яЁё]/.test(token);
      const hasLat = /[A-Za-z]/.test(token);
      return hasCyr && hasLat
        ? [
            {
              rule: 'L10',
              line: lineOffset + i + 1,
              column: m.index + 1,
              severity: 'warn',
              token,
              message: `mixed-script token: ${token}`,
            },
          ]
        : [];
    }),
  );
}

// ---------------------------------------------------------------------------
// L11 — Overdecoration (frame for ≤5 items)
// Severity: warn. Trigger-table prescribes dot-leader for ≤5 items; frame
// wastes ~50% on padding/borders. Whitelist: nested tree (├──/└──) or
// embedded table column (≥3 │ chars on a single inner line) inside the frame.
// ---------------------------------------------------------------------------
export function L11_overdecoration(ast: ASTNode): Issue[] {
  if (ast.content.length === 0) return [];
  const content = ast.content;
  if (!content.includes('┌')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;

  return Array.from(iterateFrames(lines)).flatMap((frame) => {
    const { topLi, closeLi, indent, inner } = frame;
    const top = lines[topLi] ?? '';

    if (closeLi === -1) return [];

    const innerCount = inner.length;
    if (innerCount < 1 || innerCount > 5) return [];

    const hasTree = inner.some((line) => /[├└]──/.test(line));
    const hasEmbeddedTable = inner.some((line) => (line.match(/│/g) ?? []).length >= 3);
    if (hasTree || hasEmbeddedTable) return [];

    const frameChars =
      visualWidth(top) +
      visualWidth(lines[closeLi]) +
      inner.reduce((total, line) => total + visualWidth(line), 0);
    const dotLeaderChars = inner.reduce(
      (total, line) =>
        total +
        visualWidth(
          line
            .replace(/^\s*│/, '')
            .replace(/\s*│\s*$/, '')
            .trim(),
        ) +
        1,
      0,
    );
    const saving = Math.max(0, frameChars - dotLeaderChars);

    return [
      issue(
        'L11',
        'warn',
        baseLineNum + topLi,
        indent.length + 1,
        `frame used for ${innerCount} items; consider dot-leader list (saves ~${saving} chars)`,
        `Replace frame with dot-leader list — see docs/lint-rules.md#l11`,
      ),
    ];
  });
}

// ---------------------------------------------------------------------------
// L12 — Token budget (padding-dominated visual)
// Severity: warn. For each frame, compute padding/content ratio. Warn if
// padding_chars > content_chars. estimateFrameCost is exported for the
// --explain CLI flag (Plan 09-05).
// ---------------------------------------------------------------------------

export interface FrameCost {
  readonly framing_chars: number;
  readonly content_chars: number;
  readonly border_chars: number;
  readonly padding_chars: number;
  readonly dotleader_equivalent: number;
  readonly saving: number;
}

export interface FrameNode {
  readonly top?: string;
  readonly bottom?: string;
  readonly inner?: readonly string[];
}

/**
 * Estimate token-cost breakdown of a single frame block.
 * Used by L12 detection AND by the --explain CLI flag (Plan 09-05).
 * @param {{top:string, inner:string[], bottom:string}} node
 * @returns {FrameCost}
 */
export function estimateFrameCost(node: FrameNode): FrameCost {
  const top = node.top ?? '';
  const bottom = node.bottom ?? '';
  const inner = node.inner ?? [];

  const border_chars = visualWidth(top) + visualWidth(bottom);

  const { content_chars, inner_chars } = inner.reduce(
    (totals, line) => ({
      inner_chars: totals.inner_chars + visualWidth(line),
      content_chars:
        totals.content_chars +
        visualWidth(
          line
            .replace(/^\s*│/, '')
            .replace(/\s*│\s*$/, '')
            .trim(),
        ),
    }),
    { content_chars: 0, inner_chars: 0 },
  );

  const framing_chars = border_chars + inner_chars;
  const padding_chars = Math.max(0, inner_chars - content_chars);
  const dotleader_equivalent = content_chars + inner.length;
  const saving = Math.max(0, framing_chars - dotleader_equivalent);

  return {
    framing_chars,
    content_chars,
    border_chars,
    padding_chars,
    dotleader_equivalent,
    saving,
  };
}

export function L12_token_budget(ast: ASTNode): Issue[] {
  if (ast.content.length === 0) return [];
  const content = ast.content;
  if (!content.includes('┌')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;

  return Array.from(iterateFrames(lines)).flatMap((frame) => {
    const { topLi, closeLi, indent, inner } = frame;
    const top = lines[topLi] ?? '';

    if (closeLi === -1) return [];

    // Whitelist: tree composition inside frame (consistent with L11)
    if (inner.some((line) => /[├└]──/.test(line))) return [];
    if (inner.length === 0) return [];

    const cost = estimateFrameCost({ top, inner, bottom: lines[closeLi] ?? '' });

    return cost.padding_chars > cost.content_chars
      ? [
          issue(
            'L12',
            'warn',
            baseLineNum + topLi,
            indent.length + 1,
            `frame is padding-dominated (padding=${cost.padding_chars} > content=${cost.content_chars}); consider lighter visual`,
            `Use --explain for full cost breakdown; consider dot-leader or trimmed frame`,
          ),
        ]
      : [];
  });
}

// ---------------------------------------------------------------------------
// L13 — Double wrap (tree inside frame)
// Severity: warn. A tree's indentation already conveys hierarchy; wrapping
// it in a frame adds zero information at full border cost.
// ---------------------------------------------------------------------------
export function L13_double_wrap(ast: ASTNode): Issue[] {
  if (ast.content.length === 0) return [];
  const content = ast.content;
  if (!content.includes('┌')) return [];
  if (!/[├└]──/.test(content)) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;

  return Array.from(iterateFrames(lines)).flatMap((frame) => {
    const { topLi, closeLi, indent } = frame;

    if (closeLi === -1) return [];

    // Check all between-lines (not just │-bearing ones) for tree chars,
    // since L13 cares about any line between top and close.
    const hasTree = lines.slice(topLi + 1, closeLi).some((line) => /[├└]──/.test(line));

    return hasTree
      ? [
          issue(
            'L13',
            'warn',
            baseLineNum + topLi,
            indent.length + 1,
            `tree inside frame block — the tree already conveys hierarchy; drop the frame`,
            `Remove the surrounding ┌─...─┐ / └─...─┘ borders; tree indentation suffices`,
          ),
        ]
      : [];
  });
}

// ---------------------------------------------------------------------------
// L14 — Blank-line separation
// Severity: warn. A fenced ASCII/diagram block should have a blank line before
// and after it (monospace equivalent of vertical margin; improves scannability).
// Only applies to fenced blocks (opening ``` is at startLine-1 in 1-based terms).
// Conservative: only warn on a clear prose-line directly touching the fence.
// Skips: indented/list-adjacent blocks, blocks at file boundaries.
// ---------------------------------------------------------------------------

// Regex: at least one box-drawing, arrow, or tree char in the content.
const DIAGRAM_CHAR_RE = /[┌┐└┘│─├┤┬┴┼]|-->|→|[├└]──/;

// ---------------------------------------------------------------------------
// L15 — Homogeneous frame → plain format
// Severity: warn. A frame whose inner lines are ALL the same content type
// (k:v pairs, bullet list, or plain prose) adds visual weight without
// structural value. autofix --fix can convert to plain text.
// Whitelist: complex frames (nested trees ├──, arrows →/-->, embedded tables
//            with ≥2 inner │ chars) and status frames (← / ✓/✗ markers)
//            which are handled by L11.
// Requires ≥2 inner lines to avoid false-positives on single-item wraps.
// ---------------------------------------------------------------------------
export function L15_homogeneous_frame(ast: ASTNode): Issue[] {
  if (ast.content.length === 0) return [];
  if (!ast.content.includes('┌')) return [];

  const lines = ast.content.split('\n');
  const baseLineNum = ast.startLine;

  return Array.from(iterateFrames(lines)).flatMap((frame) => {
    const { topLi, closeLi, indent } = frame;
    const top = lines[topLi] ?? '';

    if (closeLi === -1) return [];

    // L15 uses startsWith(indent + '│') for inner collection (leading bar only).
    const inner = lines.slice(topLi + 1, closeLi).filter((line) => line.startsWith(indent + '│'));

    if (inner.length < 2) return [];

    // Strip inner lines to bare content for type detection.
    const stripped = inner.map((line) =>
      (indent.length > 0 && line.startsWith(indent) ? line.slice(indent.length) : line)
        .replace(/^│/, '')
        .replace(/\s*│\s*$/, '')
        .trim(),
    );

    // Complex guards — skip (structural frames stay as frames).
    if (stripped.some((l) => /[├└]──/.test(l))) {
      return [];
    }
    if (stripped.some((l) => (l.match(/│/g) ?? []).length >= 2)) {
      return [];
    }
    if (stripped.some((l) => /─→|→|──>|-->/.test(l))) {
      return [];
    }
    // Status frames — let L11 handle.
    if (stripped.every((l) => STATE_MARKER_RE.test(l))) {
      return [];
    }

    // Detect homogeneous content type.
    const type = stripped.every((line) => /^[-•*◦▸▹·]/.test(line))
      ? 'bullet'
      : stripped.every((line) => /^[^:\n]+:\s+\S/.test(line) || /^[^—\n]+—\s+\S/.test(line))
        ? 'kv'
        : stripped.every((line) => line.length >= 2 && !/[├└┬┴┼]/.test(line))
          ? 'prose'
          : null;

    if (type === null) {
      return [];
    }

    // Savings estimate: frame chars vs plain content chars.
    const frameChars =
      visualWidth(top) +
      visualWidth(lines[closeLi]) +
      inner.reduce((acc, l) => acc + visualWidth(l), 0);
    const plainChars = stripped.reduce((acc, l) => acc + l.length, 0);
    const saving = Math.max(0, frameChars - plainChars);

    return [
      issue(
        'L15',
        'warn',
        baseLineNum + topLi,
        indent.length + 1,
        `frame wraps homogeneous ${type} content; consider plain format (saves ~${saving} chars)`,
        'Use feynman-lint --fix to convert to plain text — see docs/lint-rules.md#l15',
      ),
    ];
  });
}

export function L14_blank_line_separation(ast: ASTNode, fullText: string): Issue[] {
  if (ast.content.length === 0) return [];

  // Only fire on diagram blocks with actual diagram chars.
  if (!DIAGRAM_CHAR_RE.test(ast.content)) return [];

  // Indented / list-adjacent blocks: be lenient.
  if (ast.indent > 0) return [];

  const lines = fullText.split('\n');

  // Determine whether this is a fenced block.
  // Parser: startLine = 1-based first content line; opening ``` is at (startLine-1) 1-based
  // = (startLine-2) 0-indexed.
  const openFenceLi = ast.startLine - 2; // 0-indexed
  if (openFenceLi < 0) return []; // startLine <= 1 — can't be a fenced block
  const openFenceLine = lines[openFenceLi]?.trim() ?? '';
  if (openFenceLine !== '```') return []; // not a fenced block — standalone

  // Closing fence is at endLine (1-based) = (endLine-1) 0-indexed.
  // For fenced blocks the parser sets endLine to the line index of the closing ```.
  const closeFenceLi = ast.endLine - 1; // 0-indexed

  // --- Check the line BEFORE the opening fence ---
  const beforeLi = openFenceLi - 1; // 0-indexed
  const beforeIssues = (() => {
    if (beforeLi < 0) return [];
    const line = lines[beforeLi] ?? '';
    const trimmed = line.trim();
    const isExempt =
      trimmed === '' ||
      trimmed.startsWith('```') ||
      /^\s*(?:[-*+]|\d+\.)\s/.test(line) ||
      trimmed.startsWith('#');
    return isExempt
      ? []
      : [
          issue(
            'L14',
            'warn',
            openFenceLi + 1, // 1-based line of opening fence
            1,
            'diagram block should be separated from surrounding text by a blank line',
            'add a blank line before the opening ``` fence',
          ),
        ];
  })();

  // --- Check the line AFTER the closing fence ---
  const afterLi = closeFenceLi + 1; // 0-indexed
  const afterIssues = (() => {
    if (afterLi >= lines.length) return [];
    const line = lines[afterLi] ?? '';
    const trimmed = line.trim();
    const isExempt =
      trimmed === '' ||
      trimmed.startsWith('```') ||
      /^\s*(?:[-*+]|\d+\.)\s/.test(line) ||
      trimmed.startsWith('#');
    return isExempt
      ? []
      : [
          issue(
            'L14',
            'warn',
            closeFenceLi + 1, // 1-based line of closing fence
            1,
            'diagram block should be separated from surrounding text by a blank line',
            'add a blank line after the closing ``` fence',
          ),
        ];
  })();

  return [...beforeIssues, ...afterIssues];
}
