import fs from 'node:fs';
import path from 'node:path';

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
  for (const entry of fs.readdirSync(src, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const sourcePath = path.join(src, entry.name);
    const destPath   = path.join(dest, entry.name);

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
