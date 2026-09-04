// bin/cli/ansi.ts — ANSI colour helpers

type Color = (s: string) => string;
interface ColorMap {
  readonly bold: Color;
  readonly green: Color;
  readonly red: Color;
  readonly dim: Color;
}

const NO_COLOR = process.env['NO_COLOR'] !== undefined;

export const c: ColorMap = {
  bold: (s: string) => (NO_COLOR ? s : `\x1b[1m${s}\x1b[0m`),
  green: (s: string) => (NO_COLOR ? s : `\x1b[32m${s}\x1b[0m`),
  red: (s: string) => (NO_COLOR ? s : `\x1b[31m${s}\x1b[0m`),
  dim: (s: string) => (NO_COLOR ? s : `\x1b[2m${s}\x1b[0m`),
};
