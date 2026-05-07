#!/usr/bin/env node
// scripts/generate-changelog.js — zero-dep changelog from conventional commits.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');

function git(args, fallback = '') {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) return fallback;
  return (result.stdout || '').trim();
}

function latestTag() {
  return git(['describe', '--tags', '--abbrev=0'], '');
}

function commitRange(tag) {
  return tag ? `${tag}..HEAD` : 'HEAD';
}

function commitsSince(tag) {
  const format = '%H%x1f%s%x1f%b%x1e';
  const out = git(['log', commitRange(tag), `--pretty=format:${format}`], '');
  return out.split('\x1e')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const [hash, subject, body = ''] = entry.split('\x1f');
      return { hash: hash.slice(0, 7), subject, body };
    });
}

function classify(subject) {
  const match = subject.match(/^(\w+)(?:\([^)]+\))?!?:\s+(.+)$/);
  const type = match ? match[1] : 'other';
  const text = match ? match[2] : subject;
  if (subject.includes('!:') || /\nBREAKING CHANGE:/i.test(subject)) {
    return ['Breaking Changes', text];
  }
  const sections = {
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
  return [sections[type] || 'Other', text];
}

function render(version, tag, commits) {
  const date = new Date().toISOString().slice(0, 10);
  const groups = new Map();

  for (const commit of commits) {
    const [section, text] = classify(commit.subject);
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(`- ${text}`);
  }

  const order = [
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
  ];

  const lines = [
    '# Changelog',
    '',
    'All notable changes to this project are documented here.',
    '',
    `## ${version} - ${date}`,
    '',
  ];

  if (tag) {
    lines.push(`Changes since ${tag}.`, '');
  }

  if (commits.length === 0) {
    lines.push('- No code changes since the latest tag.', '');
  } else {
    for (const section of order) {
      const entries = groups.get(section);
      if (!entries || entries.length === 0) continue;
      lines.push(`### ${section}`, '', ...entries, '');
    }
  }

  return lines.join('\n');
}

const tag = latestTag();
const commits = commitsSince(tag);
const generated = render(pkg.version, tag, commits);
const existing = fs.existsSync(CHANGELOG) ? fs.readFileSync(CHANGELOG, 'utf8') : '';
const previous = existing.replace(/^# Changelog[\s\S]*?(?=^##\s)/m, '').trim();
const content = previous && !previous.startsWith(`## ${pkg.version} `)
  ? `${generated}\n${previous}\n`
  : `${generated}\n`;

fs.writeFileSync(CHANGELOG, content);
console.log(`CHANGELOG.md updated for ${pkg.version} (${commits.length} commits since ${tag || 'repo start'})`);
