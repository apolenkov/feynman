// lib/lint/autofix.js — pure-function autofix for ASCII frame blocks.
// Repairs misaligned │ / ┌─┐ / └─┘ borders so the right edge lines up.
// Zero deps. CommonJS. No I/O — text in, text out.
'use strict';

const { visualWidth } = require('./width');

// Strip indent prefix and the outer │ chars from an inner line. Returns the
// raw cell content without trailing space.
function unwrapInner(line, indent) {
  let s = line;
  if (indent && s.startsWith(indent)) s = s.slice(indent.length);
  // Drop leading │ and trailing │ (the latter may have padding before it).
  s = s.replace(/^│/, '').replace(/\s*│\s*$/, '');
  return s;
}

function autofixFrame(node) {
  const indent = node.indent || '';
  const inner = node.inner.map(line => unwrapInner(line, indent));
  // Compute target inner width. Floor on the top border's dash count so a
  // deliberately-wide clean frame stays idempotent (we don't squeeze it down
  // to the smallest content width). Min 1 to avoid degenerate ┌┐.
  const topDashes = (node.top && node.top.match(/─/g) || []).length;
  const W = Math.max(1, topDashes, ...inner.map(visualWidth));
  const dash = '─'.repeat(W);
  const top = indent + '┌' + dash + '┐';
  const bot = indent + '└' + dash + '┘';
  const fixed = inner.map(content => {
    const pad = ' '.repeat(Math.max(0, W - visualWidth(content)));
    return indent + '│' + content + pad + '│';
  });
  return [top, ...fixed, bot].join('\n');
}

// Walk text, locate frame regions (sequence of lines starting with ┌ … ending
// with └), build node objects, and rewrite each region in place.
//
// Rules:
//   - Skip frames inside fenced code blocks (lines after ``` until the matching
//     closing ```). Those are user-authored samples; never modify.
//   - Empty frames (┌┐ next to └┘ with no inner lines) — return unchanged.
//   - Each frame is matched by indent: the top line's leading whitespace must
//     equal the bottom line's leading whitespace; inner lines are required to
//     start with the same indent + │ so we don't accidentally swallow prose.
function autofix(text) {
  if (!text || text.indexOf('┌') === -1) return text;
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  let inFence = false;
  while (i < lines.length) {
    const line = lines[i];
    // Fenced code block toggle — leave fenced content untouched.
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      out.push(line);
      i++;
      continue;
    }
    if (inFence) {
      out.push(line);
      i++;
      continue;
    }
    const topMatch = line.match(/^(\s*)┌─*┐\s*$/);
    if (!topMatch) {
      out.push(line);
      i++;
      continue;
    }
    const indent = topMatch[1];
    // Find the matching └ at the same indent. Inner lines must start with
    // `indent│` to be part of this frame; if any line breaks the pattern
    // before we find └, abort and treat the top line as plain.
    let j = i + 1;
    const inner = [];
    let closed = false;
    while (j < lines.length) {
      const next = lines[j];
      const botMatch = next.match(/^(\s*)└─*┘\s*$/);
      if (botMatch && botMatch[1] === indent) {
        closed = true;
        break;
      }
      // Inner lines must look like indent + │ … │
      if (!next.startsWith(indent + '│')) {
        break;
      }
      inner.push(next);
      j++;
    }
    if (!closed) {
      // No matching └ — emit top line as-is, continue from i+1.
      out.push(line);
      i++;
      continue;
    }
    if (inner.length === 0) {
      // Empty frame ┌┐ + └┘ — leave both lines alone.
      out.push(line);
      out.push(lines[j]);
      i = j + 1;
      continue;
    }
    const node = {
      kind: 'frame',
      top: line,
      inner,
      bottom: lines[j],
      indent,
    };
    out.push(autofixFrame(node));
    i = j + 1;
  }
  return out.join('\n');
}

module.exports = { autofix, autofixFrame, visualWidth };
