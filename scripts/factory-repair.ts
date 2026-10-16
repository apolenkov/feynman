import fs from 'node:fs';
import { authenticateRoleReservation } from './factory-role-authority.ts';
import { factoryMain, record } from './factory-protocol.ts';
import type { FactoryContext, FactoryDecision } from './factory-protocol.ts';

const HOLD = Object.freeze({ effects: 'HOLD', provider_allowed: false, writer_allowed: false });

function denied(): FactoryDecision {
  return {
    status: 'denied',
    reason: 'Repair preparation denied; authenticated reservation evidence required',
    record: HOLD,
  };
}

/** Prepares read-only evidence; never executes roles or authorizes effects. */
export async function runRepair(context: FactoryContext, input: unknown): Promise<FactoryDecision> {
  try {
    const request = record(input);
    const keys = ['command', 'issue_number', 'event_id'];
    const issue = request['issue_number'];
    const event = request['event_id'];
    if (
      Object.keys(request).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(request, key)) ||
      request['command'] !== 'prepare' ||
      typeof issue !== 'number' ||
      !Number.isSafeInteger(issue) ||
      issue < 1 ||
      typeof event !== 'string' ||
      event.trim() !== event ||
      !/^[1-9]\d*$/.test(event)
    )
      return denied();
    const prepared = await authenticateRoleReservation(
      context,
      process.env['FACTORY_ROLE_CONTROL_PIN'] ?? '',
      { issue_number: issue, event_id: event },
    );
    return {
      status: 'prepared',
      reason: 'Read-only reservation evidence prepared; effects HOLD',
      record: { ...prepared, ...HOLD },
    };
  } catch {
    return denied();
  }
}

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2);
  const file =
    args.length === 2 ? args[1] : args.length === 3 && args[1] === '--input' ? args[2] : undefined;
  if (args[0] !== 'prepare' || file === undefined || !file || file.startsWith('-')) {
    fs.writeSync(process.stdout.fd, `${JSON.stringify(denied())}\n`);
    process.exit(1);
  }
  await factoryMain(runRepair);
}
