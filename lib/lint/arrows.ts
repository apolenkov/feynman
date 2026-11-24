// Token offsets are UTF-16 indices, as used by String.slice.
const FLOW_ARROWS = ['─→', '→', '──>', '-->'] as const;

function firstArrow(line: string, from: number): { index: number; length: number } | undefined {
  let first;
  for (const token of FLOW_ARROWS) {
    const index = line.indexOf(token, from);
    if (index !== -1 && (first === undefined || index < first.index))
      first = { index, length: token.length };
  }
  return first;
}

export function hasFlowArrow(text: string): boolean {
  return flowArrowIndex(text) !== -1;
}

export function flowArrowIndex(line: string): number {
  return firstArrow(line, 0)?.index ?? -1;
}

export function hasExactlyOneArrow(line: string): boolean {
  const first = firstArrow(line, 0);
  return first !== undefined && firstArrow(line, first.index + first.length) === undefined;
}
