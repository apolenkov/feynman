import { sha256 } from './factory-protocol.ts';

export interface FindingAnchor {
  readonly path: string;
  readonly category: string;
  readonly existing_code: string;
  readonly start_line: number;
}
// Line numbers are not part of the identity: the anchor is the flagged code, so a shift keeps the fingerprint.
// start_line === 0 means the tool could not locate the code; an empty anchor cannot identify anything either.
export function fingerprintFinding(rev: string, finding: FindingAnchor): string | null {
  const anchor = finding.existing_code.replace(/\s+/g, ' ').trim();
  if (finding.start_line === 0 || anchor === '') return null;
  return sha256({
    fingerprint_policy_revision: rev,
    path: finding.path.replaceAll('\\', '/').replace(/^(?:\.\/)+/, ''),
    category: finding.category.toLowerCase(),
    anchor,
  });
}
