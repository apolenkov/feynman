import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createJiti } from 'jiti';
import type { TemplateToken } from '@actions/workflow-parser/templates/tokens/template-token';

// The official package imports JSON without Node's required attribute; use the standard loader.
const {
  isBoolean,
  isMapping,
  isScalar,
  isSequence,
  isString,
  NoOperationTraceWriter,
  parseWorkflow,
} = await createJiti(import.meta.url, { tryNative: false }).import<
  typeof import('@actions/workflow-parser')
>('@actions/workflow-parser');

const RELEASE = '1.7.12';
const ARCHIVE_DIGESTS: Readonly<Record<string, string>> = Object.freeze({
  darwin_arm64: 'aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f',
  darwin_amd64: '5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644',
  linux_amd64: '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8',
  linux_arm64: '325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6',
});
// shortcut: upstream issue rhysd/actionlint#657, снять после релиза с поддержкой queue
const QUEUE_DIAGNOSTIC =
  '^unexpected key "queue" for "concurrency" section\\. expected one of "cancel-in-progress", "group"$';

function checkQueue(token: TemplateToken | undefined): void {
  if (token === undefined || !isMapping(token)) return;
  const queue = token.find('queue');
  const cancel = token.find('cancel-in-progress');
  if (
    queue !== undefined &&
    isString(queue) &&
    queue.value === 'max' &&
    cancel !== undefined &&
    (!isBoolean(cancel) || cancel.value)
  )
    throw new Error('queue:max requires cancel-in-progress:false');
}
export function validateWorkflowSchema(content: string, name: string): void {
  const result = parseWorkflow({ name, content }, new NoOperationTraceWriter());
  result.context.errors.check('Official workflow parser');
  if (result.value === undefined || !isMapping(result.value))
    throw new Error('Workflow mapping absent');
  checkQueue(result.value.find('concurrency'));
  const jobs = result.value.find('jobs');
  if (jobs !== undefined && isMapping(jobs))
    for (const job of jobs) if (isMapping(job.value)) checkQueue(job.value.find('concurrency'));
}
export const FACTORY_WORKFLOWS: readonly string[] = [
  'factory-control.yml',
  'factory-ingress.yml',
  'factory-operations.yml',
  'night-review.yml',
];
export const FACTORY_ENVIRONMENT = 'factory-privileged';
// shortcut: npm subcommand is the first non-option word, so `npm --prefix dir ci` and `echo npm i` misjudge; use a shell parser if that matters.
const NPM_INSTALL =
  /(?:^|[\s'"(])npm((?:\s+-\S+)*)\s+(ci|cit|ic|clean-install|clean-install-test|install-ci-test|install-clean|install-test|it|add|i|in|ins|inst|insta|instal|install|isnt|isnta|isntal|isntall)(?=[\s'")]|$)/;
// Every npm install-like command must carry a final truthy --ignore-scripts, outside comments.
function installsWithScripts(run: string): boolean {
  return run
    .replaceAll(/\\\r?\n/g, ' ')
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*/, ''))
    .flatMap((line) => line.split(/&&|\|\||[;|]/))
    .some((segment) => {
      if (!NPM_INSTALL.test(segment)) return false;
      const flag = segment
        .split(/[\s'"(),]+/)
        .findLast((token) => /^--(?:no-)?ignore-scripts(?:=|$)/.test(token));
      return flag !== '--ignore-scripts' && flag !== '--ignore-scripts=true';
    });
}
// PR-A enables nothing: while the factory is source-only these stay as written. A later PR that
// consciously turns on a scheduler, a provider secret or the activation flag changes these constants
// in the same reviewed diff instead of bypassing the gate.
export const INERT_POSTURE: {
  readonly activation: boolean;
  readonly scheduleAllowed: boolean;
  readonly secretNames: readonly string[];
} = { activation: false, scheduleAllowed: false, secretNames: ['GITHUB_TOKEN'] };
// Text of a scalar workflow token (expressions keep their `${{ }}` form); structures are not text.
const scalarText = (token: TemplateToken | undefined): string =>
  token !== undefined && isScalar(token) ? token.toString() : '';
export function validateInertPolicy(policy: unknown): void {
  const activation =
    typeof policy === 'object' && policy !== null && 'activation' in policy
      ? policy.activation
      : undefined;
  if (activation !== INERT_POSTURE.activation)
    throw new Error(`factory-policy.json: activation must be ${String(INERT_POSTURE.activation)}`);
}
function enablesFactoryFlag(token: TemplateToken): boolean {
  if (isMapping(token))
    return [...token].some(
      ({ key, value }) =>
        (scalarText(key).startsWith('FACTORY_') &&
          /^(?:\$\{\{\s*)?['"]?true['"]?(?:\s*\}\})?$/i.test(scalarText(value).trim())) ||
        enablesFactoryFlag(value),
    );
  return isSequence(token) && [...token].some(enablesFactoryFlag);
}
// shortcut: comment stripping is per line (`#` after whitespace) and secrets are matched textually;
// use the expression parser if a legitimate `#` inside a string ever hides a reference.
export function validateInertWorkflow(content: string, name: string): void {
  const result = parseWorkflow({ name, content }, new NoOperationTraceWriter());
  result.context.errors.check('Official workflow parser');
  if (result.value === undefined || !isMapping(result.value))
    throw new Error('Workflow mapping absent');
  const trigger = result.value.find('on');
  const triggers =
    trigger !== undefined && isMapping(trigger)
      ? [...trigger].map(({ key }) => scalarText(key))
      : trigger !== undefined && isSequence(trigger)
        ? [...trigger].map(scalarText)
        : [scalarText(trigger)];
  if (!INERT_POSTURE.scheduleAllowed && triggers.includes('schedule'))
    throw new Error(`${name}: schedule trigger is not enabled in this delivery`);
  const text = content
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*/, ''))
    .join('\n');
  if (/\bsecrets\s*:\s*inherit\b/.test(text) || /\bsecrets\s*\[/.test(text))
    throw new Error(`${name}: dynamic or inherited secrets are not enabled in this delivery`);
  for (const [, secret] of text.matchAll(/\bsecrets\.([A-Za-z_]\w*)/g))
    if (secret === undefined || !INERT_POSTURE.secretNames.includes(secret))
      throw new Error(`${name}: secret ${secret ?? ''} is not enabled in this delivery`);
  if (
    enablesFactoryFlag(result.value) ||
    /FACTORY_\w+\s*(?<![=!<>])=(?!=)\s*["']?true\b/i.test(text)
  )
    throw new Error(`${name}: FACTORY_* may only be read from vars, never set to true`);
}
// Controller entry points; `scripts/factory-protocol.ts emit` only echoes an authority marker.
const CONTROLLER_SCRIPT = /scripts\/factory-(?:control|publication|writer|operations)\.ts/;
const PIN_EXPRESSION = '${{ vars.FACTORY_ACTIVATION_POLICY_PIN }}';
// Static floor only: a token-holding job needs a protected environment, no lifecycle scripts at install,
// an explicit actions grant wherever it authenticates runs/jobs/logs/artifacts, and every controller
// invocation must receive the repository-variable policy pin. Trusted pinned admission before the checked-out
// repository code runs stays open (needs a trusted bootstrap or a deployment protection rule, see tasks.md).
export function validateFactoryHardening(content: string, name: string): void {
  const result = parseWorkflow({ name, content }, new NoOperationTraceWriter());
  result.context.errors.check('Official workflow parser');
  if (result.value === undefined || !isMapping(result.value))
    throw new Error('Workflow mapping absent');
  const jobs = result.value.find('jobs');
  if (jobs === undefined || !isMapping(jobs)) throw new Error(`${name}: jobs absent`);
  const levels = (permissions: TemplateToken): string[] =>
    isString(permissions)
      ? [permissions.value]
      : isMapping(permissions)
        ? [...permissions].flatMap(({ value }) => (isString(value) ? [value.value] : []))
        : [];
  for (const job of jobs) {
    if (!isMapping(job.value)) continue;
    const id = `${name}/${job.key.toString()}`;
    const permissions = job.value.find('permissions');
    const granted = permissions ?? result.value.find('permissions');
    // GitHub grants the default token scope when nothing is declared; treat it as write-all.
    const effective = granted === undefined ? ['write-all'] : levels(granted);
    const environment = job.value.find('environment');
    const environmentName =
      environment !== undefined && isMapping(environment) ? environment.find('name') : environment;
    if (
      (effective.includes('write') || effective.includes('write-all')) &&
      !(
        environmentName !== undefined &&
        isString(environmentName) &&
        environmentName.value === FACTORY_ENVIRONMENT
      )
    )
      throw new Error(`${id}: write-token job requires environment ${FACTORY_ENVIRONMENT}`);
    const steps = job.value.find('steps');
    let authenticates = false;
    for (const step of steps !== undefined && isSequence(steps) ? steps : []) {
      if (!isMapping(step)) continue;
      const env = step.find('env');
      const tokenEnv =
        env !== undefined &&
        isMapping(env) &&
        [...env].some(({ value }) =>
          /\b(?:github\.token|secrets\.GITHUB_TOKEN)\b/.test(scalarText(value)),
        );
      const token = step.find('run');
      // An expression run is not a string token; its text form keeps the literal command.
      const run = token !== undefined && isScalar(token) ? token.toString() : '';
      if (installsWithScripts(run)) throw new Error(`${id}: npm ci must use --ignore-scripts`);
      authenticates ||= tokenEnv || run.includes('scripts/factory-');
      const pin =
        env !== undefined && isMapping(env) ? env.find('FACTORY_ACTIVATION_POLICY_PIN') : undefined;
      if (CONTROLLER_SCRIPT.test(run) && scalarText(pin) !== PIN_EXPRESSION)
        throw new Error(`${id}: controller step requires ${PIN_EXPRESSION} as policy pin`);
    }
    const actions =
      permissions !== undefined && isMapping(permissions) ? permissions.find('actions') : undefined;
    if (
      authenticates &&
      !(actions !== undefined && isString(actions) && ['read', 'write'].includes(actions.value))
    )
      throw new Error(`${id}: factory job requires explicit actions permission`);
  }
}
// shortcut: the hosted jobs for these dispatch choices are wired in the repair PR (PR-C); the gate pins the
// list so it cannot go stale. Remove an entry from here when its job lands.
export const UNWIRED_CONTROL_COMMANDS: readonly string[] = [
  'admit',
  'operation-intent',
  'operation-outcome',
  'retry-claim',
];
// Every dispatch choice must reach a job: a job `if` naming it, the `preflight` job, or the script that a
// no-filter job feeds with "$FACTORY_COMMAND" naming it. Anything else must be listed as explicitly unwired.
export function validateDispatchReachability(
  content: string,
  name: string,
  readScript: (file: string) => string,
  unwired: readonly string[] = [],
): void {
  const result = parseWorkflow({ name, content }, new NoOperationTraceWriter());
  result.context.errors.check('Official workflow parser');
  if (result.value === undefined || !isMapping(result.value))
    throw new Error('Workflow mapping absent');
  const trigger = result.value.find('on');
  const dispatch =
    trigger !== undefined && isMapping(trigger) ? trigger.find('workflow_dispatch') : undefined;
  const inputs =
    dispatch !== undefined && isMapping(dispatch) ? dispatch.find('inputs') : undefined;
  const command = inputs !== undefined && isMapping(inputs) ? inputs.find('command') : undefined;
  const choices = command !== undefined && isMapping(command) ? command.find('options') : undefined;
  if (choices === undefined || !isSequence(choices))
    throw new Error(`${name}: command choice absent`);
  const options = [...choices].map(scalarText);
  const jobs = result.value.find('jobs');
  if (jobs === undefined || !isMapping(jobs)) throw new Error(`${name}: jobs absent`);
  const reached = new Set<string>();
  for (const job of jobs) {
    if (!isMapping(job.value)) continue;
    const condition = scalarText(job.value.find('if'));
    const named = [...condition.matchAll(/inputs\.command\s*==\s*'([^']+)'/g)].map(
      ([, option]) => option,
    );
    for (const option of named) if (option !== undefined) reached.add(option);
    if (named.length > 0) continue;
    if (job.key.toString() === 'preflight') reached.add('preflight');
    const steps = job.value.find('steps');
    for (const step of steps !== undefined && isSequence(steps) ? steps : []) {
      const run = isMapping(step) ? scalarText(step.find('run')) : undefined;
      const script =
        run === undefined
          ? undefined
          : /node (scripts\/[\w.-]+\.ts) "\$FACTORY_COMMAND"/.exec(run)?.[1];
      if (script === undefined) continue;
      const source = readScript(script);
      for (const option of options) if (source.includes(`'${option}'`)) reached.add(option);
    }
  }
  const dead = options.filter((option) => !reached.has(option));
  const undeclared = dead.filter((option) => !unwired.includes(option));
  if (undeclared.length > 0)
    throw new Error(`${name}: dispatch choices reach no job: ${undeclared.join(', ')}`);
  const stale = unwired.filter((option) => !dead.includes(option));
  if (stale.length > 0)
    throw new Error(`${name}: declared unwired but reachable or absent: ${stale.join(', ')}`);
}
const verified: { binary?: Promise<string> | undefined; directory?: string | undefined } = {};
// shortcut: disposal does not wait for an in-flight download; callers dispose after their last validation.
export function disposeActionlint(): void {
  verified.binary = undefined;
  if (verified.directory !== undefined)
    fs.rmSync(verified.directory, { recursive: true, force: true });
  verified.directory = undefined;
}
process.once('exit', disposeActionlint);
// One verified download per process; the private tool directory is removed by disposeActionlint or at exit.
export function actionlintBinary(): Promise<string> {
  verified.binary ??= downloadActionlint().catch((error: unknown) => {
    verified.binary = undefined;
    throw error;
  });
  return verified.binary;
}
async function downloadActionlint(): Promise<string> {
  const platform = `${process.platform}_${process.arch === 'x64' ? 'amd64' : process.arch}`;
  const expected = ARCHIVE_DIGESTS[platform];
  if (expected === undefined)
    throw new Error('Unsupported actionlint platform; no unverified fallback');
  const response = await fetch(
    `https://github.com/rhysd/actionlint/releases/download/v${RELEASE}/actionlint_${RELEASE}_${platform}.tar.gz`,
    { signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) throw new Error('Pinned upstream actionlint download failed');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== expected)
    throw new Error('Pinned upstream actionlint checksum mismatch');
  const executable = execFileSync('tar', ['-xzOf', '-', 'actionlint'], {
    input: bytes,
    maxBuffer: 20_000_000,
  });
  const directory = path.resolve(import.meta.dirname, '..', '.build', 'factory-tools');
  fs.mkdirSync(directory, { recursive: true });
  const privateDirectory = fs.mkdtempSync(path.join(directory, 'actionlint-'));
  verified.directory = privateDirectory;
  const binary = path.join(privateDirectory, 'actionlint');
  fs.writeFileSync(binary, executable, { flag: 'wx', mode: 0o700 });
  return binary;
}
export async function validateNativeWorkflow(content: string, name: string): Promise<void> {
  validateWorkflowSchema(content, name);
  const binary = await actionlintBinary();
  const result = spawnSync(
    binary,
    ['-no-color', '-oneline', '-ignore', QUEUE_DIAGNOSTIC, '-stdin-filename', name, '-'],
    { input: content, encoding: 'utf8' },
  );
  if (result.status !== 0 || result.signal !== null || result.error !== undefined)
    throw new Error(
      `Upstream actionlint rejected ${name}: status=${String(result.status)} signal=${String(result.signal)} error=${result.error?.name ?? 'none'} ${result.stdout}${result.stderr}`,
    );
}
async function workflowMain(): Promise<void> {
  try {
    validateInertPolicy(
      JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'factory-policy.json'), 'utf8')),
    );
    const directory = path.resolve(import.meta.dirname, '..', '.github', 'workflows');
    for (const file of fs
      .readdirSync(directory)
      .filter((file) => file.endsWith('.yml'))
      .toSorted()) {
      const content = fs.readFileSync(path.join(directory, file), 'utf8');
      await validateNativeWorkflow(content, file);
      if (FACTORY_WORKFLOWS.includes(file)) {
        validateInertWorkflow(content, file);
        validateFactoryHardening(content, file);
        validateDispatchReachability(
          content,
          file,
          (script) => fs.readFileSync(path.resolve(directory, '..', '..', script), 'utf8'),
          file === 'factory-control.yml' ? UNWIRED_CONTROL_COMMANDS : [],
        );
      }
    }
    console.log(
      'Official schema + pinned upstream actionlint passed; only exact queue diagnostic excepted',
    );
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : 'Workflow validation failed');
    process.exitCode = 1;
  } finally {
    disposeActionlint();
  }
}

if (process.argv[1] === import.meta.filename) await workflowMain();
