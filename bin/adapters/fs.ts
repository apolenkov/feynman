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
  let copied = 0;
  for (const entry of fs
    .readdirSync(src, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const sourcePath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copied += copyMarkdownDir(sourcePath, destPath);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }

    ensureDir(path.dirname(destPath));
    fs.copyFileSync(sourcePath, destPath);
    copied += 1;
  }
  return copied;
}

/** Copy every regular file in a directory tree and return the copied-file count. */
export function copyDirectory(src: string, dest: string): number {
  if (!fs.existsSync(src)) return 0;
  let copied = 0;
  for (const entry of fs
    .readdirSync(src, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const sourcePath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copied += copyDirectory(sourcePath, destPath);
    } else if (entry.isFile()) {
      ensureDir(path.dirname(destPath));
      fs.copyFileSync(sourcePath, destPath);
      copied += 1;
    }
  }
  return copied;
}
