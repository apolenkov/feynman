export interface Issue {
  readonly rule: string;
  readonly severity: 'error' | 'warn';
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly suggestion?: string;
  readonly token?: string;
}

export interface ASTNode {
  readonly type: string;
  readonly content: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly indent: number;
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
export function issue(
  rule: string,
  severity: 'error' | 'warn',
  line: number,
  column: number,
  message: string,
  suggestion?: string,
): Issue {
  return {
    rule,
    severity,
    line,
    column,
    message,
    ...(suggestion === undefined || suggestion.length === 0 ? {} : { suggestion }),
  };
}
