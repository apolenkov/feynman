#!/usr/bin/env node
// Conventional-commit release notes with lossless preservation of older sections.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { atomicWrite } from '../bin/adapters/fs.ts';
import { readPackageMetadata } from '../bin/adapters/package-metadata.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

export interface Commit {
  readonly hash: string;
  readonly subject: string;
  readonly body: string;
}

type GitCommand = (root: string, args: readonly string[]) => string;

function runGit(root: string, args: readonly string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    const detail =
      result.error?.message ?? (result.stderr.trim() || `exit ${String(result.status)}`);
    throw new Error(`git ${args[0] ?? 'command'} failed: ${detail}`, { cause: result.error });
  }
  return result.stdout.trim();
}

function previousTag(git: (args: readonly string[]) => string): string {
  // An untagged HEAD is a successful empty result. Other git failures propagate.
  const currentTags = git(['tag', '--points-at', 'HEAD']).split('\n').filter(Boolean);
  const tags = git(['tag', '--sort=-creatordate', '--merged', 'HEAD']).split('\n').filter(Boolean);
  return tags.find((tag) => !currentTags.includes(tag)) ?? '';
}

function commitsSince(git: (args: readonly string[]) => string, tag: string): readonly Commit[] {
  const range = tag.length > 0 ? `${tag}..HEAD` : 'HEAD';
  const output = git(['log', range, '--pretty=format:%H%x1f%s%x1f%b%x1e']);
  return output
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash = '', subject = '', body = ''] = entry.split('\x1f');
      return { hash: hash.slice(0, 7), subject, body };
    });
}

const SECTIONS: Readonly<Record<string, string>> = {
  feat: 'Features',
  fix: 'Fixes',
  docs: 'Documentation',
  test: 'Tests',
  ci: 'CI/CD',
  chore: 'Maintenance',
  refactor: 'Maintenance',
  perf: 'Performance',
  build: 'Build',
};
const SECTION_ORDER = [
  'Breaking Changes',
  'Features',
  'Fixes',
  'CI/CD',
  'Build',
  'Documentation',
  'Tests',
  'Performance',
  'Maintenance',
  'Other',
] as const;

export function classify(subject: string, body = ''): readonly [string, string] {
  const match = /^(\w+)(?:\([^)]+\))?(!)?:\s+(.+)$/.exec(subject);
  const type = match?.[1]?.toLowerCase() ?? 'other';
  const text = match?.[3] ?? subject;
  const breaking = match?.[2] === '!' || /^BREAKING(?: CHANGE|-CHANGE):[ \t]+\S/m.test(body);
  return [breaking ? 'Breaking Changes' : (SECTIONS[type] ?? 'Other'), text];
}

export function render(
  version: string,
  tag: string,
  commits: readonly Commit[],
  date: string = new Date().toISOString().slice(0, 10),
): string {
  const entries = commits.map((commit) => {
    const [section, text] = classify(commit.subject, commit.body);
    return { section, text: `- ${text}` };
  });
  // The section set is fixed: this remains linear in the number of commits.
  const groups = SECTION_ORDER.flatMap((section) => {
    const items = entries.filter((entry) => entry.section === section).map((entry) => entry.text);
    return items.length === 0 ? [] : [`### ${section}`, '', ...items, ''];
  });
  const section = [
    `## ${version} - ${date}`,
    '',
    ...(tag.length === 0 ? [] : [`Changes since ${tag}.`, '']),
    ...(commits.length === 0 ? ['- No code changes since the latest tag.', ''] : groups),
  ]
    .join('\n')
    .trimEnd();
  return [
    '# Changelog',
    '',
    'All notable changes to this project are documented here.',
    '',
    section,
    `<!-- feynman-generated: ${sectionHash(section)} -->`,
    '',
  ].join('\n');
}

function sectionHash(text: string): string {
  return createHash('sha256').update(text.trimEnd()).digest('hex');
}

function sectionsOf(text: string): readonly { readonly title: string; readonly text: string }[] {
  const headings = Array.from(text.matchAll(/^##[ \t]+([^\n]+)$/gm));
  return headings.map((heading, index) => ({
    title: heading[1] ?? '',
    text: text.slice(heading.index, headings[index + 1]?.index),
  }));
}

function isCurrentRelease(title: string, version: string): boolean {
  return (
    title === version ||
    title.startsWith(`${version} `) ||
    title === `[${version}]` ||
    title.startsWith(`[${version}] `)
  );
}

function isUntouchedGeneratedSection(text: string): boolean {
  const section = text.trimEnd();
  const marker = /\n<!-- feynman-generated: ([a-f0-9]{64}) -->$/.exec(section);
  return marker !== null && marker[1] === sectionHash(section.slice(0, marker.index));
}

function hasCuratedCurrentRelease(existing: string, version: string): boolean {
  return sectionsOf(existing).some(
    (section) =>
      isCurrentRelease(section.title, version) && !isUntouchedGeneratedSection(section.text),
  );
}

/** Promote curated notes without inferring a range from incomplete tag history. */
export function promoteUnreleased(
  existing: string,
  version: string,
  date: string,
): string | undefined {
  // A release that already exists must not gain a duplicate version heading.
  // Keep both the existing release and pending Unreleased notes for review.
  if (sectionsOf(existing).some((section) => isCurrentRelease(section.title, version))) {
    return undefined;
  }
  const heading = /^## \[Unreleased\][ \t]*$/m.exec(existing);
  if (heading === null) return undefined;
  const afterHeading = heading.index + heading[0].length;
  const nextSection = existing.indexOf('\n## ', afterHeading);
  const body = existing.slice(afterHeading, nextSection === -1 ? undefined : nextSection);
  if (body.trim().length === 0) return undefined;
  return `${existing.slice(0, heading.index)}## ${version} - ${date}${existing.slice(afterHeading)}`;
}

/** Replace only the current release, retaining the preamble and every other section. */
export function mergeGeneratedChangelog(
  existing: string,
  generated: string,
  version: string,
): string {
  if (hasCuratedCurrentRelease(existing, version)) return existing;
  const headings = Array.from(existing.matchAll(/^##[ \t]+([^\n]+)$/gm));
  const generatedHeading = /^##[ \t]+/m.exec(generated);
  if (generatedHeading === null) throw new Error('generated changelog has no release section');
  const preamble =
    headings.length > 0
      ? existing.slice(0, headings[0]?.index)
      : existing.trim().length > 0
        ? existing
        : generated.slice(0, generatedHeading.index);
  const sections = sectionsOf(existing);
  const unreleased = sections.filter((section) => section.title === '[Unreleased]');
  const retained = sections.filter(
    (section) => section.title !== '[Unreleased]' && !isCurrentRelease(section.title, version),
  );
  return (
    [
      preamble.trimEnd(),
      ...unreleased.map((section) => section.text.trimEnd()),
      generated.slice(generatedHeading.index).trimEnd(),
      ...retained.map((section) => section.text.trimEnd()),
    ].join('\n\n') + '\n'
  );
}

/** The optional command boundary allows isolated failure tests without changing git state. */
export function generateChangelog(root: string = ROOT, gitCommand: GitCommand = runGit): void {
  const pkg = readPackageMetadata(path.join(root, 'package.json'));
  const changelogPath = path.join(root, 'CHANGELOG.md');
  const existing = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';
  const date = new Date().toISOString().slice(0, 10);
  const promoted = promoteUnreleased(existing, pkg.version, date);
  if (promoted !== undefined) {
    atomicWrite(changelogPath, promoted);
    console.log(`CHANGELOG.md promoted [Unreleased] for ${pkg.version}`);
    return;
  }
  if (hasCuratedCurrentRelease(existing, pkg.version)) {
    console.log(`CHANGELOG.md retained curated notes for ${pkg.version}`);
    return;
  }
  const git = (args: readonly string[]): string => gitCommand(root, args);
  const tag = previousTag(git);
  const commits = commitsSince(git, tag);
  const content = mergeGeneratedChangelog(
    existing,
    render(pkg.version, tag, commits, date),
    pkg.version,
  );
  atomicWrite(changelogPath, content);
  console.log(
    `CHANGELOG.md updated for ${pkg.version} (${commits.length} commits since ${tag || 'repo start'})`,
  );
}

export function changelogMain(): void {
  try {
    generateChangelog();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (import.meta.main) changelogMain();
