// lib/lint/rules.js — 8 lint rules for ASCII diagrams
// Each rule: (ast: ASTNode, fullText: string) => Issue[]
// Issue: {rule, severity, line, column, message, suggestion?}
// Zero deps. CJS only.
'use strict';

/**
 * Create an issue object
 * @param {string} rule - e.g. 'L01'
 * @param {'error'|'warn'} severity
 * @param {number} line - 1-based
 * @param {number} column - 1-based
 * @param {string} message
 * @param {string} [suggestion]
 * @returns {object}
 */
function issue(rule, severity, line, column, message, suggestion) {
  const obj = { rule, severity, line, column, message };
  if (suggestion) obj.suggestion = suggestion;
  return obj;
}

/**
 * Get display width of a string (handles multibyte box-drawing chars as width 1)
 * Box-drawing Unicode chars are double-byte but render as 1 column in most terminals.
 * @param {string} str
 * @returns {number}
 */
function displayWidth(str) {
  let width = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    // CJK wide characters (East Asian width = 2)
    if (
      (code >= 0x1100 && code <= 0x115F) ||
      (code >= 0x2E80 && code <= 0x303E) ||
      (code >= 0x3040 && code <= 0x33FF) ||
      (code >= 0x3400 && code <= 0x4DBF) ||
      (code >= 0x4E00 && code <= 0xA4CF) ||
      (code >= 0xA960 && code <= 0xA97F) ||
      (code >= 0xAC00 && code <= 0xD7FF) ||
      (code >= 0xF900 && code <= 0xFAFF) ||
      (code >= 0xFE10 && code <= 0xFE1F) ||
      (code >= 0xFE30 && code <= 0xFE4F) ||
      (code >= 0xFF00 && code <= 0xFF60) ||
      (code >= 0xFFE0 && code <= 0xFFE6) ||
      (code >= 0x1F300 && code <= 0x1F64F) ||
      (code >= 0x1F900 && code <= 0x1F9FF) ||
      (code >= 0x20000 && code <= 0x2FFFD) ||
      (code >= 0x30000 && code <= 0x3FFFD)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

// ---------------------------------------------------------------------------
// L01 — Box closure
// Every ┌ must have a matching └ at the same column.
// Every ─┐ must have a matching ─┘ at the same column.
// Vertical │ chars must align between top and bottom.
// ---------------------------------------------------------------------------
function L01_box_closure(ast) {
  if (!ast || !ast.content) return [];

  const lines = ast.content.split('\n');
  // Don't run on diagrams with no box chars
  if (!ast.content.includes('┌') && !ast.content.includes('─┐') && !ast.content.includes('┐')) {
    return [];
  }

  const issues = [];
  const baseLineNum = ast.startLine;

  // Find all top-left corners (┌) and their columns
  // Also find top-right corners (┐) and bottom corners (└, ┘)
  // We track "open" top corners and look for matching bottoms

  // Collect positions of each corner type
  const topLefts = [];   // {line, col}
  const topRights = [];  // {line, col}
  const botLefts = [];   // {line, col}
  const botRights = [];  // {line, col}

  for (let li = 0; li < lines.length; li++) {
    const ln = lines[li];
    for (let ci = 0; ci < ln.length; ci++) {
      const ch = ln[ci];
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
function L02_tree_chars(ast) {
  if (!ast || !ast.content) return [];

  const content = ast.content;
  // Skip if no tree chars at all
  if (!content.includes('├') && !content.includes('└')) return [];

  const lines = content.split('\n');
  const issues = [];
  const baseLineNum = ast.startLine;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];

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
      const next = lines[lj];
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
const ARROW_PATTERNS = [
  { name: '→',   re: /(?<![─-])→/ },
  { name: '-->',  re: /-->/ },
  { name: '─→',  re: /─→/ },
  { name: '──>', re: /──>/ },
];

function L03_arrow_style(ast) {
  if (!ast || !ast.content) return [];

  const content = ast.content;
  const lines = content.split('\n');
  const baseLineNum = ast.startLine;

  // Collect which arrow styles appear and on which lines
  const found = new Map(); // style name -> first line number (1-based relative to doc)

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
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
  const firstStyle = styles[0][0];
  const issues = [];

  for (let si = 1; si < styles.length; si++) {
    const [name, lineNum] = styles[si];
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
function L04_column_widths(ast) {
  if (!ast || !ast.content) return [];

  const content = ast.content;
  if (!content.includes('|')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;

  // Find table-like rows: lines starting with | AND that look like markdown table rows
  // Exclude lines that are just diagram connectors (| as vertical bar in flow diagrams)
  // A proper table row: starts with |, has at least one cell with a word char, multiple pipes
  const tableLines = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
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
  function countCols(line) {
    // Split by |, trim outer empty strings
    const parts = line.split('|');
    // Remove leading/trailing empty strings from the outer pipes
    let start = 0;
    let end = parts.length;
    if (parts[0].trim() === '') start = 1;
    if (parts[parts.length - 1].trim() === '') end = parts.length - 1;
    return end - start;
  }

  // Determine reference column count (from first non-separator row)
  function isSeparatorRow(line) {
    return /^\s*\|[\s\-|:]+\|?\s*$/.test(line);
  }

  let refCols = null;
  const issues = [];

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

function L05_flow_integrity(ast) {
  if (!ast || !ast.content) return [];

  const content = ast.content;
  if (!content.includes('[')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;
  const issues = [];

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const boxes = [...line.matchAll(BOX_RE)];

    if (boxes.length < 2) continue;

    // Check between each consecutive pair of boxes
    let hasViolation = false;
    for (let bi = 0; bi < boxes.length - 1; bi++) {
      const curEnd   = boxes[bi].index + boxes[bi][0].length;
      const nextStart = boxes[bi + 1].index;
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
        'L05', 'error', baseLineNum + li, boxes[0].index + 1,
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
function L06_priority_scale(ast) {
  if (!ast || !ast.content) return [];

  const content = ast.content;
  const hasUp = /^[\s]*▲\s+\S/m.test(content);
  const hasDown = /^[\s]*▼\s+\S/m.test(content);

  if (hasUp === hasDown) return []; // both present or both absent — OK

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;
  const issues = [];

  // Find the line with the existing marker
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const upMatch = line.match(/^(\s*)▲\s+\S/);
    if (hasUp && upMatch) {
      issues.push(issue(
        'L06', 'warn', baseLineNum + li, upMatch[1].length + 1,
        `Priority scale has '▲' but missing '▼' — scales require both ends`,
        `Add a '▼' marker to indicate the low end of the priority scale`
      ));
      break;
    }
    const downMatch = line.match(/^(\s*)▼\s+\S/);
    if (hasDown && downMatch) {
      issues.push(issue(
        'L06', 'warn', baseLineNum + li, downMatch[1].length + 1,
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
function L07_no_mermaid_mix(_ast, fullText) {
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
    if (/```mermaid/i.test(lines[li])) {
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
function L08_frame_width(ast) {
  if (!ast || !ast.content) return [];

  const content = ast.content;
  if (!content.includes('┌')) return [];

  const lines = content.split('\n');
  const baseLineNum = ast.startLine;
  const issues = [];

  let inFrame = false;
  let frameStartLine = 0;
  let frameWidth = null;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
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
// Registry
// ---------------------------------------------------------------------------
module.exports = {
  L01_box_closure,
  L02_tree_chars,
  L03_arrow_style,
  L04_column_widths,
  L05_flow_integrity,
  L06_priority_scale,
  L07_no_mermaid_mix,
  L08_frame_width,
};
