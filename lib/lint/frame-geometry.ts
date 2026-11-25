import { type ASTNode, type Issue, issue } from './lint-diagnostics.ts';
import { visualWidth, firstVisualColumnOf, lastVisualColumnOf } from './width.ts';

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
  const nearestCloserByColumn = new Map<number, number>();
  const closerByOpener = new Map<number, number>();

  // In reverse order each opener can look up its first later closer at the
  // same visual left column. Record a row's opener before indexing its closer.
  for (let li = lines.length - 1; li >= 0; li--) {
    const line = lines[li] ?? '';
    if (line.includes('┌') && line.includes('┐')) {
      const closer = nearestCloserByColumn.get(firstVisualColumnOf(line, '┌'));
      if (closer !== undefined) closerByOpener.set(li, closer);
    }
    if (line.includes('└') && line.includes('┘')) {
      nearestCloserByColumn.set(firstVisualColumnOf(line, '└'), li);
    }
  }

  for (let li = 0; li < lines.length; li++) {
    const closeLi = closerByOpener.get(li);
    if (closeLi === undefined) continue; // L01 reports unclosed frames.
    const topLine = lines[li] ?? '';
    const anchorCol = lastVisualColumnOf(topLine, '┐');
    const topAbsLine = baseLineNum + li;

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
    li = closeLi;
  }

  return issues;
}
