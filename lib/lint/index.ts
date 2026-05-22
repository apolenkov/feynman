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

  // Per-node rules
  const perNodeRules: Array<{id: string, fn: (node: ASTNode, markdown: string) => Issue[]}> = [
    { id: 'L01', fn: rules.L01_box_closure },
    { id: 'L02', fn: rules.L02_tree_chars },
    { id: 'L03', fn: rules.L03_arrow_style },
    { id: 'L04', fn: rules.L04_column_widths },
    { id: 'L05', fn: rules.L05_flow_integrity },
    { id: 'L06', fn: rules.L06_priority_scale },
    { id: 'L08', fn: rules.L08_frame_width },
    { id: 'L09', fn: rules.L09_right_edge_alignment },
    { id: 'L11', fn: rules.L11_overdecoration },
    { id: 'L12', fn: rules.L12_token_budget },
    { id: 'L13', fn: rules.L13_double_wrap },
    { id: 'L14', fn: rules.L14_blank_line_separation },
  ];

  for (const node of ast) {
    for (const { id, fn } of perNodeRules) {
      if (!isEnabled(id)) continue;
      try {
        const nodeIssues = fn(node, markdown);
        if (Array.isArray(nodeIssues)) allIssues.push(...nodeIssues);
      } catch (e) {
        // Rule threw — skip silently (never crash linter)
      }
    }
  }

  // Full-text rules (L07 operates once on full markdown, not per-node)
  if (isEnabled('L07')) {
    try {
      const l07Issues = rules.L07_no_mermaid_mix(null, markdown);
      if (Array.isArray(l07Issues)) allIssues.push(...l07Issues);
    } catch (e) {
      // Skip silently
    }
  }

  // L10 — mixed-script (warn only, full-text scan)
  if (isEnabled('L10')) {
    try {
      const l10Issues = rules.L10_mixed_script(markdown);
      if (Array.isArray(l10Issues)) allIssues.push(...l10Issues);
    } catch (e) {
      // Skip silently
    }
  }

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
