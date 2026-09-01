// Pure state-core facade. Filesystem persistence lives in bin/adapters/state-store.

export {
  applyOutputStyle,
  DEFAULT_STATE,
  INTENSITIES,
  isIntensity,
  isOutputStyle,
  normalizeState,
  OUTPUT_STYLES,
  OUTPUT_STYLE_SUFFIX,
  type FeynmanState,
  type Intensity,
  type OutputStyle,
} from './model.ts';
export { assertTagPairs, readRulesForIntensity } from './rules.ts';
