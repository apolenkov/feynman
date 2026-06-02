#!/usr/bin/env node
// bin/feynman.ts — feynman unified CLI
// Subcommands: install, uninstall, doctor, lint, examples, bootstrap, version, help
// Zero runtime deps. ESM TypeScript. Node >= 22.6.

import { HELP, INSTALL_HELP, UNINSTALL_HELP, DOCTOR_HELP, cmdHelp } from './cli/help.ts';
import { parseTarget } from './cli/targets.ts';
import { cmdExamples } from './commands/examples.ts';
import { cmdVersion } from './commands/version.ts';
import { cmdLint } from './commands/lint.ts';
import { cmdBootstrap } from './commands/bootstrap.ts';
import { cmdInstall, cmdUninstall } from './commands/install.ts';
import { cmdDoctor } from './commands/doctor.ts';

// ─── Help text ────────────────────────────────────────────────────────────────
// Moved to bin/cli/help.ts; imported above.

// ─── Install/Uninstall ────────────────────────────────────────────────────────
// Moved to bin/commands/install.ts; imported above.

// ─── Doctor ───────────────────────────────────────────────────────────────────
// Moved to bin/commands/doctor.ts; imported above.

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const sub  = argv[0];
const rest = argv.slice(1);

// Top-level --help / -h / no args
if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
  if (!sub) {
    // No args → help + exit 2
    console.log(HELP);
    process.exit(2);
  }
  cmdHelp();
}

switch (sub) {
  case 'install': {
    if (rest.includes('--help')) { console.log(INSTALL_HELP); process.exit(0); }
    const parsed = parseTarget(rest);
    const force = parsed.args.includes('--force');
    cmdInstall({ force, target: parsed.target });
    break;
  }
  case 'uninstall': {
    if (rest.includes('--help')) { console.log(UNINSTALL_HELP); process.exit(0); }
    const parsed = parseTarget(rest);
    cmdUninstall({ target: parsed.target });
    break;
  }
  case 'doctor': {
    if (rest.includes('--help')) { console.log(DOCTOR_HELP); process.exit(0); }
    const parsed = parseTarget(rest);
    cmdDoctor({ target: parsed.target });
    break;
  }
  case 'lint': {
    cmdLint(rest);
    break;
  }
  case 'examples': {
    cmdExamples(rest);
    break;
  }
  case 'bootstrap': {
    cmdBootstrap(rest);
    break;
  }
  case 'version': {
    cmdVersion(rest);
    break;
  }
  default: {
    console.error(`feynman: unknown subcommand '${sub}'`);
    console.log(HELP);
    process.exit(2);
  }
}
