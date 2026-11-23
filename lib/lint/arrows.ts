// Match the complete shaft before a bare arrowhead when computing columns.
const FLOW_ARROW = new RegExp(['─→', '→', '──>', '-->'].join('|'));

export function hasFlowArrow(text: string): boolean {
  return FLOW_ARROW.test(text);
}

export function flowArrowIndex(line: string): number {
  return line.search(FLOW_ARROW);
}

export function hasExactlyOneArrow(line: string): boolean {
  return (line.match(new RegExp(FLOW_ARROW.source, 'g')) ?? []).length === 1;
}
