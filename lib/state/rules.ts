// Pure rules parsing and intensity-tag validation.

import { isIntensity, type Intensity } from './model.ts';

const XML_MATCHERS: Readonly<Record<Intensity, RegExp>> = {
  lite: /<intensity\s+name\s*=\s*["']lite["'][^>]*>([\s\S]*?)<\/intensity>/i,
  full: /<intensity\s+name\s*=\s*["']full["'][^>]*>([\s\S]*?)<\/intensity>/i,
  ultra: /<intensity\s+name\s*=\s*["']ultra["'][^>]*>([\s\S]*?)<\/intensity>/i,
};

/** Return whether named opening and closing intensity tags are balanced. */
export function assertTagPairs(content: string): boolean {
  const opens = (content.match(/<intensity\s+name\s*=/gi) || []).length;
  const closes = (content.match(/<\/intensity>/gi) || []).length;
  return opens === closes;
}

/** Extract one intensity block, or an empty string when it is unavailable. */
export function readRulesForIntensity(rulesContent: string, intensity: string): string {
  const selected = isIntensity(intensity) ? intensity : 'full';
  const xmlMatch = XML_MATCHERS[selected].exec(rulesContent);
  return xmlMatch?.[1]?.trim() ?? '';
}
