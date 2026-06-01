#!/usr/bin/env node
// hooks/feynman-lint.ts — feynman Stop-hook variant
// Reads Claude's response from stdin JSON {response, session_id, ...}
// If lint fails: emit additionalContext with corrections
// If lint passes: exit 0 silently
// ALWAYS exits 0 — never block Claude (best practice)
// Zero deps. ESM + TypeScript (Node.js v22.6+ strip-types — runs .ts directly).

import { lint } from '../lib/lint/index.ts';
import { autofix } from '../lib/lint/autofix.ts';

interface LintIssue {
  rule: string;
  line: number;
  message: string;
  suggestion?: string;
}

interface LintResult {
  passed: boolean;
  issues: LintIssue[];
}

// Rule descriptions for actionable feedback
const RULE_DESCRIPTIONS: Record<string, string> = {
  L01: 'Box closure: every ┌─...─┐ opening must have a matching └─...─┘ at the same column',
  L02: 'Tree chars: last child must use └── not ├──',
  L03: 'Arrow style: use only one arrow style per diagram (-->, →, ─→, or ──>)',
  L04: 'Column widths: all table rows must have the same number of columns',
  L05: 'Flow integrity: two [Box] tokens on the same line must have an arrow between them',
  L06: 'Priority scale: if ▲ appears, ▼ must also appear (and vice versa)',
  L07: 'Mermaid+ASCII mix: use either Mermaid or ASCII diagrams, not both in the same response',
  L08: 'Frame width: all rows inside a ┌─ frame must have the same display width',
};

/**
 * Build a concise additionalContext message from lint issues
 */
function buildCorrectionMessage(issues: LintIssue[]): string {
  if (!issues || issues.length === 0) return '';

  // Group by rule
  const byRule = new Map<string, LintIssue[]>();
  for (const iss of issues) {
    if (!byRule.has(iss.rule)) byRule.set(iss.rule, []);
    byRule.get(iss.rule)!.push(iss);
  }

  const lines = [
    'DIAGRAM LINT CORRECTIONS NEEDED:',
    '',
  ];

  for (const [rule, ruleIssues] of byRule) {
    const desc = RULE_DESCRIPTIONS[rule] || rule;
    lines.push(`[${rule}] ${desc}`);
    for (const iss of ruleIssues) {
      lines.push(`  - Line ${iss.line}: ${iss.message}`);
      if (iss.suggestion) lines.push(`    Fix: ${iss.suggestion}`);
    }
    lines.push('');
  }

  lines.push('Please correct the ASCII diagram(s) above before responding further.');

  return lines.join('\n');
}

// Accumulate stdin
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const response: unknown = data.response || data.message || '';

    if (!response || typeof response !== 'string') {
      process.exit(0);
    }

    // First pass: try autofix on misaligned ASCII frames in prose (outside fenced
    // code blocks). If autofix changes anything, emit the fixed text wrapped in
    // <feynman-autofix> so Claude can show it back to the user without
    // re-running the rule-feedback machinery. Fenced frames are skipped by
    // autofix itself — those are user-authored samples that should not be
    // silently rewritten.
    let autofixed: string = response;
    try {
      autofixed = autofix(response);
    } catch (_) {
      // autofix is best-effort — never crash the hook
      autofixed = response;
    }
    if (autofixed !== response) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'Stop',
          additionalContext: '<feynman-autofix>\n' + autofixed + '\n</feynman-autofix>'
        }
      }));
      process.exit(0);
    }

    const result: LintResult = lint(response);

    if (result.passed) {
      // No errors — exit 0 silently
      process.exit(0);
    }

    // Build correction message
    const correctionText = buildCorrectionMessage(result.issues);

    // Emit Stop-hook output
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext: correctionText
      }
    }));

    // Always exit 0 — never block Claude
    process.exit(0);
  } catch (e) {
    // Silent fail — never surface hook errors
    process.exit(0);
  }
});
