// bin/adapters/fs.ts — filesystem operations used by application commands.

import fs from 'node:fs';
import path from 'node:path';

/** Replace complete file contents only after the new bytes are safely written. */
export function atomicWrite(filePath: string, content: string): void {
  const destination = fs.existsSync(filePath) ? fs.realpathSync(filePath) : filePath;
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(parent, '.feynman-write-'));
  const staged = path.join(temporary, 'content');
  try {
    const mode = fs.existsSync(destination) ? fs.statSync(destination).mode & 0o777 : 0o600;
    const descriptor = fs.openSync(staged, 'wx', mode);
    try {
      fs.fchmodSync(descriptor, mode);
      fs.writeFileSync(descriptor, content, 'utf8');
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(staged, destination);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function copyFileIfExists(src: string, dest: string): boolean {
  if (!fs.existsSync(src)) return false;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

export function copyMarkdownDir(src: string, dest: string): number {
  if (!fs.existsSync(src)) return 0;
  return fs
    .readdirSync(src, { withFileTypes: true })
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .reduce((copied, entry) => {
      const sourcePath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) return copied + copyMarkdownDir(sourcePath, destPath);
      if (!entry.isFile() || !entry.name.endsWith('.md')) return copied;
      ensureDir(path.dirname(destPath));
      fs.copyFileSync(sourcePath, destPath);
      return copied + 1;
    }, 0);
}

/** Copy every regular file in a directory tree and return the copied-file count. */
export function copyDirectory(src: string, dest: string): number {
  if (!fs.existsSync(src)) return 0;
  return fs
    .readdirSync(src, { withFileTypes: true })
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .reduce((copied, entry) => {
      const sourcePath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) return copied + copyDirectory(sourcePath, destPath);
      if (!entry.isFile()) return copied;
      ensureDir(path.dirname(destPath));
      fs.copyFileSync(sourcePath, destPath);
      return copied + 1;
    }, 0);
}
