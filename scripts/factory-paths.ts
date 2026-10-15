import { arrayField } from './factory-protocol.ts';
import type { FactoryPolicy } from './factory-protocol.ts';

// Single protected-path matcher shared by publication eligibility and the writer patch guard.
// Patterns: `dir/**` (prefix), `name*` (prefix glob, e.g. `.env*`) or an exact path.
export function isProtectedPath(policy: FactoryPolicy, file: string): boolean {
  return arrayField(policy, 'protected_paths').some(
    (pattern) =>
      typeof pattern === 'string' &&
      (pattern.endsWith('/**')
        ? file.startsWith(pattern.slice(0, -2))
        : pattern.endsWith('*')
          ? file.startsWith(pattern.slice(0, -1))
          : file === pattern),
  );
}
