import fs from 'node:fs';

export interface PackageMetadata {
  readonly name: string;
  readonly version: string;
}

export function readPackageMetadata(filePath: string): PackageMetadata {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('name' in parsed) ||
    typeof parsed.name !== 'string' ||
    !('version' in parsed) ||
    typeof parsed.version !== 'string'
  ) {
    throw new TypeError(`invalid package metadata: ${filePath}`);
  }
  return { name: parsed.name, version: parsed.version };
}
