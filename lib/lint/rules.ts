import { type ASTNode, type Issue, issue } from './lint-diagnostics.ts';
import { visualCharacters } from './width.ts';
import { DIAGRAM_CHAR_RE } from './frame-economy.ts';
import { hasFlowArrow } from './arrows.ts';
export type { Issue } from './lint-diagnostics.ts';
export type { ASTNode } from './lint-diagnostics.ts';
export { L02_tree_chars } from './flow-rules.ts';
export { L03_arrow_style } from './flow-rules.ts';
export { L04_column_widths } from './flow-rules.ts';
export { L05_flow_integrity } from './flow-rules.ts';
export { L06_priority_scale } from './flow-rules.ts';
export { L07_no_mermaid_mix } from './flow-rules.ts';
export { L08_frame_width } from './frame-geometry.ts';
export { L09_right_edge_alignment } from './frame-geometry.ts';
export { L11_overdecoration } from './frame-economy.ts';
export type { FrameCost } from './frame-economy.ts';
export type { FrameNode } from './frame-economy.ts';
export { estimateFrameCost } from './frame-economy.ts';
export { L12_token_budget } from './frame-economy.ts';
export { L13_double_wrap } from './frame-economy.ts';
export { L15_homogeneous_frame } from './frame-economy.ts';

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

export function L14_blank_line_separation(ast: ASTNode, fullText: string): Issue[] {
  if (ast.content.length === 0) return [];

  // Only fire on diagram blocks with actual diagram chars.
  if (!DIAGRAM_CHAR_RE.test(ast.content) && !hasFlowArrow(ast.content)) return [];

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
