import path from 'node:path';
import { VERSION_HELP } from '../cli/help.ts';
import { readPackageMetadata } from '../adapters/package-metadata.ts';

const PKG = readPackageMetadata(path.resolve(import.meta.dirname, '..', '..', 'package.json'));
const VERSION = PKG.version;

export function cmdVersion(args: readonly string[]): void {
  if (args.includes('--help')) {
    console.log(VERSION_HELP);
    process.exit(0);
  }
  console.log(VERSION);
  process.exit(0);
}
