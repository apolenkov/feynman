import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fingerprintFinding } from '../scripts/factory-scan-record.ts';

const base = {
  path: 'src/a.ts',
  category: 'Security',
  existing_code: 'eval(  input )',
  start_line: 10,
};
describe('fingerprintFinding', () => {
  it('survives line shifts, whitespace, path spelling and category case', () => {
    const fingerprint = fingerprintFinding('r1', base);
    assert.match(fingerprint ?? '', /^[0-9a-f]{64}$/);
    assert.equal(fingerprintFinding('r1', { ...base, start_line: 99 }), fingerprint);
    assert.equal(
      fingerprintFinding('r1', { ...base, existing_code: ' eval( input )\n' }),
      fingerprint,
    );
    assert.equal(
      fingerprintFinding('r1', { ...base, path: './src\\a.ts', category: 'SECURITY' }),
      fingerprint,
    );
  });
  it('changes with policy revision, path, category and code', () => {
    const fingerprint = fingerprintFinding('r1', base);
    for (const [rev, change] of [
      ['r2', {}],
      ['r1', { path: 'src/b.ts' }],
      ['r1', { category: 'bug' }],
      ['r1', { existing_code: 'eval(x)' }],
    ] as const)
      assert.notEqual(fingerprintFinding(rev, { ...base, ...change }), fingerprint);
  });
  it('refuses findings that cannot be identified', () => {
    assert.equal(fingerprintFinding('r1', { ...base, start_line: 0 }), null);
    assert.equal(fingerprintFinding('r1', { ...base, existing_code: ' \n ' }), null);
  });
});
