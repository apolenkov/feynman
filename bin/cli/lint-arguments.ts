export const USAGE = `Usage: feynman-lint <file.md>
       feynman-lint -          (read from stdin)
       feynman-lint --json <file>
       feynman-lint --strict <file>
       feynman-lint --fix <file>
       feynman-lint --explain <file>
       feynman-lint --help

Options:
  --json     Output issues as JSON object
  --strict   Treat warnings as errors (exit 1 on any issue)
  --fix      Repair misaligned ASCII frames in-place; exit 0 on success
  --explain  Annotate each frame with token-cost breakdown (read-only)
  --help     Show this help message

Exit codes:
  0   No errors (or no issues in default mode)
  1   Lint failure (errors found, or warnings in --strict mode)
  2   Usage error (bad arguments, file not found)
`;

interface LintArguments {
  readonly useJson: boolean;
  readonly useStrict: boolean;
  readonly useFix: boolean;
  readonly useExplain: boolean;
  readonly filePath: string | null;
  readonly useStdin: boolean;
}

interface LintInputFile {
  readonly kind: 'file';
  readonly path: string;
}

interface LintInputStdin {
  readonly kind: 'stdin';
}

interface ParsedLintArguments {
  readonly kind: 'lint';
  readonly useJson: boolean;
  readonly useStrict: boolean;
  readonly useExplain: boolean;
  readonly input: LintInputFile | LintInputStdin;
}

interface ParsedFixArguments {
  readonly kind: 'fix';
  readonly filePath: string;
}

interface HelpArguments {
  readonly kind: 'help';
}

interface InvalidArguments {
  readonly kind: 'error';
  readonly message: string;
}

export type ArgumentParseResult =
  ParsedLintArguments | ParsedFixArguments | HelpArguments | InvalidArguments;

const DEFAULT_ARGUMENTS: LintArguments = {
  useJson: false,
  useStrict: false,
  useFix: false,
  useExplain: false,
  filePath: null,
  useStdin: false,
};

type ScanResult = LintArguments | HelpArguments | InvalidArguments;

function isTerminal(result: ScanResult): result is HelpArguments | InvalidArguments {
  return 'kind' in result;
}

export function parseArguments(argv: readonly string[]): ArgumentParseResult {
  const scanned = argv.reduce<ScanResult>((current, arg) => {
    if (isTerminal(current)) return current;
    if (arg === '--json') return { ...current, useJson: true };
    if (arg === '--strict') return { ...current, useStrict: true };
    if (arg === '--fix') return { ...current, useFix: true };
    if (arg === '--explain') return { ...current, useExplain: true };
    if (arg === '--help') return { kind: 'help' };
    if (arg === '-') return { ...current, useStdin: true };
    if (arg.startsWith('-')) {
      return {
        kind: 'error',
        message: `feynman-lint: unknown flag '${arg}'\n${USAGE}`,
      };
    }
    if (current.filePath !== null) {
      return {
        kind: 'error',
        message: `feynman-lint: too many file arguments\n${USAGE}`,
      };
    }
    return { ...current, filePath: arg };
  }, DEFAULT_ARGUMENTS);

  if (isTerminal(scanned)) return scanned;
  if (scanned.filePath === null) {
    if (!scanned.useStdin) return { kind: 'error', message: USAGE };
    if (!scanned.useFix) {
      return {
        kind: 'lint',
        useJson: scanned.useJson,
        useStrict: scanned.useStrict,
        useExplain: scanned.useExplain,
        input: { kind: 'stdin' },
      };
    }
    return {
      kind: 'error',
      message: 'feynman-lint: --fix requires a file path (not stdin)\n',
    };
  }
  if (scanned.useFix && scanned.useStdin) {
    return {
      kind: 'error',
      message: 'feynman-lint: --fix requires a file path (not stdin)\n',
    };
  }
  if (scanned.useFix) return { kind: 'fix', filePath: scanned.filePath };
  return {
    kind: 'lint',
    useJson: scanned.useJson,
    useStrict: scanned.useStrict,
    useExplain: scanned.useExplain,
    input: scanned.useStdin ? { kind: 'stdin' } : { kind: 'file', path: scanned.filePath },
  };
}
