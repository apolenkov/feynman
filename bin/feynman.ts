#!/usr/bin/env node
// bin/feynman.ts — feynman unified CLI
// Subcommands: install, uninstall, doctor, lint, examples, bootstrap, version, help
// Zero runtime deps. ESM TypeScript. Node >= 22.18.

import {
  HELP,
  INSTALL_HELP,
  UNINSTALL_HELP,
  DOCTOR_HELP,
  STATE_HELP,
  cmdHelp,
} from './cli/help.ts';
import { cmdExamples } from './commands/examples.ts';
import { cmdVersion } from './commands/version.ts';
import { cmdLint } from './commands/lint.ts';
import { cmdBootstrap } from './commands/bootstrap.ts';
import { cmdInstall, cmdUninstall } from './commands/install.ts';
import { cmdDoctor } from './commands/doctor.ts';
import { cmdState } from './commands/state.ts';

/** Dispatch one CLI invocation; exported so all public routes are testable. */
export function main(argv = process.argv.slice(2)): void {
  const sub = argv[0];
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
      if (rest.includes('--help')) {
        console.log(INSTALL_HELP);
        process.exit(0);
      }
      const force = rest.includes('--force');
      const unknown = rest.filter((arg) => arg !== '--force');
      if (unknown.length > 0) {
        console.error(`feynman install: unexpected arguments "${unknown.join(' ')}"`);
        process.exit(2);
      }
      cmdInstall({ force });
      break;
    }
    case 'uninstall': {
      if (rest.includes('--help')) {
        console.log(UNINSTALL_HELP);
        process.exit(0);
      }
      if (rest.length > 0) {
        console.error(`feynman uninstall: unexpected arguments "${rest.join(' ')}"`);
        process.exit(2);
      }
      cmdUninstall();
      break;
    }
    case 'doctor': {
      if (rest.includes('--help')) {
        console.log(DOCTOR_HELP);
        process.exit(0);
      }
      if (rest.length > 0) {
        console.error(`feynman doctor: unexpected arguments "${rest.join(' ')}"`);
        process.exit(2);
      }
      cmdDoctor();
      break;
    }
    case 'state':
    case 'status': {
      if (rest.includes('--help') || rest.includes('-h')) {
        console.log(STATE_HELP);
        process.exit(0);
      }
      cmdState(sub === 'status' ? ['status', ...rest] : rest);
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
}

if (import.meta.main) main();
