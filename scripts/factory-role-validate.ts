import fs from 'node:fs';
import { parseFactoryJson, sha256 } from './factory-protocol.ts';
import { validateRoleChain } from './factory-roles.ts';

const MAX_BYTES = 1_000_000;

function readBounded(fd: number, bytes: Buffer, length = 0): Buffer {
  if (length > MAX_BYTES) throw new Error('Invalid file size');
  const read = fs.readSync(fd, bytes, length, bytes.length - length, null);
  return read === 0 ? bytes.subarray(0, length) : readBounded(fd, bytes, length + read);
}

function main(argv: readonly string[]): void {
  const [command, file] = argv;
  if (
    argv.length !== 2 ||
    command !== 'validate' ||
    file === undefined ||
    !file ||
    file.startsWith('-')
  )
    throw new Error('Invalid arguments');
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('Invalid file');
    // Bound the actual read too: the file may grow after fstat.
    const bytes = readBounded(fd, Buffer.alloc(MAX_BYTES + 1));
    const receipt = validateRoleChain(parseFactoryJson(bytes));
    console.log(JSON.stringify({ status: 'validated-structure', receipt_sha256: sha256(receipt) }));
  } finally {
    fs.closeSync(fd);
  }
}

if (process.argv[1] === import.meta.filename) {
  try {
    main(process.argv.slice(2));
  } catch {
    fs.writeSync(
      process.stderr.fd,
      'Invalid role chain input or command; structural validation only\n',
    );
    process.exit(1);
  }
}
