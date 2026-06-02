// lib/lint/index.ts — diagram linter orchestrator
// lint(markdown, options) => {issues, passed}
// format(issues, mode) => string
// Zero deps. ESM only.

import { parse } from './parser.ts';
import * as rules from './rules.ts';
import type { Issue, ASTNode } from './rules.ts';

export type { Issue } from './rules.ts';

export interface LintOptions {
  rules?: string[];
}

export interface LintResult {
  issues: Issue[];
  passed: boolean;
}

// ---------------------------------------------------------------------------
// Rule registry — single source of truth for id, scope, fn, and description.
// Exported so that tests and hooks can derive rule lists without hard-coding.
// ---------------------------------------------------------------------------

export type RuleScope = 'pernode' | 'fulltext';

export interface RuleEntry {
  id: string;
  scope: RuleScope;
  fn: (node: ASTNode, fullText: string) => Issue[];
  description: string;
}

/**
 * Canonical registry of all 15 lint rules (L01–L15).
 * Descriptions for L01-L08 are kept byte-identical to the original
 * RULE_DESCRIPTIONS in hooks/feynman-lint.ts so that hook output is unchanged.
 */
export const RULE_REGISTRY: readonly RuleEntry[] = [
  {
    id: 'L01',
    scope: 'pernode',
    fn: (node) => rules.L01_box_closure(node),
    description: 'Box closure: every ┌─...─┐ opening must have a matching └─...─┘ at the same column',
  },
  {
    id: 'L02',
    scope: 'pernode',
    fn: (node) => rules.L02_tree_chars(node),
    description: 'Tree chars: last child must use └── not ├──',
  },
  {
    id: 'L03',
    scope: 'pernode',
    fn: (node) => rules.L03_arrow_style(node),
    description: 'Arrow style: use only one arrow style per diagram (-->, →, ─→, or ──>)',
  },
  {
    id: 'L04',
    scope: 'pernode',
    fn: (node) => rules.L04_column_widths(node),
    description: 'Column widths: all table rows must have the same number of columns',
  },
  {
    id: 'L05',
    scope: 'pernode',
    fn: (node) => rules.L05_flow_integrity(node),
    description: 'Flow integrity: two [Box] tokens on the same line must have an arrow between them',
  },
  {
    id: 'L06',
    scope: 'pernode',
    fn: (node) => rules.L06_priority_scale(node),
    description: 'Priority scale: if ▲ appears, ▼ must also appear (and vice versa)',
  },
  {
    id: 'L07',
    scope: 'fulltext',
    fn: (_node, fullText) => rules.L07_no_mermaid_mix(null, fullText),
    description: 'Mermaid+ASCII mix: use either Mermaid or ASCII diagrams, not both in the same response',
  },
  {
    id: 'L08',
    scope: 'pernode',
    fn: (node) => rules.L08_frame_width(node),
    description: 'Frame width: all rows inside a ┌─ frame must have the same display width',
  },
  {
    id: 'L09',
    scope: 'pernode',
    fn: (node) => rules.L09_right_edge_alignment(node),
    description: 'Right-edge alignment: every inner │ and bottom ┘ must land at the same visual column as the top ┐',
  },
  {
    id: 'L10',
    scope: 'fulltext',
    fn: (_node, fullText) => rules.L10_mixed_script(fullText),
    description: 'Mixed-script: avoid mixing Cyrillic and Latin characters within a single token',
  },
  {
    id: 'L11',
    scope: 'pernode',
    fn: (node) => rules.L11_overdecoration(node),
    description: 'Overdecoration: frames with ≤5 items should use a dot-leader list instead',
  },
  {
    id: 'L12',
    scope: 'pernode',
    fn: (node) => rules.L12_token_budget(node),
    description: 'Token budget: padding-dominated frame (padding > content) — consider a lighter visual',
  },
  {
    id: 'L13',
    scope: 'pernode',
    fn: (node) => rules.L13_double_wrap(node),
    description: 'Double wrap: tree inside a frame — tree indentation already conveys hierarchy; drop the frame',
  },
  {
    id: 'L14',
    scope: 'pernode',
    fn: (node, fullText) => rules.L14_blank_line_separation(node, fullText),
    description: 'Blank-line separation: fenced diagram blocks should have a blank line before and after',
  },
  {
    id: 'L15',
    scope: 'pernode',
    fn: (node) => rules.L15_homogeneous_frame(node),
    description: 'Homogeneous frame: frame wraps uniform content (bullets/kv/prose) — consider plain format',
  },
];

/** Flat map from rule id → description, derived from RULE_REGISTRY. */
export const RULE_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  RULE_REGISTRY.map(r => [r.id, r.description])
);

/** Ordered list of all rule IDs, derived from RULE_REGISTRY (self-maintaining). */
export const RULE_IDS: readonly string[] = RULE_REGISTRY.map(r => r.id);

// ---------------------------------------------------------------------------

/**
 * Lint a markdown string for ASCII diagram issues.
 * @param {string} markdown
 * @param {LintOptions} [options] - optional rule filter
 * @returns {LintResult}
 */
export function lint(markdown: string, options?: LintOptions): LintResult {
  if (typeof markdown !== 'string') {
    return { issues: [], passed: true };
  }

  const enabledRules = (options && options.rules) || null;

  function isEnabled(ruleId: string): boolean {
    if (!enabledRules) return true;
    return enabledRules.includes(ruleId);
  }

  const ast = parse(markdown);
  const allIssues: Issue[] = [];

  // Dispatch via the registry — pernode rules run for each AST node;
  // fulltext rules run once on the full markdown string.
  for (const entry of RULE_REGISTRY) {
    if (!isEnabled(entry.id)) continue;

    if (entry.scope === 'pernode') {
      for (const node of ast) {
        try {
          const nodeIssues = entry.fn(node, markdown);
          if (Array.isArray(nodeIssues)) allIssues.push(...nodeIssues);
        } catch (_) {
          // Rule threw — skip silently (never crash linter)
        }
      }
    } else {
      // fulltext: pass a dummy empty node as first arg; fn uses fullText arg
      try {
        const fulltextIssues = entry.fn({} as ASTNode, markdown);
        if (Array.isArray(fulltextIssues)) allIssues.push(...fulltextIssues);
      } catch (_) {
        // Skip silently
      }
    }
  }

  // Sort into source order (line, then column, then rule id) so output is
  // deterministic and reads top-to-bottom regardless of registry dispatch
  // order. Array.prototype.sort is stable, so equal keys keep insertion order.
  allIssues.sort((a, b) =>
    a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule)
  );

  const errorCount = allIssues.filter(i => i.severity === 'error').length;
  const passed = errorCount === 0;

  return { issues: allIssues, passed };
}

/**
 * Format issues for output.
 * @param {Issue[]} issues
 * @param {'gcc'|'json'} mode
 * @param {string} [filename] - for gcc mode
 * @param {boolean} [useColor] - ANSI color for TTY
 * @returns {string}
 */
export function format(issues: Issue[], mode: 'gcc' | 'json', filename?: string, useColor?: boolean): string {
  if (mode === 'json') {
    return JSON.stringify(issues, null, 2);
  }

  // gcc mode: <file>:<line>:<col>: L0X severity message
  if (!issues || issues.length === 0) return '';

  const RESET  = useColor ? '\x1b[0m'  : '';
  const RED    = useColor ? '\x1b[31m' : '';
  const YELLOW = useColor ? '\x1b[33m' : '';
  const BOLD   = useColor ? '\x1b[1m'  : '';

  const file = filename || '<input>';

  return issues.map(iss => {
    const color = iss.severity === 'error' ? RED : YELLOW;
    const sev = iss.severity === 'error' ? 'error' : 'warn';
    return `${file}:${iss.line}:${iss.column}: ${color}${BOLD}${iss.rule} ${sev}${RESET} ${iss.message}`;
  }).join('\n');
}
