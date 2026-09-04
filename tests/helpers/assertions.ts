import assert from 'node:assert/strict';

export function assertRecord(
  value: unknown,
  message = 'expected an object',
): asserts value is Record<string, unknown> {
  assert.ok(typeof value === 'object' && value !== null && !Array.isArray(value), message);
}

export function assertUnknownArray(
  value: unknown,
  message = 'expected an array',
): asserts value is unknown[] {
  assert.ok(Array.isArray(value), message);
}

export function assertString(
  value: unknown,
  message = 'expected a string',
): asserts value is string {
  assert.equal(typeof value, 'string', message);
}

export function assertDefined<T>(
  value: T,
  message = 'expected a defined value',
): asserts value is NonNullable<T> {
  assert.notEqual(value, undefined, message);
  assert.notEqual(value, null, message);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseJsonObject(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  assertRecord(value, 'expected JSON object');
  return value;
}
