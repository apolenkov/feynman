import { arrayField } from './factory-protocol.ts';
import type { FactoryPolicy } from './factory-protocol.ts';

// Repository-relative path in plain form: no leading or doubled slash, `.`/`..` segment, backslash or control byte.
// An unsafe path is never matched against policy patterns; callers refuse it.
export function isSafeRepoPath(file: string): boolean {
  return (
    !file.startsWith('/') &&
    !file.split('/').some((part) => part === '..' || part === '.' || part === '') &&
    !file.includes('\\') &&
    !/[\x00-\x1f]/.test(file)
  );
}

// Single protected-path matcher shared by publication eligibility and the writer patch guard.
// Patterns: `dir/**` (prefix), `name*` (prefix glob, e.g. `.env*`) or an exact path. A pattern without `/`
// also applies to the basename, so `.env*` protects `config/.env.local`. Case is exact (Linux).
export function isProtectedPath(policy: FactoryPolicy, file: string): boolean {
  const name = file.slice(file.lastIndexOf('/') + 1);
  const matches = (pattern: string, candidate: string): boolean =>
    pattern.endsWith('/**')
      ? candidate.startsWith(pattern.slice(0, -2))
      : pattern.endsWith('*')
        ? candidate.startsWith(pattern.slice(0, -1))
        : candidate === pattern;
  return arrayField(policy, 'protected_paths').some(
    (pattern) =>
      typeof pattern === 'string' &&
      (matches(pattern, file) || (!pattern.includes('/') && matches(pattern, name))),
  );
}
