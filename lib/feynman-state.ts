// lib/feynman-state.ts — canonical FeynmanState interface, defaults, and style map.
// Imported by hooks/feynman-activate.ts, hooks/feynman-session-start.ts, bin/feynman.ts.
// Zero runtime dependencies. ESM + TypeScript (Node.js v22.6+ strip-types).

export interface FeynmanState {
  enabled: boolean;
  intensity: string;
  output_style?: string;
  injections: number;
  malformed_rules?: boolean;
  /** @deprecated legacy field, migrated to injections */
  count?: number;
}

export const DEFAULT_STATE: FeynmanState = {
  enabled: true,
  intensity: 'full',
  output_style: 'full',
  injections: 0,
};

// One-line suffix per output_style. `full` is the default — no suffix.
// Suffix is appended to additionalContext after the rules text (Phase 10
// STYLE-03). Keeps rules-file 4480-byte budget intact — pure runtime hint.
export const OUTPUT_STYLE_SUFFIX: Record<string, string> = {
  short:  '\n\nOutput style: short — dot-leader and inline glyphs only; no frames, no ASCII art, no trees.',
  middle: '\n\nOutput style: middle — frame blocks only for ≥6 items; prefer trees and markdown tables.',
};

// ─── Rules extraction ─────────────────────────────────────────────────────────

const VALID_INTENSITIES = ['lite', 'full', 'ultra'];

// XML matcher map: tolerate trailing attributes (WR-01) and case (WR-03).
const XML_MATCHERS: Record<string, RegExp> = {
  lite:  /<intensity\s+name\s*=\s*["']lite["'][^>]*>([\s\S]*?)<\/intensity>/i,
  full:  /<intensity\s+name\s*=\s*["']full["'][^>]*>([\s\S]*?)<\/intensity>/i,
  ultra: /<intensity\s+name\s*=\s*["']ultra["'][^>]*>([\s\S]*?)<\/intensity>/i,
};

/**
 * Extract the intensity-gated block from rules file content.
 *
 * Supports XML format (<intensity name="X">…</intensity>) and legacy
 * HTML-comment format (<!-- X --> … <!-- /X -->). Returns the extracted block
 * as a trimmed string, or '' if the intensity block is not found.
 *
 * Callers are responsible for their own policy (malformed-rules handling,
 * tag-pair sanity checks, fallback to whole file, etc.).
 */
export function readRulesForIntensity(rulesContent: string, intensity: string): string {
  const selected = VALID_INTENSITIES.includes(intensity) ? intensity : 'full';

  const xmlMatch = XML_MATCHERS[selected]!.exec(rulesContent);
  if (xmlMatch) return xmlMatch[1]!.trim();

  // Legacy HTML-comment fallback (kept until Plan 02 rule-file rewrite lands).
  const openMarker  = '<!-- ' + selected + ' -->';
  const closeMarker = '<!-- /' + selected + ' -->';
  const i1 = rulesContent.indexOf(openMarker);
  const i2 = rulesContent.indexOf(closeMarker, i1);
  if (i1 !== -1 && i2 !== -1) return rulesContent.slice(i1 + openMarker.length, i2).trim();

  return '';
}
