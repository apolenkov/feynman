// State domain model and pure formatting/normalization rules.

export const INTENSITIES = Object.freeze(['lite', 'full', 'ultra'] as const);
export const OUTPUT_STYLES = Object.freeze(['short', 'middle', 'full'] as const);

export type Intensity = (typeof INTENSITIES)[number];
export type OutputStyle = (typeof OUTPUT_STYLES)[number];

export interface FeynmanState {
  readonly enabled: boolean;
  readonly intensity: Intensity;
  readonly output_style: OutputStyle;
  readonly injections: number;
}

export const DEFAULT_STATE: FeynmanState = Object.freeze({
  enabled: true,
  intensity: 'full',
  output_style: 'full',
  injections: 0,
});

export const OUTPUT_STYLE_SUFFIX: Readonly<Partial<Record<OutputStyle, string>>> = Object.freeze({
  short:
    '\n\nOutput style: short — dot-leader and inline glyphs only; no frames, no ASCII art, no trees.',
  middle:
    '\n\nOutput style: middle — frame blocks only for ≥6 items; prefer trees and markdown tables.',
});

export function isIntensity(value: unknown): value is Intensity {
  return INTENSITIES.some((intensity) => intensity === value);
}

export function isOutputStyle(value: unknown): value is OutputStyle {
  return OUTPUT_STYLES.some((style) => style === value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Convert arbitrary JSON into the one safe state shape used by the runtime. */
export function normalizeState(raw: unknown): FeynmanState {
  const record = isRecord(raw) ? raw : {};
  return {
    enabled: typeof record['enabled'] === 'boolean' ? record['enabled'] : DEFAULT_STATE.enabled,
    intensity: isIntensity(record['intensity']) ? record['intensity'] : DEFAULT_STATE.intensity,
    output_style: isOutputStyle(record['output_style'])
      ? record['output_style']
      : DEFAULT_STATE.output_style,
    injections:
      nonNegativeInteger(record['injections']) ??
      nonNegativeInteger(record['count']) ??
      DEFAULT_STATE.injections,
  };
}

/** Append a safe, optional output-style hint to injected rules. */
export function applyOutputStyle(rulesText: string, outputStyle: unknown): string {
  const styleValue = isOutputStyle(outputStyle) ? outputStyle : 'full';
  const styleSuffix = OUTPUT_STYLE_SUFFIX[styleValue];
  return rulesText + (styleSuffix ?? '');
}
