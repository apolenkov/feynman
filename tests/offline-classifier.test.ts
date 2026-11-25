import assert from 'node:assert/strict';
import { it } from 'node:test';
import { shouldSkipActionlintDownload } from './helpers/offline.ts';

function fetchFailure(cause: unknown): TypeError {
  return new TypeError('fetch failed', { cause });
}

for (const code of [
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EADDRNOTAVAIL',
  'UND_ERR_CONNECT_TIMEOUT',
]) {
  it(`skips a local fetch failure caused by ${code}`, () => {
    const cause = Object.assign(new Error('connection failed'), { code });
    assert.equal(shouldSkipActionlintDownload(fetchFailure(cause), {}), true);
  });
}

it('recognizes an offline code in a nested cause', () => {
  const cause = Object.assign(new Error(), { code: 'ECONNRESET' });
  assert.equal(
    shouldSkipActionlintDownload(fetchFailure(new Error('socket', { cause })), {}),
    true,
  );
});

for (const name of ['TimeoutError', 'AbortError']) {
  it(`recognizes a direct or wrapped ${name}`, () => {
    const timeout = new DOMException('download timed out', name);
    assert.equal(shouldSkipActionlintDownload(timeout, {}), true);
    assert.equal(shouldSkipActionlintDownload(fetchFailure(timeout), {}), true);
  });
}

it('skips local download timeouts and propagates them in CI', () => {
  const error = new DOMException('download timed out', 'TimeoutError');
  assert.equal(shouldSkipActionlintDownload(error, {}), true);
  for (const CI of ['', ' ', 'false', ' FaLsE ', '0', ' 0 '])
    assert.equal(shouldSkipActionlintDownload(error, { CI }), true, JSON.stringify(CI));
  for (const CI of ['true', '1', ' YES ', 'off'])
    assert.equal(shouldSkipActionlintDownload(error, { CI }), false, JSON.stringify(CI));
});

it('propagates integrity, HTTP and unrecognized fetch failures even locally', () => {
  for (const error of [
    new Error('Pinned upstream actionlint checksum mismatch'),
    new Error('Pinned upstream actionlint download failed'),
    fetchFailure(Object.assign(new Error(), { code: 'CERT_HAS_EXPIRED' })),
    fetchFailure(new Error('ECONNRESET')),
  ])
    assert.equal(shouldSkipActionlintDownload(error, {}), false, error.message);
});
