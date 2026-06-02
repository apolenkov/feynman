import { createRequire } from 'node:module';
import { VERSION_HELP } from '../cli/help.ts';

const require = createRequire(import.meta.url);
const PKG = require('../../package.json') as { version: string; name: string };
const VERSION = PKG.version;

export function cmdVersion(args: string[]): void {
  if (args.includes('--help')) {
    console.log(VERSION_HELP);
    process.exit(0);
  }
  console.log(VERSION);
  process.exit(0);
}
