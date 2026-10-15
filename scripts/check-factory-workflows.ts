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
const FACTORY_REFERENCE = /scripts\/factory-|check-factory-workflows|FACTORY_/;
// A workflow outside the list skips every gate below, so anything that looks like or reaches the factory must be listed.
export function validateFactoryWorkflowSet(
  files: readonly string[],
  read: (file: string) => string = () => '',
): void {
  for (const file of files)
    if (
      /\.ya?ml$/.test(file) &&
      !FACTORY_WORKFLOWS.includes(file) &&
      (file.startsWith('factory-') || FACTORY_REFERENCE.test(read(file)))
    )
      throw new Error(`${file}: factory workflow is not listed in FACTORY_WORKFLOWS`);
}
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
// The factory is source-only until the owner enables it. The postures below are the only deliberate
// exceptions, and a later PR that widens one changes this constant in the same reviewed diff:
// a schedule only in the night-review ingress (one cron), and the model-provider keys only in the env of one
// step of one key job that runs in the `ci` environment with read-only rights.
export const INERT_POSTURE: {
  readonly activation: boolean;
  readonly triggers: readonly string[];
  readonly scheduleWorkflow: string;
  readonly secretNames: readonly string[];
  readonly keySecrets: readonly string[];
  readonly keyWorkflow: string;
  readonly keyJob: string;
  readonly keyStep: string;
  readonly keyEnvironment: string;
  readonly keyJobSha256: string;
} = {
  activation: false,
  triggers: ['workflow_dispatch'],
  scheduleWorkflow: 'night-review.yml',
  secretNames: ['GITHUB_TOKEN'],
  keySecrets: ['OCR_LLM_AUTH_TOKEN', 'OPENCODE_GO_API_KEY'],
  keyWorkflow: 'factory-control.yml',
  keyJob: 'night-model',
  keyStep: 'Model pass',
  keyEnvironment: 'ci',
  // Every byte of the key job (earlier steps, $GITHUB_ENV writes, env values) is pinned; it changes only in a reviewed diff.
  keyJobSha256: 'b2b4677e30fdf126f48c3aab7625019ddd518283e9b6bc145532a22123ae696b',
};
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
  const names =
    typeof policy === 'object' && policy !== null && 'secret_names' in policy
      ? policy.secret_names
      : undefined;
  if (
    !Array.isArray(names) ||
    names.length !== INERT_POSTURE.keySecrets.length ||
    !INERT_POSTURE.keySecrets.every((key) => names.includes(key))
  )
    throw new Error(
      `factory-policy.json: secret_names must be exactly ${INERT_POSTURE.keySecrets.join(', ')}`,
    );
}
// The bot-producer parent window is the night-review job timeout plus a five-minute margin, read from the workflow.
export function validateNightParentWindow(windowMinutes: unknown, nightReview: string): void {
  const result = parseWorkflow(
    { name: INERT_POSTURE.scheduleWorkflow, content: nightReview },
    new NoOperationTraceWriter(),
  );
  result.context.errors.check('Official workflow parser');
  const jobs =
    result.value !== undefined && isMapping(result.value) ? result.value.find('jobs') : undefined;
  const timeouts = [...(jobs !== undefined && isMapping(jobs) ? jobs : [])].map(({ value }) =>
    isMapping(value) ? Number(scalarText(value.find('timeout-minutes'))) : Number.NaN,
  );
  if (
    timeouts.length === 0 ||
    !timeouts.every((minutes) => Number.isInteger(minutes) && minutes > 0) ||
    windowMinutes !== Math.max(...timeouts) + 5
  )
    throw new Error(
      'factory-policy.json: night_scan.parent_window_minutes must be the night-review timeout-minutes plus 5',
    );
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
// Bodies of the `${{ }}` expressions in a text, without their string literals: a quoted `}}` cannot end one
// early and a quoted word is not a reference. An unterminated expression runs to the end.
function expressionBodies(text: string): string[] {
  const bodies: string[] = [];
  for (let at = text.indexOf('${{'); at !== -1; at = text.indexOf('${{', at)) {
    let body = '';
    at += 3;
    while (at < text.length && !text.startsWith('}}', at)) {
      if (text[at] === "'") {
        for (at++; at < text.length && (text[at] !== "'" || text[at + 1] === "'"); at++)
          if (text[at] === "'") at++;
        at++;
        body += "''";
      } else body += text.charAt(at++);
    }
    bodies.push(body);
    at += 2;
  }
  return bodies;
}
const secretReference = (names: readonly string[]): RegExp =>
  new RegExp(`\\bsecrets\\s*\\.\\s*(?:${names.join('|')})\\b`, 'gi');
const SECRET_ALLOWED = secretReference(INERT_POSTURE.secretNames);
const KEY_SECRET_ALLOWED = secretReference([
  ...INERT_POSTURE.secretNames,
  ...INERT_POSTURE.keySecrets,
]);
// The workflow token in any casing or bracket form: `github.token`, `secrets.GITHUB_TOKEN`, `github['token']`.
const TOKEN_REFERENCE =
  /\bgithub\s*(?:\.\s*token\b|\[\s*'token'\s*\])|\bsecrets\s*\.\s*github_token\b/i;
// The key job of the key workflow, when this is that workflow.
function keyJobToken(workflow: TemplateToken, name: string): TemplateToken | undefined {
  if (name !== INERT_POSTURE.keyWorkflow || !isMapping(workflow)) return undefined;
  const jobs = workflow.find('jobs');
  return jobs !== undefined && isMapping(jobs) ? jobs.find(INERT_POSTURE.keyJob) : undefined;
}
function keyStepsOf(job: TemplateToken | undefined): TemplateToken[] {
  const steps = job !== undefined && isMapping(job) ? job.find('steps') : undefined;
  return [...(steps !== undefined && isSequence(steps) ? steps : [])].filter(
    (step) => isMapping(step) && scalarText(step.find('name')) === INERT_POSTURE.keyStep,
  );
}
function keyStepEnv(workflow: TemplateToken, name: string): TemplateToken | undefined {
  const step = keyStepsOf(keyJobToken(workflow, name))[0];
  return step !== undefined && isMapping(step) ? step.find('env') : undefined;
}
// shortcut: the FACTORY_* flag is matched textually on comment-stripped lines; use the expression parser
// if a legitimate `#` inside a string ever hides a flag.
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
  for (const entry of triggers)
    if (
      !INERT_POSTURE.triggers.includes(entry) &&
      !(entry === 'schedule' && name === INERT_POSTURE.scheduleWorkflow)
    )
      throw new Error(`${name}: ${entry} trigger is not enabled in this delivery`);
  if (triggers.includes('schedule')) {
    const schedule =
      trigger !== undefined && isMapping(trigger) ? trigger.find('schedule') : undefined;
    if (
      schedule === undefined ||
      !isSequence(schedule) ||
      schedule.count !== 1 ||
      [...schedule].some(
        (entry) =>
          !isMapping(entry) || entry.count !== 1 || !/\S/.test(scalarText(entry.find('cron'))),
      )
    )
      throw new Error(`${name}: schedule must carry exactly one cron`);
  }
  // The only place the provider keys may appear: the env of the key job's key step.
  const keyEnv = keyStepEnv(result.value, name);
  // Secrets are judged on the expressions Actions substitutes before any shell, so comments are not cut.
  const inspectText = (text: string, key: string, keyed: boolean): void => {
    for (const body of expressionBodies(
      !text.includes('${{') && key === 'if' ? `\${{ ${text} }}` : text,
    ))
      if (/\bsecrets\b/i.test(body.replaceAll(keyed ? KEY_SECRET_ALLOWED : SECRET_ALLOWED, '')))
        throw new Error(`${name}: secret use in "${body.trim()}" is not enabled in this delivery`);
  };
  const inspect = (token: TemplateToken, key: string, keyed: boolean): void => {
    if (isMapping(token))
      for (const entry of token) {
        const entryKey = scalarText(entry.key);
        inspectText(entryKey, '', false);
        if (entryKey.toLowerCase() === 'secrets' && isScalar(entry.value))
          throw new Error(`${name}: dynamic or inherited secrets are not enabled in this delivery`);
        inspect(entry.value, entryKey, keyed || entry.value === keyEnv);
      }
    else if (isSequence(token)) for (const item of token) inspect(item, key, keyed);
    else inspectText(scalarText(token), key, keyed);
  };
  inspect(result.value, '', false);
  const text = content
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*/, ''))
    .join('\n');
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
    if (
      /^(?:night-|authority-|publication$)/.test(job.key.toString()) &&
      !/^[1-9]\d*$/.test(scalarText(job.value.find('timeout-minutes')))
    )
      throw new Error(`${id}: night, authority and publication jobs require timeout-minutes`);
    if (
      /^(?:night-|authority-|publication$)/.test(job.key.toString()) &&
      /\balways\s*\(/i.test(scalarText(job.value.find('if')))
    )
      throw new Error(
        `${id}: night, authority and publication jobs must use !cancelled(), not always()`,
      );
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
    const holdsToken = (token: TemplateToken | undefined): boolean =>
      token !== undefined &&
      isMapping(token) &&
      [...token].some(
        ({ key, value }) =>
          TOKEN_REFERENCE.test(scalarText(value)) || /^(?:github-)?token$/i.test(scalarText(key)),
      );
    // Workflow and job env reach every step, so they authenticate the whole job.
    let authenticates = [result.value.find('env'), job.value.find('env')].some(
      (env) =>
        env !== undefined &&
        isMapping(env) &&
        [...env].some(({ value }) => TOKEN_REFERENCE.test(scalarText(value))),
    );
    for (const step of steps !== undefined && isSequence(steps) ? steps : []) {
      if (!isMapping(step)) continue;
      const env = step.find('env');
      const tokenEnv =
        (env !== undefined &&
          isMapping(env) &&
          [...env].some(({ value }) => TOKEN_REFERENCE.test(scalarText(value)))) ||
        holdsToken(step.find('with'));
      const token = step.find('run');
      // An expression run is not a string token; its text form keeps the literal command.
      const run = token !== undefined && isScalar(token) ? token.toString() : '';
      if (installsWithScripts(run)) throw new Error(`${id}: npm ci must use --ignore-scripts`);
      authenticates ||= tokenEnv || TOKEN_REFERENCE.test(run) || run.includes('scripts/factory-');
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
// Every key and scalar of a token tree as one text, for patterns that may hide in any position.
// Lossless structure of a workflow token, for pinning: mappings keep their key/value pairs.
function tokenTree(token: TemplateToken): unknown {
  if (isMapping(token))
    return [...token].map(({ key, value }) => [scalarText(key), tokenTree(value)]);
  return isSequence(token) ? [...token].map(tokenTree) : scalarText(token);
}
function tokenText(token: TemplateToken): string {
  if (isMapping(token))
    return [...token].map(({ key, value }) => `${scalarText(key)}\n${tokenText(value)}`).join('\n');
  return isSequence(token) ? [...token].map(tokenText).join('\n') : scalarText(token);
}
const KEY_SECRET_NAME = new RegExp(`\\b(?:${INERT_POSTURE.keySecrets.join('|')})\\b`, 'i');
const RUNNER_DEBUG = /ACTIONS_(?:STEP|RUNNER)_DEBUG/i;
// `set -x`, `set -o xtrace`, `bash -x`: a traced shell echoes the expanded command line, key included.
const SHELL_TRACE =
  /(?:^|[\s;&|(])set\s+(?:-[a-z]*x[a-z]*|-o\s+xtrace)(?=[\s;&|)]|$)|\b(?:ba|z|da)?sh\s+-[a-z]*x/im;
const environmentName = (job: TemplateToken): string => {
  const environment = isMapping(job) ? job.find('environment') : undefined;
  return scalarText(
    environment !== undefined && isMapping(environment) ? environment.find('name') : environment,
  );
};
// The whole Model pass command, byte for byte apart from the deadline, so nothing can be chained to it.
const KEY_COMMAND =
  /^node scripts\/factory-model\.ts run --source \. --ocr-bin "\$OCR_BIN" --known "\$RUNNER_TEMP\/night-known\/known\.json" --out "\$RUNNER_TEMP\/night-model" --deadline-seconds (\d+)$/;
const KEY_STEP_ENV = ['OCR_BIN', 'OCR_LLM_AUTH_TOKEN', 'OPENCODE_GO_API_KEY'].join();
// The key job: the one place a provider key may exist. Read-only token, its own environment, no tracing.
export function validateKeyJob(content: string, name: string): void {
  const result = parseWorkflow({ name, content }, new NoOperationTraceWriter());
  result.context.errors.check('Official workflow parser');
  if (result.value === undefined || !isMapping(result.value))
    throw new Error('Workflow mapping absent');
  if (name !== INERT_POSTURE.keyWorkflow) return;
  const id = `${name}/${INERT_POSTURE.keyJob}`;
  if (RUNNER_DEBUG.test(tokenText(result.value)))
    throw new Error(`${name}: debug logging variables are forbidden`);
  const job = keyJobToken(result.value, name);
  if (job === undefined || !isMapping(job)) throw new Error(`${id}: key job absent`);
  if (environmentName(job) !== INERT_POSTURE.keyEnvironment)
    throw new Error(`${id}: key job requires environment ${INERT_POSTURE.keyEnvironment}`);
  const permissions = job.find('permissions');
  if (
    permissions === undefined ||
    !isMapping(permissions) ||
    permissions.count !== 2 ||
    scalarText(permissions.find('contents')) !== 'read' ||
    scalarText(permissions.find('actions')) !== 'read'
  )
    throw new Error(`${id}: key job permissions must be exactly contents: read, actions: read`);
  if (SHELL_TRACE.test(tokenText(job)))
    throw new Error(`${id}: shell tracing is forbidden in the key job`);
  // The job runs on a plain hosted runner, with no container or service that could see the step's env.
  if (
    scalarText(job.find('runs-on')) !== 'ubuntu-latest' ||
    job.find('container') !== undefined ||
    job.find('services') !== undefined
  )
    throw new Error(`${id}: key job must run on ubuntu-latest without container or services`);
  // The key step is one fixed command: no action, no shell override at any level, no extra env, no chained command.
  if (result.value.find('defaults') !== undefined || job.find('defaults') !== undefined)
    throw new Error(`${id}: defaults are forbidden around the key job`);
  if (result.value.find('env') !== undefined)
    throw new Error(`${id}: workflow env is forbidden around the key job`);
  const [step, ...extra] = keyStepsOf(job);
  const command = step !== undefined && isMapping(step) ? scalarText(step.find('run')) : '';
  const env = step !== undefined && isMapping(step) ? step.find('env') : undefined;
  const fixed = KEY_COMMAND.exec(command);
  if (
    step === undefined ||
    !isMapping(step) ||
    extra.length > 0 ||
    step.find('uses') !== undefined ||
    step.find('shell') !== undefined ||
    env === undefined ||
    !isMapping(env) ||
    [...env]
      .map(({ key }) => scalarText(key))
      .toSorted()
      .join() !== KEY_STEP_ENV ||
    fixed === null
  )
    throw new Error(
      `${id}: ${INERT_POSTURE.keyStep} must only run node scripts/factory-model.ts run with one --deadline-seconds and the key env`,
    );
  // The model deadline must leave ten minutes of the job timeout for setup and upload.
  const deadline = Number(fixed[1]);
  const timeout = Number(scalarText(job.find('timeout-minutes')));
  if (!(deadline > 0) || !(timeout > 0) || deadline + 600 > timeout * 60)
    throw new Error(`${id}: --deadline-seconds must fit timeout-minutes with ten minutes to spare`);
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify(tokenTree(job)))
    .digest('hex');
  if (digest !== INERT_POSTURE.keyJobSha256)
    throw new Error(`${id}: key job differs from the reviewed pin (sha256 ${digest})`);
}
// Any workflow: the provider key names live only in the key workflow, and the key environment's secrets
// (reachable by name or by `toJSON(secrets)`) are reachable only from the key job.
export function validateSecretIsolation(content: string, name: string): void {
  if (name !== INERT_POSTURE.keyWorkflow && KEY_SECRET_NAME.test(content))
    throw new Error(
      `${name}: provider secret names may appear only in ${INERT_POSTURE.keyWorkflow}`,
    );
  const result = parseWorkflow({ name, content }, new NoOperationTraceWriter());
  result.context.errors.check('Official workflow parser');
  const jobs =
    result.value !== undefined && isMapping(result.value) ? result.value.find('jobs') : undefined;
  for (const job of jobs !== undefined && isMapping(jobs) ? jobs : []) {
    const id = `${name}/${job.key.toString()}`;
    const environment = environmentName(job.value);
    // Environment names are case-insensitive and an expression could pick the reserved one at run time.
    if (environment.includes('${{')) throw new Error(`${id}: environment name must be a literal`);
    // A called workflow runs in its own jobs and can name the reserved environment out of this gate's sight.
    const uses = isMapping(job.value) ? scalarText(job.value.find('uses')) : '';
    if (uses !== '' && !uses.startsWith('./.github/workflows/'))
      throw new Error(`${id}: reusable workflows are limited to ./.github/workflows/`);
    if (
      environment.toLowerCase() === INERT_POSTURE.keyEnvironment &&
      !(name === INERT_POSTURE.keyWorkflow && job.key.toString() === INERT_POSTURE.keyJob)
    )
      throw new Error(
        `${id}: environment ${INERT_POSTURE.keyEnvironment} is reserved for ${INERT_POSTURE.keyJob}`,
      );
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
      // A handler branch (`case 'x'`, `command === 'x'`, `input['command'] === 'x'`) counts; a bare string such as
      // `role !== 'x'` does not.
      for (const option of options) {
        const quoted = `'${option.replaceAll(/\W/g, String.raw`\$&`)}'`;
        if (
          new RegExp(String.raw`\bcase\s+${quoted}|\bcommand(?:'\])?\s*===?\s*${quoted}`).test(
            source,
          )
        )
          reached.add(option);
      }
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
function nightWindow(policy: unknown): unknown {
  const block =
    typeof policy === 'object' && policy !== null && 'night_scan' in policy
      ? policy.night_scan
      : null;
  return typeof block === 'object' && block !== null && 'parent_window_minutes' in block
    ? block.parent_window_minutes
    : undefined;
}
async function workflowMain(): Promise<void> {
  try {
    const policy: unknown = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname, 'factory-policy.json'), 'utf8'),
    );
    validateInertPolicy(policy);
    const directory = path.resolve(import.meta.dirname, '..', '.github', 'workflows');
    validateNightParentWindow(
      nightWindow(policy),
      fs.readFileSync(path.join(directory, 'night-review.yml'), 'utf8'),
    );
    const listed = fs.readdirSync(directory);
    validateFactoryWorkflowSet(listed, (file) =>
      fs.readFileSync(path.join(directory, file), 'utf8'),
    );
    for (const file of listed.filter((file) => /\.ya?ml$/.test(file)).toSorted()) {
      const content = fs.readFileSync(path.join(directory, file), 'utf8');
      await validateNativeWorkflow(content, file);
      validateSecretIsolation(content, file);
      if (FACTORY_WORKFLOWS.includes(file)) {
        validateInertWorkflow(content, file);
        validateKeyJob(content, file);
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
