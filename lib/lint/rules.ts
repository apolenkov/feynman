// lib/lint/rules.ts — 8 lint rules for ASCII diagrams
// Each rule: (ast: ASTNode, fullText: string) => Issue[]
// Issue: {rule, severity, line, column, message, suggestion?}
// Zero deps. ESM only.

import { visualWidth, firstVisualColumnOf, lastVisualColumnOf } from './width.ts';
import { createRequire } from 'node:module';

export interface Issue {
  rule: string;
  severity: 'error' | 'warn';
  line: number;
  column: number;
  message: string;
  suggestion?: string;
  token?: string;
}

export interface ASTNode {
  type: string;
  content: string;
  startLine: number;
  endLine: number;
  indent: number;
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
function issue(rule: string, severity: 'error' | 'warn', line: number, column: number, message: string, suggestion?: string): Issue {
  const obj: Issue = { rule, severity, line, column, message };
  if (suggestion) obj.suggestion = suggestion;
  return obj;
}

// displayWidth was the old per-file helper; superseded by visualWidth from
// ./width.ts, which additionally strips ANSI and combining/ZW chars.
const displayWidth = visualWidth;

// ---------------------------------------------------------------------------
// L01 — Box closure
// Every ┌ must have a matching └ at the same column.
// Every ─┐ must have a matching ─┘ at the same column.
// Vertical │ chars must align between top and bottom.
// ---------------------------------------------------------------------------
export function L01_box_closure(ast: ASTNode): Issue[] {
  if (!ast || !ast.content) return [];

  const lines = ast.content.split('\n');
  // Don't run on diagrams with no box chars
  if (!ast.content.includes('┌') && !ast.content.includes('─┐') && !ast.content.includes('┐')) {
    return [];
  }

  const issues: Issue[] = [];
  const baseLineNum = ast.startLine;

  // Find all top-left corners (┌) and their columns
  // Also find top-right corners (┐) and bottom corners (└, ┘)
  // We track "open" top corners and look for matching bottoms

  // Collect positions of each corner type
  const topLefts: Array<{line: number, col: number, charIdx: number}> = [];
  const topRights: Array<{line: number, col: number, charIdx: number}> = [];
  const botLefts: Array<{line: number, col: number, charIdx: number}> = [];
  const botRights: Array<{line: number, col: number, charIdx: number}> = [];

  for (let li = 0; li < lines.length; li++) {
    const ln = lines[li]!;
    for (let ci = 0; ci < ln.length; ci++) {
      const ch = ln[ci]!;
      if (ch === '┌') topLefts.push({ line: baseLineNum + li, col: ci + 1, charIdx: ci });
      else if (ch === '┐') topRights.push({ line: baseLineNum + li, col: ci + 1, charIdx: ci });
      else if (ch === '└') botLefts.push({ line: baseLineNum + li, col: ci + 1, charIdx: ci });
      else if (ch === '┘') botRights.push({ line: baseLineNum + li, col: ci + 1, charIdx: ci });
    }
  }

  // Check: every ┌ must have a └ at the same column
  for (const tl of topLefts) {
    const match = botLefts.find(bl => bl.col === tl.col && bl.line > tl.line);
    if (!match) {
      issues.push(issue(
        'L01', 'error', tl.line, tl.col,
        `Unclosed box: '┌' at line ${tl.line}, col ${tl.col} has no matching '└' at same column`,
        'Add a closing └ at the same column position'
      ));
    }
  }

  // Check: every └ must have a ┌ at the same column
  for (const bl of botLefts) {
    const match = topLefts.find(tl => tl.col === bl.col && tl.line < bl.line);
    if (!match) {
      issues.push(issue(
        'L01', 'error', bl.line, bl.col,
        `Orphan closing '└' at line ${bl.line}, col ${bl.col} has no matching '┌' at same column`,
        'Add an opening ┌ at the same column position'
      ));
    }
  }

  // Check: every ┐ must have a ┘ at the same column
  for (const tr of topRights) {
    const match = botRights.find(br => br.col === tr.col && br.line > tr.line);
    if (!match) {
      issues.push(issue(
        'L01', 'error', tr.line, tr.col,
        `Unclosed box: '┐' at line ${tr.line}, col ${tr.col} has no matching '┘' at same column`,
        'Add a closing ┘ at the same column position'
      ));
    }
  }

  // Check: every ┘ must have a ┐ at the same column
  for (const br of botRights) {
    const match = topRights.find(tr => tr.col === br.col && tr.line < br.line);
    if (!match) {
      issues.push(issue(
        'L01', 'error', br.line, br.col,
        `Orphan closing '┘' at line ${br.line}, col ${br.col} has no matching '┐' at same column`,
        'Add an opening ┐ at the same column position'
      ));
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// L02 — Tree chars
// Last child must use └── not ├──
// Detect: line with ├── where the NEXT tree-level sibling doesn't exist
// (i.e. ├── is used as the last item in its group)
// ---------------------------------------------------------------------------
export function L02_tree_chars(ast: ASTNode): Issue[] {
  if (!ast || !ast.content) return [];

  const content = ast.content;
  // Skip if no tree chars at all
  if (!content.includes('├') && !content.includes('└')) return [];

  const lines = content.split('\n');
  const issues: Issue[] = [];
  const baseLineNum = ast.startLine;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;

    // Check for ├── lines
    const miteeMatch = line.match(/^(\s*(?:│\s*)*)├──/);
    if (!miteeMatch) continue;

    // This line uses ├──. Now check if it should be └──.
    // The rule: if this is the LAST sibling at its indent level, it's wrong.
    // Determine the indent prefix (everything before ├)
    const prefixLen = miteeMatch[0].length - 3; // length without '├──'
    const prefix = line.slice(0, prefixLen); // e.g. "    │   "

    // Look for subsequent sibling lines: same prefix + (├── or └──)
    let hasNextSibling = false;
    for (let lj = li + 1; lj < lines.length; lj++) {
      const next = lines[lj]!;
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
      issues.push(issue(
        'L02', 'error', baseLineNum + li, prefixLen + 1,
        `Last tree child uses '├──' but should use '└──'`,
        `Replace '├──' with '└──' for the last child in each group`
      ));
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// L03 — Arrow style
// Only ONE arrow style allowed per diagram.
// Allowed styles: -->, →, ─→, ──>
// ---------------------------------------------------------------------------
const ARROW_PATTERNS: Array<{name: string, re: RegExp}> = [
  { name: '→',   re: /(?<![─-])→/ },
  { name: '-->',  re: /-->/ },
  { name: '─→',  re: /─→/ },
  { name: '──>', re: /──>/ },
];

export function L03_arrow_style(ast: ASTNode): Issue[] {
  if (!ast || !ast.content) return [];

  const content = ast.content;
  const lines = content.split('\n');
  const baseLineNum = ast.startLine;

  // Collect which arrow styles appear and on which lines
  const found = new Map<string, number>(); // style name -> first line number (1-based relative to doc)

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
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
  const firstStyle = styles[0]![0];
  const issues: Issue[] = [];

  for (let si = 1; si < styles.length; si++) {
    const [name, lineNum] = styles[si]!;
    issues.push(issue(
      'L03', 'error', lineNum, 1,
      `Mixed arrow styles: diagram uses '${firstStyle}' and '${name}' — pick one style`,
      `Use a single arrow style throughout the diagram (e.g. '${firstStyle}' only)`
    ));
  }

  return issues;
}

// ---------------------------------------------------------------------------
// L04 — Column widths (markdown table consistency)
// Rows | col | col | must have same column count
// Separator |---|---| must match column count
// ---------------------------------------------------------------------------
export function L04_column_widths(ast: ASTNode): Issue[] {
  if (!ast || !ast.content) return [];

  const content = ast.content;
  if (!content.includes('|')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;

  // Find table-like rows: lines starting with | AND that look like markdown table rows
  // Exclude lines that are just diagram connectors (| as vertical bar in flow diagrams)
  // A proper table row: starts with |, has at least one cell with a word char, multiple pipes
  const tableLines: Array<{li: number, line: string}> = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    // Must start with optional whitespace then |
    if (!/^\s*\|/.test(line)) continue;
    // Must have at least 2 pipe chars (i.e. at least one cell between them)
    const pipeCount = (line.match(/\|/g) || []).length;
    if (pipeCount < 2) continue;
    // Must contain at least one word char (not just dashes/spaces) OR be a separator row
    if (/\w/.test(line) || /^\s*\|[\s\-|:]+\|\s*$/.test(line)) {
      tableLines.push({ li, line });
    }
  }

  if (tableLines.length < 2) return [];

  // Count columns per row by splitting on |
  function countCols(line: string): number {
    // Split by |, trim outer empty strings
    const parts = line.split('|');
    // Remove leading/trailing empty strings from the outer pipes
    let start = 0;
    let end = parts.length;
    if (parts[0]!.trim() === '') start = 1;
    if (parts[parts.length - 1]!.trim() === '') end = parts.length - 1;
    return end - start;
  }

  // Determine reference column count (from first non-separator row)
  function isSeparatorRow(line: string): boolean {
    return /^\s*\|[\s\-|:]+\|?\s*$/.test(line);
  }

  let refCols: number | null = null;
  const issues: Issue[] = [];

  for (const { li, line } of tableLines) {
    const docLine = baseLineNum + li;
    const cols = countCols(line);

    if (refCols === null && !isSeparatorRow(line)) {
      refCols = cols;
      continue;
    }

    if (refCols !== null && cols !== refCols) {
      const what = isSeparatorRow(line) ? 'separator' : 'row';
      issues.push(issue(
        'L04', 'error', docLine, 1,
        `Table ${what} has ${cols} columns but header has ${refCols} columns`,
        `Ensure all table rows and separators have ${refCols} columns`
      ));
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// L05 — Flow integrity
// Two [Box] tokens on same line require an arrow between them
// ---------------------------------------------------------------------------
const BOX_RE = /\[[^\]]+\]/g;
const ARROW_RE = /-->|→|─→|──>/;

export function L05_flow_integrity(ast: ASTNode): Issue[] {
  if (!ast || !ast.content) return [];

  const content = ast.content;
  if (!content.includes('[')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;
  const issues: Issue[] = [];

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    const boxes = [...line.matchAll(BOX_RE)];

    if (boxes.length < 2) continue;

    // Check between each consecutive pair of boxes
    let hasViolation = false;
    for (let bi = 0; bi < boxes.length - 1; bi++) {
      const curEnd   = boxes[bi]!.index! + boxes[bi]![0]!.length;
      const nextStart = boxes[bi + 1]!.index!;
      const between  = line.slice(curEnd, nextStart);

      // If between region is pure whitespace (≥3 spaces), treat as parallel layout (not connected)
      // Parallel layout means boxes are in separate columns, not sequentially connected
      if (/^\s{3,}$/.test(between)) continue;

      // Between region has content but no arrow — violation
      if (!ARROW_RE.test(between)) {
        hasViolation = true;
        break;
      }
    }

    if (hasViolation) {
      issues.push(issue(
        'L05', 'error', baseLineNum + li, boxes[0]!.index! + 1,
        `${boxes.length} boxes on same line with no arrow between them: ${boxes.map(m => m[0]).join(', ')}`,
        `Add an arrow (-->, →) between consecutive boxes`
      ));
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// L06 — Priority scale
// If ▲ appears, ▼ must also appear (and vice versa)
// ---------------------------------------------------------------------------
export function L06_priority_scale(ast: ASTNode): Issue[] {
  if (!ast || !ast.content) return [];

  const content = ast.content;
  const hasUp = /^[\s]*▲\s+\S/m.test(content);
  const hasDown = /^[\s]*▼\s+\S/m.test(content);

  if (hasUp === hasDown) return []; // both present or both absent — OK

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;
  const issues: Issue[] = [];

  // Find the line with the existing marker
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    const upMatch = line.match(/^(\s*)▲\s+\S/);
    if (hasUp && upMatch) {
      issues.push(issue(
        'L06', 'warn', baseLineNum + li, upMatch[1]!.length + 1,
        `Priority scale has '▲' but missing '▼' — scales require both ends`,
        `Add a '▼' marker to indicate the low end of the priority scale`
      ));
      break;
    }
    const downMatch = line.match(/^(\s*)▼\s+\S/);
    if (hasDown && downMatch) {
      issues.push(issue(
        'L06', 'warn', baseLineNum + li, downMatch[1]!.length + 1,
        `Priority scale has '▼' but missing '▲' — scales require both ends`,
        `Add a '▲' marker to indicate the high end of the priority scale`
      ));
      break;
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// L07 — No mermaid + ASCII mix
// If ``` mermaid ``` block exists alongside ASCII diagram, flag.
// This rule operates on fullText, not a single AST node.
// ---------------------------------------------------------------------------
export function L07_no_mermaid_mix(_ast: ASTNode | null, fullText: string): Issue[] {
  // _ast may be null when called for full-text check
  if (!fullText) return [];

  const hasMermaid = /```mermaid/i.test(fullText);
  if (!hasMermaid) return [];

  // Check for ASCII diagram indicators
  const hasAsciiBoxDrawing = /[┌┐└┘─│├┤┬┴┼→←↑↓▲▼]/.test(fullText);
  const hasAsciiFlow = /\[[^\]]+\].*(?:-->|→).*\[[^\]]+\]/.test(fullText);
  const hasTree = /[├└]──/.test(fullText);

  if (!hasAsciiBoxDrawing && !hasAsciiFlow && !hasTree) return [];

  // Find the mermaid block line
  const lines = fullText.split('\n');
  let mermaidLine = 1;
  for (let li = 0; li < lines.length; li++) {
    if (/```mermaid/i.test(lines[li]!)) {
      mermaidLine = li + 1;
      break;
    }
  }

  return [issue(
    'L07', 'warn', mermaidLine, 1,
    `Response mixes Mermaid (line ${mermaidLine}) and ASCII diagrams — use one format only`,
    `Remove the \`\`\`mermaid block and use ASCII diagrams throughout`
  )];
}

// ---------------------------------------------------------------------------
// L08 — Frame width discipline
// All rows inside ┌─...─┐ frame have consistent display width
// ---------------------------------------------------------------------------
export function L08_frame_width(ast: ASTNode): Issue[] {
  if (!ast || !ast.content) return [];

  const content = ast.content;
  if (!content.includes('┌')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;
  const issues: Issue[] = [];

  let inFrame = false;
  let frameStartLine = 0;
  let frameWidth: number | null = null;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    const docLine = baseLineNum + li;

    // Detect frame open line (contains ┌ and ┐)
    if (!inFrame && line.includes('┌') && line.includes('┐')) {
      inFrame = true;
      frameStartLine = docLine;
      frameWidth = displayWidth(line.trimEnd());
      continue;
    }

    if (inFrame) {
      // Detect frame close line (contains └ and ┘)
      if (line.includes('└') && line.includes('┘')) {
        const closeWidth = displayWidth(line.trimEnd());
        if (closeWidth !== frameWidth) {
          issues.push(issue(
            'L08', 'error', docLine, 1,
            `Frame close row width ${closeWidth} differs from frame open width ${frameWidth} (line ${frameStartLine})`,
            `Make all frame rows the same display width`
          ));
        }
        inFrame = false;
        frameWidth = null;
        continue;
      }

      // Check internal row width
      // Internal rows may have │ at start and end, or be content lines
      if (line.includes('│')) {
        const rowWidth = displayWidth(line.trimEnd());
        if (frameWidth !== null && rowWidth !== frameWidth) {
          issues.push(issue(
            'L08', 'error', docLine, 1,
            `Frame row width ${rowWidth} differs from frame header width ${frameWidth} (line ${frameStartLine})`,
            `Make all frame rows the same display width`
          ));
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
  if (!ast || !ast.content) return [];
  const content = ast.content;
  if (!content.includes('┌')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;
  const issues: Issue[] = [];

  let li = 0;
  while (li < lines.length) {
    const topLine = lines[li]!;
    // A frame opens on a line that contains both ┌ and ┐
    if (topLine.includes('┌') && topLine.includes('┐')) {
      const anchorTopCol = firstVisualColumnOf(topLine, '┌');
      const anchorCol    = lastVisualColumnOf(topLine, '┐');
      const topAbsLine   = baseLineNum + li;

      // Find the matching close: first subsequent line where └ is at the same
      // visual column as ┌ AND the line contains ┘.
      let closeLi = -1;
      for (let lj = li + 1; lj < lines.length; lj++) {
        const candidate = lines[lj]!;
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
        const innerLine = lines[lj]!;
        if (!innerLine.includes('│')) continue; // skip decorative gap lines
        const actualCol = lastVisualColumnOf(innerLine, '│');
        if (actualCol !== anchorCol) {
          issues.push(issue(
            'L09', 'error', baseLineNum + lj, anchorCol,
            `Frame inner row '│' at col ${actualCol} does not align with top '┐' at col ${anchorCol} (line ${topAbsLine})`,
            `Pad or trim the row so the closing │/┘ lands at column ${anchorCol}`
          ));
        }
      }

      // Bottom corner: ┘ column must match anchorCol
      const closeLine = lines[closeLi]!;
      const actualBotCol = lastVisualColumnOf(closeLine, '┘');
      if (actualBotCol !== anchorCol) {
        issues.push(issue(
          'L09', 'error', baseLineNum + closeLi, anchorCol,
          `Frame bottom '┘' at col ${actualBotCol} does not align with top '┐' at col ${anchorCol} (line ${topAbsLine})`,
          `Pad or trim the row so the closing │/┘ lands at column ${anchorCol}`
        ));
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
// idents, and any token appearing in package.json's name/keywords/bin fields
// are whitelisted. Operates on raw text, not AST — runs in addition to other
// rules without disturbing them.

const PKG_TOKENS: Set<string> = (() => {
  try {
    // Use createRequire to load JSON from ESM context
    const require = createRequire(import.meta.url);
    const pkg = require('../../package.json') as {
      name?: string;
      keywords?: string[];
      bin?: Record<string, string>;
    };
    const tokens = new Set<string>();
    if (pkg.name) {
      tokens.add(pkg.name);
      tokens.add(pkg.name.replace(/^@[^/]+\//, ''));
    }
    for (const k of pkg.keywords || []) tokens.add(k);
    for (const k of Object.keys(pkg.bin || {})) tokens.add(k);
    return tokens;
  } catch (_) {
    return new Set<string>();
  }
})();

export function L10_mixed_script(textOrAst: string | ASTNode | null | undefined): Issue[] {
  // Accept both raw text and AST shapes — most callers in this file pass the
  // AST that the harness built; some pass plain text via fixtures harness.
  const text = typeof textOrAst === 'string'
    ? textOrAst
    : ((textOrAst as { text?: string } | null | undefined)?.text ?? '');
  const issues: Issue[] = [];
  const lines = text.split('\n');
  // Word = run of letters/digits/_/-, including Cyrillic via \p{L}.
  const tokenRe = /[\p{L}\p{N}_-]+/gu;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(line)) !== null) {
      const token = m[0];
      if (PKG_TOKENS.has(token)) continue;
      // Hyphenated kebab tokens are project identifiers (worktree-agent-X,
      // gsd-sdk, etc.) — whitelist regardless of script.
      if (token.includes('-')) continue;
      // Numeric-suffixed alpha (foo123) — code identifier, whitelist.
      if (/^[A-Za-zА-Яа-яЁё]+\d+$/.test(token)) continue;
      const hasCyr = /[А-Яа-яЁё]/.test(token);
      const hasLat = /[A-Za-z]/.test(token);
      if (hasCyr && hasLat) {
        issues.push({
          rule: 'L10',
          line: i + 1,
          column: m.index + 1,
          severity: 'warn',
          token,
          message: `mixed-script token: ${token}`,
        });
      }
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// L11 — Overdecoration (frame for ≤5 items)
// Severity: warn. Trigger-table prescribes dot-leader for ≤5 items; frame
// wastes ~50% on padding/borders. Whitelist: nested tree (├──/└──) or
// embedded table column (≥3 │ chars on a single inner line) inside the frame.
// ---------------------------------------------------------------------------
export function L11_overdecoration(ast: ASTNode): Issue[] {
  if (!ast || !ast.content) return [];
  const content = ast.content;
  if (!content.includes('┌')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;
  const issues: Issue[] = [];

  let li = 0;
  while (li < lines.length) {
    const top = lines[li]!;
    const topMatch = top.match(/^(\s*)┌─+┐\s*$/);
    if (!topMatch) { li++; continue; }
    const indent = topMatch[1]!;

    // Find closing └─+┘ at same indent. Inner lines must match /^\s*│.*│\s*$/.
    let closeLi = -1;
    const inner: string[] = [];
    for (let lj = li + 1; lj < lines.length; lj++) {
      const next = lines[lj]!;
      const botMatch = next.match(/^(\s*)└─+┘\s*$/);
      if (botMatch && botMatch[1] === indent) { closeLi = lj; break; }
      if (/^\s*│.*│\s*$/.test(next)) inner.push(next);
    }
    if (closeLi === -1) { li++; continue; }

    const innerCount = inner.length;
    if (innerCount >= 1 && innerCount <= 5) {
      // Whitelist: nested tree (any ├── or └── in inner content).
      const hasTree = inner.some(l => /[├└]──/.test(l));
      // Whitelist: embedded table column — ≥3 │ chars on a single inner line
      // (outer pair + at least one embedded column separator).
      const hasEmbeddedTable = inner.some(l => (l.match(/│/g) || []).length >= 3);

      if (!hasTree && !hasEmbeddedTable) {
        // Token-savings estimate (chars saved by dot-leader form).
        const frameChars =
          visualWidth(top) +
          visualWidth(lines[closeLi]!) +
          inner.reduce((acc, l) => acc + visualWidth(l), 0);
        const dotLeaderChars = inner.reduce((acc, l) => {
          const stripped = l.replace(/^\s*│/, '').replace(/\s*│\s*$/, '').trim();
          return acc + visualWidth(stripped) + 1;
        }, 0);
        const saving = Math.max(0, frameChars - dotLeaderChars);

        issues.push(issue(
          'L11', 'warn', baseLineNum + li, indent.length + 1,
          `frame used for ${innerCount} items; consider dot-leader list (saves ~${saving} chars)`,
          `Replace frame with dot-leader list — see docs/lint-rules.md#l11`
        ));
      }
    }
    li = closeLi + 1;
  }
  return issues;
}

// ---------------------------------------------------------------------------
// L12 — Token budget (padding-dominated visual)
// Severity: warn. For each frame, compute padding/content ratio. Warn if
// padding_chars > content_chars. estimateFrameCost is exported for the
// --explain CLI flag (Plan 09-05).
// ---------------------------------------------------------------------------

export interface FrameCost {
  framing_chars: number;
  content_chars: number;
  border_chars: number;
  padding_chars: number;
  dotleader_equivalent: number;
  saving: number;
}

export interface FrameNode {
  top?: string;
  bottom?: string;
  inner?: string[];
}

/**
 * Estimate token-cost breakdown of a single frame block.
 * Used by L12 detection AND by the --explain CLI flag (Plan 09-05).
 * @param {{top:string, inner:string[], bottom:string}} node
 * @returns {FrameCost}
 */
export function estimateFrameCost(node: FrameNode): FrameCost {
  const top = node.top || '';
  const bottom = node.bottom || '';
  const inner = node.inner || [];

  const border_chars = visualWidth(top) + visualWidth(bottom);

  let content_chars = 0;
  let inner_chars = 0;
  for (const ln of inner) {
    inner_chars += visualWidth(ln);
    const stripped = ln
      .replace(/^\s*│/, '')
      .replace(/\s*│\s*$/, '')
      .trim();
    content_chars += visualWidth(stripped);
  }

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
  if (!ast || !ast.content) return [];
  const content = ast.content;
  if (!content.includes('┌')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;
  const issues: Issue[] = [];

  let li = 0;
  while (li < lines.length) {
    const top = lines[li]!;
    const topMatch = top.match(/^(\s*)┌─+┐\s*$/);
    if (!topMatch) { li++; continue; }
    const indent = topMatch[1]!;

    let closeLi = -1;
    const inner: string[] = [];
    for (let lj = li + 1; lj < lines.length; lj++) {
      const next = lines[lj]!;
      const botMatch = next.match(/^(\s*)└─+┘\s*$/);
      if (botMatch && botMatch[1] === indent) { closeLi = lj; break; }
      if (/^\s*│.*│\s*$/.test(next)) inner.push(next);
    }
    if (closeLi === -1) { li++; continue; }

    // Whitelist: tree composition inside frame (consistent with L11)
    if (inner.some(l => /[├└]──/.test(l))) { li = closeLi + 1; continue; }
    if (inner.length === 0) { li = closeLi + 1; continue; }

    const cost = estimateFrameCost({ top, inner, bottom: lines[closeLi]! });

    if (cost.padding_chars > cost.content_chars) {
      issues.push(issue(
        'L12', 'warn', baseLineNum + li, indent.length + 1,
        `frame is padding-dominated (padding=${cost.padding_chars} > content=${cost.content_chars}); consider lighter visual`,
        `Use --explain for full cost breakdown; consider dot-leader or trimmed frame`
      ));
    }
    li = closeLi + 1;
  }
  return issues;
}

// ---------------------------------------------------------------------------
// L13 — Double wrap (tree inside frame)
// Severity: warn. A tree's indentation already conveys hierarchy; wrapping
// it in a frame adds zero information at full border cost.
// ---------------------------------------------------------------------------
export function L13_double_wrap(ast: ASTNode): Issue[] {
  if (!ast || !ast.content) return [];
  const content = ast.content;
  if (!content.includes('┌')) return [];
  if (!/[├└]──/.test(content)) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;
  const issues: Issue[] = [];

  let li = 0;
  while (li < lines.length) {
    const top = lines[li]!;
    const topMatch = top.match(/^(\s*)┌─+┐\s*$/);
    if (!topMatch) { li++; continue; }
    const indent = topMatch[1]!;

    let closeLi = -1;
    let hasTree = false;
    for (let lj = li + 1; lj < lines.length; lj++) {
      const next = lines[lj]!;
      const botMatch = next.match(/^(\s*)└─+┘\s*$/);
      if (botMatch && botMatch[1] === indent) { closeLi = lj; break; }
      if (/[├└]──/.test(next)) hasTree = true;
    }
    if (closeLi === -1) { li++; continue; }

    if (hasTree) {
      issues.push(issue(
        'L13', 'warn', baseLineNum + li, indent.length + 1,
        `tree inside frame block — the tree already conveys hierarchy; drop the frame`,
        `Remove the surrounding ┌─...─┐ / └─...─┘ borders; tree indentation suffices`
      ));
    }
    li = closeLi + 1;
  }
  return issues;
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

export function L14_blank_line_separation(ast: ASTNode, fullText: string): Issue[] {
  if (!ast || !ast.content) return [];

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

  const issues: Issue[] = [];

  // --- Check the line BEFORE the opening fence ---
  const beforeLi = openFenceLi - 1; // 0-indexed
  if (beforeLi >= 0) {
    const beforeLine = lines[beforeLi] ?? '';
    const beforeTrimmed = beforeLine.trim();
    // Skip if blank, another fence, or a list marker (lenient for list-adjacent).
    const isBlank = beforeTrimmed === '';
    const isFence = beforeTrimmed === '```' || beforeTrimmed.startsWith('```');
    const isListMarker = /^\s*(?:[-*+]|\d+\.)\s/.test(beforeLine);
    const isHeading = beforeTrimmed.startsWith('#');
    if (!isBlank && !isFence && !isListMarker && !isHeading) {
      issues.push(issue(
        'L14', 'warn',
        openFenceLi + 1, // 1-based line of opening fence
        1,
        'diagram block should be separated from surrounding text by a blank line',
        'add a blank line before the opening ``` fence'
      ));
    }
  }

  // --- Check the line AFTER the closing fence ---
  const afterLi = closeFenceLi + 1; // 0-indexed
  if (afterLi < lines.length) {
    const afterLine = lines[afterLi] ?? '';
    const afterTrimmed = afterLine.trim();
    const isBlank = afterTrimmed === '';
    const isFence = afterTrimmed === '```' || afterTrimmed.startsWith('```');
    const isListMarker = /^\s*(?:[-*+]|\d+\.)\s/.test(afterLine);
    const isHeading = afterTrimmed.startsWith('#');
    if (!isBlank && !isFence && !isListMarker && !isHeading) {
      issues.push(issue(
        'L14', 'warn',
        closeFenceLi + 1, // 1-based line of closing fence
        1,
        'diagram block should be separated from surrounding text by a blank line',
        'add a blank line after the closing ``` fence'
      ));
    }
  }

  return issues;
}
