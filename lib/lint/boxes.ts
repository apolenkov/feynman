// Keep the first opening bracket, including nested openings in the label.
// Each delimiter search resumes after the previous closing bracket.
export function* boxes(text: string): Generator<{ start: number; end: number }> {
  for (let cursor = 0; cursor < text.length;) {
    const start = text.indexOf('[', cursor);
    if (start < 0) return;
    const close = text.indexOf(']', start + 1);
    if (close < 0) return;
    if (close > start + 1) yield { start, end: close + 1 };
    cursor = close + 1;
  }
}
