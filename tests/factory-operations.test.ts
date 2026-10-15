import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { it } from 'node:test';
import { createJiti } from 'jiti';
import type { TemplateToken } from '@actions/workflow-parser/templates/tokens/template-token';
import type { TestContext } from 'node:test';
import { FactoryPlatform } from './helpers/night-factory-transport.ts';
import {
  arrayField,
  CONTROL_FILES,
  record,
  resolveFactoryContext,
  verifyControlSource,
} from '../scripts/factory-protocol.ts';
import type { FactoryContext, JsonRecord } from '../scripts/factory-protocol.ts';
import {
  loadFactoryPolicy,
  createFactoryContext,
  stringField,
} from '../scripts/factory-protocol.ts';
import { observeFactory, prepareTarget, stopFactory } from '../scripts/factory-operations.ts';
import {
  FACTORY_ENVIRONMENT,
  FACTORY_WORKFLOWS,
  UNWIRED_CONTROL_COMMANDS,
  validateDispatchReachability,
  validateFactoryHardening,
  validateFactoryWorkflowSet,
  validateInertPolicy,
  validateInertWorkflow,
  validateKeyJob,
  validateNativeWorkflow,
  validateNightParentWindow,
  validateSecretIsolation,
  validateWorkflowSchema,
} from '../scripts/check-factory-workflows.ts';
import { loadNightPolicy } from '../scripts/factory-model.ts';
it('native factory workflow JSON boundaries reject malformed input without exposing bytes or writing outputs', async (test) => {
  const root = process.cwd();
  fs.mkdirSync(path.join(root, '.worktrees'), { recursive: true });
  const sentinel = 'SYNTHETIC_FACTORY_JSON_PRIVATE_MARKER_282';
  const malformed = `{"private":"${sentinel}", broken}`;
  for (const workflow of [
    'factory-control.yml',
    'factory-ingress.yml',
    'factory-operations.yml',
    'night-review.yml',
  ]) {
    const source = fs.readFileSync(path.join(root, '.github/workflows', workflow), 'utf8');
    const programs = [
      ...source.matchAll(
        /^[ \t]*node --input-type=module <<'NODE'\r?\n([\s\S]*?)^[ \t]*NODE\s*$/gm,
      ),
    ];
    assert.ok(programs.length > 0, `${workflow} must exercise native programs`);
    for (const [index, match] of programs.entries())
      await test.test(`${workflow} program ${index + 1}`, (subtest) => {
        const directory = fs.mkdtempSync(path.join(root, '.worktrees/factory-json-boundary-'));
        subtest.after(() => {
          fs.rmSync(directory, { recursive: true, force: true });
        });
        fs.symlinkSync(path.join(root, 'scripts'), path.join(directory, 'scripts'), 'dir');
        fs.mkdirSync(path.join(directory, 'factory'));
        const files = new Map([
          ['factory-input.json', malformed],
          ['factory-preflight.json', malformed],
          ['factory/receipt.json', malformed],
          ['factory/checkpoint.json', malformed],
          ['factory/checkpoint.json.transition', sentinel],
          ['github-output', ''],
        ]);
        for (const [file, bytes] of files) fs.writeFileSync(path.join(directory, file), bytes);
        const result = spawnSync(process.execPath, ['--input-type=module'], {
          cwd: directory,
          input: match[1],
          encoding: 'utf8',
          timeout: 10_000,
          env: {
            PATH: process.env['PATH'],
            FACTORY_INPUT: malformed,
            GITHUB_OUTPUT: path.join(directory, 'github-output'),
          },
        });
        assert.equal(result.error, undefined);
        assert.equal(result.signal, null);
        assert.notEqual(result.status, 0, 'malformed JSON must stop the native program');
        const output = result.stdout + result.stderr;
        assert.equal(
          output.includes(sentinel),
          false,
          'native diagnostics must not expose input bytes',
        );
        assert.match(output, /Invalid factory JSON; preserve work/);
        for (const [file, bytes] of files)
          assert.equal(
            fs.readFileSync(path.join(directory, file), 'utf8'),
            bytes,
            `${file} remains unchanged`,
          );
        assert.deepEqual(fs.readdirSync(directory).sort(), [
          'factory',
          'factory-input.json',
          'factory-preflight.json',
          'github-output',
          'scripts',
        ]);
        assert.deepEqual(fs.readdirSync(path.join(directory, 'factory')).sort(), [
          'checkpoint.json',
          'checkpoint.json.transition',
          'receipt.json',
        ]);
      });
  }
});

it('F4 native append-bootstrap programs succeed without an unproduced receipt file', (test) => {
  const root = process.cwd();
  fs.mkdirSync(path.join(root, '.worktrees'), { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, '.worktrees/factory-bootstrap-output-'));
  test.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
  fs.symlinkSync(path.join(root, 'scripts'), path.join(directory, 'scripts'), 'dir');
  const output = path.join(directory, 'github-output');
  fs.writeFileSync(output, '');
  const workflow = fs.readFileSync(
    path.join(root, '.github/workflows/factory-control.yml'),
    'utf8',
  );
  const job = workflow.split('\n  append-bootstrap:\n')[1]?.split('\n  authority-register:\n')[0];
  assert.ok(job !== undefined && job.length > 0, 'the append-bootstrap job must exist');
  const programs = [
    ...job.matchAll(/^[ \t]*node --input-type=module <<'NODE'\r?\n([\s\S]*?)^[ \t]*NODE\s*$/gm),
  ];
  assert.ok(programs.length > 0);
  for (const program of programs) {
    const result = spawnSync(process.execPath, ['--input-type=module'], {
      cwd: directory,
      input: program[1],
      encoding: 'utf8',
      timeout: 10_000,
      env: { PATH: process.env['PATH'], FACTORY_INPUT: '{}', GITHUB_OUTPUT: output },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, result.stderr);
  }
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(directory, 'factory-input.json'), 'utf8')),
    {
      producer_phase: 'bootstrap',
      commit_bootstrap: true,
    },
  );
  assert.equal(fs.existsSync(path.join(directory, 'factory/receipt.json')), false);
  assert.equal(fs.readFileSync(output, 'utf8'), '');
});

it('rejects unverified actionlint download bytes before creating any archive or executable', (test) => {
  const root = process.cwd();
  fs.mkdirSync(path.join(root, '.worktrees'), { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, '.worktrees/factory-checksum-'));
  test.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(directory, 'scripts'));
  fs.copyFileSync(
    path.join(root, 'scripts/check-factory-workflows.ts'),
    path.join(directory, 'scripts/check-factory-workflows.ts'),
  );
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
  const result = spawnSync(process.execPath, ['--input-type=module'], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 30_000,
    input: `
      import assert from 'node:assert/strict';
      import { actionlintBinary } from './scripts/check-factory-workflows.ts';
      globalThis.fetch = async () => new Response('UNVERIFIED_ACTIONLINT_TEST_BYTES');
      await assert.rejects(actionlintBinary(), /Pinned upstream actionlint checksum mismatch/);
    `,
    env: { PATH: process.env['PATH'] },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(directory).sort(), ['node_modules', 'scripts']);
  assert.deepEqual(fs.readdirSync(path.join(directory, 'scripts')), ['check-factory-workflows.ts']);
});

it('downloads actionlint once per process and leaves no private tool directory after disposal or exit', (test) => {
  const root = process.cwd();
  fs.mkdirSync(path.join(root, '.worktrees'), { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, '.worktrees/factory-memo-'));
  test.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(directory, 'scripts'));
  fs.copyFileSync(
    path.join(root, 'scripts/check-factory-workflows.ts'),
    path.join(directory, 'scripts/check-factory-workflows.ts'),
  );
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
  const result = spawnSync(process.execPath, ['--input-type=module'], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 120_000,
    input: `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import { actionlintBinary, disposeActionlint } from './scripts/check-factory-workflows.ts';
      const fetchOriginal = globalThis.fetch;
      let downloads = 0;
      globalThis.fetch = async (...args) => {
        downloads++;
        return await fetchOriginal(...args);
      };
      const [first, second] = await Promise.all([actionlintBinary(), actionlintBinary()]);
      assert.equal(first, second);
      assert.equal(await actionlintBinary(), first);
      assert.equal(downloads, 1);
      assert.ok(fs.existsSync(first));
      disposeActionlint();
      assert.equal(fs.existsSync(first), false);
      assert.deepEqual(fs.readdirSync('.build/factory-tools'), []);
      await actionlintBinary();
      assert.equal(downloads, 2);
    `,
    env: { PATH: process.env['PATH'] },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(path.join(directory, '.build/factory-tools')), []);
});

const { isMapping, isString, NoOperationTraceWriter, parseWorkflow } = await createJiti(
  import.meta.url,
  { tryNative: false },
).import<typeof import('@actions/workflow-parser')>('@actions/workflow-parser');

const expressionLoader = createJiti(import.meta.url, { tryNative: false });
const { Lexer, Parser, Evaluator, data } =
  await expressionLoader.import<typeof import('@actions/expressions')>('@actions/expressions');
const { Binary, ContextAccess, IndexAccess, Literal, Logical, Grouping } =
  await expressionLoader.import<typeof import('@actions/expressions/ast')>(
    '@actions/expressions/ast',
  );
const PRIVILEGED_FLAG = 'FACTORY_PRIVILEGED_JOBS_ENABLED';
const OWNER_GATE = `vars.${PRIVILEGED_FLAG} == 'true'`;

// The job status functions are the only functions a factory job condition may call besides the built-ins.
const ALWAYS = { name: 'always', minArgs: 0, maxArgs: 0 };
const CANCELLED = { name: 'cancelled', minArgs: 0, maxArgs: 0 };
function ownerJobExpression(condition: string) {
  return new Parser(
    new Lexer(condition).lex().tokens,
    ['vars', 'needs', 'inputs', 'github'],
    [ALWAYS, CANCELLED],
  ).parse();
}
function evaluateOwnerJob(condition: string, flag: string | undefined): string {
  const variables = new data.Dictionary();
  if (flag !== undefined) variables.add(PRIVILEGED_FLAG, new data.StringData(flag));
  const context = new data.Dictionary(
    { key: 'vars', value: variables },
    {
      key: 'needs',
      value: new data.Dictionary({
        key: 'preflight',
        value: new data.Dictionary({
          key: 'outputs',
          value: new data.Dictionary({ key: 'authorized', value: new data.StringData('true') }),
        }),
      }),
    },
  );
  return new Evaluator(
    ownerJobExpression(condition),
    context,
    new Map([
      ['always', { ...ALWAYS, call: () => new data.BooleanData(true) }],
      ['cancelled', { ...CANCELLED, call: () => new data.BooleanData(false) }],
    ]),
  )
    .evaluate()
    .coerceString();
}

function assertFactoryWriteJobsDisabled(content: string, name: string): number {
  const parsed = parseWorkflow({ name, content }, new NoOperationTraceWriter());
  parsed.context.errors.check('Official workflow parser');
  assert.ok(parsed.value !== undefined && isMapping(parsed.value));
  const jobs = parsed.value.find('jobs');
  assert.ok(jobs !== undefined && isMapping(jobs));
  const grantsWrite = (permissions: TemplateToken | undefined): boolean =>
    permissions !== undefined &&
    ((isString(permissions) && permissions.value === 'write-all') ||
      (isMapping(permissions) &&
        [...permissions].some(({ value }) => isString(value) && value.value === 'write')));
  let privileged = 0;
  for (const job of jobs) {
    assert.ok(isMapping(job.value));
    if (!grantsWrite(job.value.find('permissions') ?? parsed.value.find('permissions'))) continue;
    privileged++;
    const condition = job.value.find('if');
    assert.ok(
      condition !== undefined && isString(condition),
      `${name}: owner-controlled platform gate required`,
    );
    const expression = ownerJobExpression(condition.value);
    const root = expression instanceof Grouping ? expression.group : expression;
    const candidate =
      root instanceof Logical && root.operator.lexeme === '&&' ? root.args[0] : root;
    assert.ok(
      candidate instanceof Binary &&
        candidate.operator.lexeme === '==' &&
        candidate.left instanceof IndexAccess &&
        candidate.left.expr instanceof ContextAccess &&
        candidate.left.expr.name.lexeme === 'vars' &&
        candidate.left.index instanceof Literal &&
        candidate.left.index.literal instanceof data.StringData &&
        candidate.left.index.literal.value === PRIVILEGED_FLAG &&
        candidate.right instanceof Literal &&
        candidate.right.literal instanceof data.StringData &&
        candidate.right.literal.value === 'true',
      `${name}/${job.key.toString()}: owner-controlled platform gate must dominate job admission`,
    );
    for (const flag of [undefined, '', 'false'])
      assert.equal(
        evaluateOwnerJob(condition.value, flag),
        'false',
        `${name}: absent/empty/false owner flag must deny even forged preflight`,
      );
  }
  return privileged;
}

it('factory write-permission jobs require a default-deny owner platform flag independent of preflight or future privileged jobs', async (test) => {
  let privileged = 0;
  for (const name of [
    'factory-control.yml',
    'factory-operations.yml',
    'factory-ingress.yml',
    'night-review.yml',
  ])
    await test.test(name, () => {
      privileged += assertFactoryWriteJobsDisabled(
        fs.readFileSync(path.join('.github/workflows', name), 'utf8'),
        name,
      );
    });
  await test.test('non-vacuous privileged job inventory', () => {
    assert.ok(privileged > 0);
  });
  const future = (
    condition: string,
    permission = 'actions: write',
    inherited = false,
  ): string => `name: Future privileged job
on: workflow_dispatch
permissions: ${inherited ? 'write-all' : '{}'}
jobs:
  preflight:
    runs-on: ubuntu-latest
    permissions: {}
    outputs:
      authorized: \${{ steps.forge.outputs.authorized }}
    steps:
      - id: forge
        run: echo 'authorized=true' >> "$GITHUB_OUTPUT"
  future-untrusted:
    needs: preflight
    ${condition}
    runs-on: ubuntu-latest
    ${inherited ? '' : `permissions:\n      ${permission}`}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
      - run: npm ci
`;
  for (const permission of [
    'contents: write',
    'issues: write',
    'pull-requests: write',
    'actions: write',
    'id-token: write',
  ])
    await test.test(`future owner-gated ${permission}`, () => {
      assert.equal(
        assertFactoryWriteJobsDisabled(future(`if: ${OWNER_GATE}`, permission), 'future.yml'),
        1,
      );
    });
  await test.test('inherited write-all owner-gated', () => {
    assert.equal(
      assertFactoryWriteJobsDisabled(future(`if: ${OWNER_GATE}`, '', true), 'future.yml'),
      1,
    );
  });
  await test.test(
    'explicit owner true permits gated future job while forged preflight alone cannot',
    () => {
      const condition = `${OWNER_GATE} && (needs.preflight.outputs.authorized == 'true')`;
      assert.equal(assertFactoryWriteJobsDisabled(future(`if: ${condition}`), 'future.yml'), 1);
      assert.equal(evaluateOwnerJob(condition, 'true'), 'true');
      for (const flag of [undefined, '', 'false'])
        assert.equal(evaluateOwnerJob(condition, flag), 'false');
    },
  );
  for (const condition of [
    `# if: ${OWNER_GATE}`,
    'if: true',
    "if: needs.preflight.outputs.authorized == 'true'",
    "if: vars.FACTORY_PRIVILEGED_JOBS_ENABLED != 'false'",
    `if: ${OWNER_GATE} || true`,
    `if: ${OWNER_GATE} || needs.preflight.outputs.authorized == 'true'`,
  ])
    await test.test(`future privilege cannot use ${condition}`, () => {
      assert.throws(
        () => assertFactoryWriteJobsDisabled(future(condition), 'future.yml'),
        /owner-controlled platform gate/,
      );
    });
});

it('factory workflows pin protected environment, install without lifecycle scripts and grant actions explicitly', async (test) => {
  const sources = new Map(
    FACTORY_WORKFLOWS.map((name) => [
      name,
      fs.readFileSync(path.join('.github/workflows', name), 'utf8'),
    ]),
  );
  for (const [name, source] of sources)
    await test.test(name, () => {
      validateFactoryHardening(source, name);
    });
  const control = sources.get('factory-control.yml') ?? '';
  const mutations: [string, string, string, RegExp][] = [
    ['environment', `    environment: ${FACTORY_ENVIRONMENT}\n`, '', /requires environment/],
    ['ignore-scripts', 'npm ci --ignore-scripts', 'npm ci', /--ignore-scripts/],
    ['actions', '      actions: read\n', '', /explicit actions permission/],
    [
      'policy pin',
      'FACTORY_ACTIVATION_POLICY_PIN: ${{ vars.FACTORY_ACTIVATION_POLICY_PIN }}',
      "FACTORY_ACTIVATION_POLICY_PIN: ''",
      /policy pin/,
    ],
    [
      'expression run (parser yields a non-string token)',
      'npm ci --ignore-scripts',
      "npm ci ${{ '' }}",
      /--ignore-scripts/,
    ],
  ];
  for (const [label, from, to, error] of mutations)
    await test.test(`mutation without ${label} is rejected`, () => {
      assert.ok(control.includes(from));
      assert.throws(() => {
        validateFactoryHardening(control.replace(from, to), 'factory-control.yml');
      }, error);
    });
});

const hardeningWorkflow = (job: string, top = 'permissions: {}\n'): string =>
  `name: t\non: workflow_dispatch\n${top}jobs:\n  j:\n    runs-on: ubuntu-latest\n${job}`;
const hardeningRun = (run: string): string =>
  `    steps:\n      - run: |\n${run
    .split('\n')
    .map((line) => `          ${line}`)
    .join('\n')}\n`;
const privileged = `    environment: ${FACTORY_ENVIRONMENT}\n`;

it('factory hardening rejects install commands that can run lifecycle scripts and keeps safe forms', () => {
  const rejected = [
    'npm ci',
    'npm ci # ${{ github.run_id }}',
    "npm ci ${{ '' }}",
    'npm ci --ignore-scripts=false',
    'npm ci --ignore-scripts --ignore-scripts=false',
    'npm ci --no-ignore-scripts',
    'npm ci  # --ignore-scripts',
    'npm ci \\\n  --ignore-scripts=false',
    'npm ci --ignore-scripts && npm ci',
    'npm ci --ignore-scripts\nnpm i',
    'npm install',
    'npm i',
    'npm clean-install',
    'npm cit',
    'npm install-ci-test',
  ];
  for (const run of rejected)
    assert.throws(
      () => {
        validateFactoryHardening(hardeningWorkflow(hardeningRun(run)), 'h.yml');
      },
      /--ignore-scripts/,
      run,
    );
  for (const run of [
    'npm ci --ignore-scripts',
    'npm ci --ignore-scripts=true',
    'npm ci --ignore-scripts # note',
    'npm ci --ignore-scripts ${{ github.run_id }}',
    'npm ci --ignore-scripts && npm test',
    'npm run build',
  ])
    validateFactoryHardening(hardeningWorkflow(hardeningRun(run)), 'h.yml');
});

it('factory hardening treats missing permissions as write-all and honours inheritance', () => {
  const steps = hardeningRun('npm ci --ignore-scripts');
  const rejects = (workflow: string): void => {
    assert.throws(() => {
      validateFactoryHardening(workflow, 'h.yml');
    }, /requires environment/);
  };
  rejects(hardeningWorkflow(steps, ''));
  validateFactoryHardening(hardeningWorkflow(privileged + steps, ''), 'h.yml');
  rejects(hardeningWorkflow(steps, 'permissions: write-all\n'));
  rejects(hardeningWorkflow(steps, 'permissions:\n  contents: write\n'));
  validateFactoryHardening(
    hardeningWorkflow(privileged + steps, 'permissions: write-all\n'),
    'h.yml',
  );
  validateFactoryHardening(hardeningWorkflow(steps, 'permissions:\n  contents: read\n'), 'h.yml');
  validateFactoryHardening(hardeningWorkflow(`    permissions: {}\n${steps}`, ''), 'h.yml');
  validateFactoryHardening(
    hardeningWorkflow(`    permissions: read-all\n${steps}`, 'permissions: write-all\n'),
    'h.yml',
  );
  rejects(hardeningWorkflow(`    permissions: write-all\n${steps}`));
  rejects(hardeningWorkflow(`    permissions:\n      contents: write\n${steps}`));
});

it('factory hardening checks the environment form and the explicit actions grant', () => {
  const steps = hardeningRun('npm ci --ignore-scripts');
  const write = '    permissions:\n      contents: write\n';
  validateFactoryHardening(
    hardeningWorkflow(`    environment:\n      name: ${FACTORY_ENVIRONMENT}\n${write}${steps}`),
    'h.yml',
  );
  for (const environment of ['environment:\n      name: other', 'environment: other'])
    assert.throws(() => {
      validateFactoryHardening(hardeningWorkflow(`    ${environment}\n${write}${steps}`), 'h.yml');
    }, /requires environment/);
  const factoryRun = `${hardeningRun('npm ci --ignore-scripts\nnode scripts/factory-control.ts run')}        env:\n          FACTORY_ACTIVATION_POLICY_PIN: \${{ vars.FACTORY_ACTIVATION_POLICY_PIN }}\n`;
  for (const permissions of [
    '',
    '    permissions:\n      contents: read\n',
    '    permissions:\n      actions: none\n',
  ])
    assert.throws(() => {
      validateFactoryHardening(
        hardeningWorkflow(`${permissions}${factoryRun}`, 'permissions:\n  actions: read\n'),
        'h.yml',
      );
    }, /explicit actions permission/);
  validateFactoryHardening(
    hardeningWorkflow(`    permissions:\n      actions: read\n${factoryRun}`),
    'h.yml',
  );
  validateFactoryHardening(
    hardeningWorkflow('    steps:\n      - uses: actions/checkout@v7\n'),
    'h.yml',
  );
  validateFactoryHardening(
    'name: t\non: workflow_dispatch\npermissions: {}\njobs:\n  j:\n    uses: ./.github/workflows/x.yml\n',
    'h.yml',
  );
});

it('factory hardening requires actions: read wherever a job authenticates with the workflow token', () => {
  const authenticated = (permissions: string): string =>
    hardeningWorkflow(
      `${permissions}    steps:\n      - run: node tools/other.js\n        env:\n          GITHUB_TOKEN: \${{ github.token }}\n`,
    );
  for (const permissions of ['', '    permissions:\n      contents: read\n'])
    assert.throws(() => {
      validateFactoryHardening(authenticated(permissions), 'h.yml');
    }, /explicit actions permission/);
  validateFactoryHardening(authenticated('    permissions:\n      actions: read\n'), 'h.yml');
  // Real token access (runs, jobs, logs, artifacts) is a hosted condition: no local fixture proves it.
});

it('ties the bot parent window to the night-review job timeout plus five minutes', () => {
  const review = fs.readFileSync('.github/workflows/night-review.yml', 'utf8');
  const window = record(loadFactoryPolicy()['night_scan'])['parent_window_minutes'];
  validateNightParentWindow(window, review);
  for (const wrong of [5, 10, 16, undefined])
    assert.throws(() => {
      validateNightParentWindow(wrong, review);
    }, /parent_window_minutes/);
  assert.throws(() => {
    validateNightParentWindow(window, review.replace('timeout-minutes: 10', 'timeout-minutes: 20'));
  }, /parent_window_minutes/);
  assert.throws(() => {
    validateNightParentWindow(window, review.replace('    timeout-minutes: 10\n', ''));
  }, /parent_window_minutes/);
});

it('PR-A enables nothing: inactive policy, no schedule, no secrets beyond the workflow token and no FACTORY_* set true', () => {
  validateInertPolicy(loadFactoryPolicy());
  assert.throws(() => {
    validateInertPolicy({ ...loadFactoryPolicy(), activation: true });
  }, /activation must be false/);
  const sources = FACTORY_WORKFLOWS.map(
    (name) => [name, fs.readFileSync(path.join('.github/workflows', name), 'utf8')] as const,
  );
  for (const [name, source] of sources) validateInertWorkflow(source, name);
  const control = sources.find(([name]) => name === 'factory-control.yml')?.[1] ?? '';
  const mutations: [string, string, string, RegExp][] = [
    [
      'schedule',
      'on:\n  workflow_dispatch:',
      "on:\n  schedule:\n    - cron: '0 3 * * *'\n  workflow_dispatch:",
      /schedule trigger/,
    ],
    [
      'provider secret',
      'FACTORY_INPUT: ${{ inputs.request }}',
      'FACTORY_INPUT: ${{ secrets.OPENCODE_GO_API_KEY }}',
      /secret use .*OPENCODE_GO_API_KEY/,
    ],
    [
      'inherited secrets',
      'jobs:\n',
      'jobs:\n  x:\n    uses: ./.github/workflows/y.yml\n    secrets: inherit\n',
      /inherited secrets/,
    ],
    [
      'env flag true',
      'FACTORY_INPUT: ${{ inputs.request }}',
      'FACTORY_PRIVILEGED_JOBS_ENABLED: true',
      /never set to true/,
    ],
    [
      'quoted env flag true',
      'FACTORY_INPUT: ${{ inputs.request }}',
      "FACTORY_PRIVILEGED_JOBS_ENABLED: 'true'",
      /never set to true/,
    ],
    [
      'shell-set flag true',
      'npm ci --ignore-scripts',
      'echo FACTORY_PRIVILEGED_JOBS_ENABLED=true >> "$GITHUB_ENV"',
      /never set to true/,
    ],
  ];
  for (const [label, from, to, error] of mutations) {
    assert.ok(control.includes(from), label);
    assert.throws(
      () => {
        validateInertWorkflow(control.replace(from, to), 'factory-control.yml');
      },
      error,
      label,
    );
  }
  // Reading vars.FACTORY_* and the workflow token stays allowed.
  validateInertWorkflow(
    control.replace('FACTORY_INPUT: ${{ inputs.request }}', 'T: ${{ secrets.GITHUB_TOKEN }}'),
    'factory-control.yml',
  );
});

const workflowSource = (name: string): string =>
  fs.readFileSync(path.join('.github/workflows', name), 'utf8');
// One job's text, from its id line to the next job; `edit` rewrites only that job.
function editJob(content: string, job: string, edit: (text: string) => string): string {
  const start = content.indexOf(`\n  ${job}:\n`) + 1;
  assert.ok(start > 0, `${job} present`);
  const next = content.slice(start + 1).search(/\n {2}[\w-]+:\n/);
  const end = next === -1 ? content.length : start + 1 + next + 1;
  const edited = edit(content.slice(start, end));
  assert.notEqual(edited, content.slice(start, end), `${job} edit applied`);
  return content.slice(0, start) + edited + content.slice(end);
}
const keyGate = (content: string, name = 'factory-control.yml'): void => {
  validateInertWorkflow(content, name);
  validateKeyJob(content, name);
  validateSecretIsolation(content, name);
  validateFactoryHardening(content, name);
};

it('night-scan gate: the real workflows pass and only the key job, in one step, holds provider keys', () => {
  validateInertPolicy(loadFactoryPolicy());
  for (const name of fs.readdirSync('.github/workflows').filter((file) => /\.ya?ml$/.test(file)))
    validateSecretIsolation(workflowSource(name), name);
  for (const name of FACTORY_WORKFLOWS) keyGate(workflowSource(name), name);
  const control = workflowSource('factory-control.yml');
  assert.deepEqual(
    [...control.matchAll(/secrets\.(\w+)/g)].map(([, secret]) => secret),
    ['OCR_LLM_AUTH_TOKEN', 'OPENCODE_GO_API_KEY'],
  );
  assert.equal(workflowSource('night-review.yml').match(/cron:/g)?.length, 1);
  for (const [job, name] of [
    ['authority-verifier', 'factory-authority-verifier'],
    ['authority-scan', 'factory-authority-scan'],
  ] as const)
    assert.ok(
      control.includes(`  ${job}:\n    name: ${name}\n`),
      `${job} keeps the protocol job name`,
    );
});

it('night-scan gate: a provider key outside the Model pass env of the key job is rejected', () => {
  const control = workflowSource('factory-control.yml');
  const key = '${{ secrets.OCR_LLM_AUTH_TOKEN }}';
  const mutations: [string, string][] = [
    [
      'another job',
      editJob(control, 'night-adapter', (text) =>
        text.replace(
          '      - id: adapt\n',
          `      - id: adapt\n        env:\n          K: ${key}\n`,
        ),
      ),
    ],
    [
      'job env of the key job',
      editJob(control, 'night-model', (text) =>
        text.replace('    environment: ci\n', `    environment: ci\n    env:\n      K: ${key}\n`),
      ),
    ],
    [
      'run of the Model pass step',
      editJob(control, 'night-model', (text) =>
        text.replace(
          'run: node scripts/factory-model.ts run',
          `run: echo ${key}; node scripts/factory-model.ts run`,
        ),
      ),
    ],
    [
      'with of another step of the key job',
      editJob(control, 'night-model', (text) =>
        text.replace(
          '          path: ${{ runner.temp }}/night-known\n',
          `          path: \${{ runner.temp }}/night-known\n          github-token: ${key}\n`,
        ),
      ),
    ],
    [
      'env of another step of the key job',
      editJob(control, 'night-model', (text) =>
        text.replace(
          '      - name: Require a clean checkout\n',
          `      - name: Require a clean checkout\n        env:\n          K: ${key}\n`,
        ),
      ),
    ],
    [
      'the fallback key outside the key job',
      editJob(control, 'publication', (text) =>
        text.replace(
          'FACTORY_INPUT: ${{ inputs.request }}',
          'FACTORY_INPUT: ${{ secrets.OPENCODE_GO_API_KEY }}',
        ),
      ),
    ],
  ];
  for (const [label, content] of mutations)
    assert.throws(
      () => {
        validateInertWorkflow(content, 'factory-control.yml');
      },
      /secret use/,
      label,
    );
});

it('night-scan gate: the key job needs the ci environment, exact read-only permissions and no tracing', () => {
  const control = workflowSource('factory-control.yml');
  const keyJob = (from: string, to: string): string =>
    editJob(control, 'night-model', (text) => text.replace(from, to));
  const mutations: [string, string, RegExp][] = [
    [
      'privileged environment',
      keyJob('environment: ci\n', 'environment: factory-privileged\n'),
      /requires environment ci/,
    ],
    ['no environment', keyJob('    environment: ci\n', ''), /requires environment ci/],
    [
      'issues write',
      keyJob(
        '      actions: read\n    steps:',
        '      actions: read\n      issues: write\n    steps:',
      ),
      /permissions must be exactly/,
    ],
    [
      'actions write',
      keyJob('      actions: read\n    steps:', '      actions: write\n    steps:'),
      /permissions must be exactly/,
    ],
    [
      'no permissions',
      keyJob('    permissions:\n      contents: read\n      actions: read\n', ''),
      /permissions must be exactly/,
    ],
    [
      'step debug variable',
      keyJob(
        '        env:\n          OCR_LLM_AUTH_TOKEN',
        '        env:\n          ACTIONS_STEP_DEBUG: true\n          OCR_LLM_AUTH_TOKEN',
      ),
      /debug logging/,
    ],
    [
      'runner debug at workflow level',
      control.replace(
        'permissions:\n  contents: read\n',
        'permissions:\n  contents: read\nenv:\n  ACTIONS_RUNNER_DEBUG: 1\n',
      ),
      /debug logging/,
    ],
    [
      'set -x',
      keyJob(
        'run: test -z "$(git status --porcelain)"',
        'run: set -x; test -z "$(git status --porcelain)"',
      ),
      /tracing/,
    ],
    [
      'xtrace option',
      keyJob('run: npm audit signatures', 'run: set -o xtrace && npm audit signatures'),
      /tracing/,
    ],
    ['another runner', keyJob('runs-on: ubuntu-latest', 'runs-on: self-hosted'), /ubuntu-latest/],
    [
      'container',
      keyJob('runs-on: ubuntu-latest\n', 'runs-on: ubuntu-latest\n    container: node:26\n'),
      /container or services/,
    ],
    [
      'services',
      keyJob(
        'runs-on: ubuntu-latest\n',
        'runs-on: ubuntu-latest\n    services:\n      db:\n        image: postgres\n',
      ),
      /container or services/,
    ],
    [
      'Model pass as an action',
      keyJob(
        '        run: node scripts/factory-model.ts run',
        '        uses: ./.github/actions/x\n        with:\n          args: node scripts/factory-model.ts run',
      ),
      /must only run/,
    ],
    [
      'Model pass with a custom shell',
      keyJob(
        '        run: node scripts/factory-model.ts run',
        '        shell: bash\n        run: node scripts/factory-model.ts run',
      ),
      /must only run/,
    ],
    [
      'Model pass running something else',
      keyJob('run: node scripts/factory-model.ts run', 'run: node other.ts run'),
      /must only run/,
    ],
    [
      'deadline beyond the job timeout',
      keyJob('--deadline-seconds 2100', '--deadline-seconds 2700'),
      /deadline-seconds/,
    ],
    ['no deadline', keyJob(' --deadline-seconds 2100', ''), /deadline-seconds/],
    [
      'traced shell',
      keyJob(
        '      - name: Require a clean checkout\n',
        '      - name: Require a clean checkout\n        shell: bash -xe {0}\n',
      ),
      /tracing/,
    ],
  ];
  for (const [label, content, error] of mutations)
    assert.throws(
      () => {
        validateKeyJob(content, 'factory-control.yml');
      },
      error,
      label,
    );
  assert.throws(() => {
    validateKeyJob(control.replace('  night-model:\n', '  night-modul:\n'), 'factory-control.yml');
  }, /key job absent/);
});

it('night-scan gate: push, pull_request and every other workflow never mention the provider keys or the ci environment', () => {
  const ci = workflowSource('ci.yml');
  for (const [label, content, name] of [
    [
      'ci env',
      ci.replace(
        'jobs:\n',
        'jobs:\n  x:\n    runs-on: ubuntu-latest\n    env:\n      K: ${{ secrets.OCR_LLM_AUTH_TOKEN }}\n    steps:\n      - run: echo\n',
      ),
      'ci.yml',
    ],
    [
      'push workflow',
      'name: p\non: push\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ${{ secrets.OPENCODE_GO_API_KEY }}\n',
      'p.yml',
    ],
    [
      'pull_request_target',
      'name: p\non: pull_request_target\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "$OCR_LLM_AUTH_TOKEN"\n',
      'q.yml',
    ],
    [
      'workflow_run',
      'name: p\non:\n  workflow_run:\n    workflows: [x]\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ${{ secrets.OCR_LLM_AUTH_TOKEN }}\n',
      'r.yml',
    ],
    [
      'factory workflow other than the key one',
      workflowSource('night-review.yml').replace(
        'FACTORY_INPUT: ${{ inputs.request }}',
        'K: ${{ secrets.OCR_LLM_AUTH_TOKEN }}',
      ),
      'night-review.yml',
    ],
  ] as const)
    assert.throws(
      () => {
        validateSecretIsolation(content, name);
      },
      /provider secret names may appear only/,
      label,
    );
  assert.throws(() => {
    validateSecretIsolation(
      ci.replace(
        'jobs:\n',
        'jobs:\n  x:\n    runs-on: ubuntu-latest\n    environment: ci\n    steps:\n      - run: echo ${{ toJSON(secrets) }}\n',
      ),
      'ci.yml',
    );
  }, /environment ci is reserved/);
  assert.throws(() => {
    validateSecretIsolation(
      editJob(workflowSource('factory-control.yml'), 'night-adapter', (text) =>
        text.replace('    runs-on:', '    environment: ci\n    runs-on:'),
      ),
      'factory-control.yml',
    );
  }, /environment ci is reserved/);
});

it('night-scan gate: the ci environment cannot be reached by casing, an expression or a reusable workflow', () => {
  const ci = workflowSource('ci.yml');
  const withJob = (job: string): string => ci.replace('jobs:\n', `jobs:\n${job}`);
  for (const [label, content, error] of [
    [
      'other casing',
      withJob(
        '  x:\n    runs-on: ubuntu-latest\n    environment: Ci\n    steps:\n      - run: echo\n',
      ),
      /environment ci is reserved/,
    ],
    [
      'mapping name in other casing',
      withJob(
        '  x:\n    runs-on: ubuntu-latest\n    environment:\n      name: CI\n    steps:\n      - run: echo\n',
      ),
      /environment ci is reserved/,
    ],
    [
      'constant expression',
      withJob(
        "  x:\n    runs-on: ubuntu-latest\n    environment: ${{ 'ci' }}\n    steps:\n      - run: echo\n",
      ),
      /environment ci is reserved/,
    ],
    [
      'run-time expression',
      withJob(
        '  x:\n    runs-on: ubuntu-latest\n    environment: ${{ github.ref_name }}\n    steps:\n      - run: echo\n',
      ),
      /must be a literal/,
    ],
    [
      'external reusable workflow',
      withJob('  x:\n    uses: octo/repo/.github/workflows/w.yml@v1\n'),
      /reusable workflows are limited/,
    ],
  ] as const)
    assert.throws(
      () => {
        validateSecretIsolation(content, 'ci.yml');
      },
      error,
      label,
    );
  validateSecretIsolation(withJob('  x:\n    uses: ./.github/workflows/w.yml\n'), 'ci.yml');
});

it('night-scan gate: night, authority and publication jobs never use always(); the night key job runs only on the first attempt', () => {
  const control = workflowSource('factory-control.yml');
  for (const job of ['authority-scan', 'publication', 'night-adapter'])
    assert.throws(
      () => {
        validateFactoryHardening(
          editJob(control, job, (text) => text.replace(/\n {4}if: /, '\n    if: always() && ')),
          'factory-control.yml',
        );
      },
      /!cancelled\(\)/,
      job,
    );
  assert.match(
    control.slice(control.indexOf('\n  night-model:\n')),
    /night-model:[\s\S]*?if: [^\n]*github\.run_attempt == 1/,
  );
  // The known list is requested with the dispatch request so the actor check sees the parent.
  assert.match(
    control.slice(control.indexOf('\n  night-known:\n'), control.indexOf('\n  night-model:\n')),
    /FACTORY_INPUT: \$\{\{ inputs\.request \}\}/,
  );
});

it('night-scan gate: a schedule exists only in night-review with exactly one cron', () => {
  const review = workflowSource('night-review.yml');
  validateInertWorkflow(review, 'night-review.yml');
  assert.throws(() => {
    validateInertWorkflow(
      review.replace(
        "    - cron: '17 2 * * *'\n",
        "    - cron: '17 2 * * *'\n    - cron: '17 3 * * *'\n",
      ),
      'night-review.yml',
    );
  }, /exactly one cron/);
  assert.throws(() => {
    validateInertWorkflow(
      review.replace(
        "    - cron: '17 2 * * *'\n",
        "    - cron: '17 2 * * *'\n      timezone: UTC\n",
      ),
      'night-review.yml',
    );
  }, /exactly one cron/);
  for (const name of ['factory-control.yml', 'factory-ingress.yml', 'factory-operations.yml'])
    assert.throws(
      () => {
        validateInertWorkflow(
          workflowSource(name).replace('on:\n', "on:\n  schedule:\n    - cron: '17 2 * * *'\n"),
          name,
        );
      },
      /schedule trigger is not enabled/,
      name,
    );
  for (const trigger of ['push', 'pull_request', 'pull_request_target', 'workflow_run'])
    assert.throws(
      () => {
        validateInertWorkflow(review.replace('on:\n', `on:\n  ${trigger}:\n`), 'night-review.yml');
      },
      /trigger is not enabled/,
      trigger,
    );
});

it('night-scan gate: night, authority and publication jobs require timeout-minutes', () => {
  const control = workflowSource('factory-control.yml');
  for (const job of [
    'night-known',
    'night-model',
    'night-adapter',
    'authority-verifier',
    'authority-scan',
    'authority-bootstrap',
    'authority-checkpoint',
    'publication',
  ])
    assert.throws(
      () => {
        validateFactoryHardening(
          editJob(control, job, (text) => text.replace(/ {4}timeout-minutes: \d+\n/, '')),
          'factory-control.yml',
        );
      },
      /require timeout-minutes/,
      job,
    );
  assert.throws(() => {
    validateFactoryHardening(
      editJob(control, 'night-known', (text) =>
        text.replace(/timeout-minutes: \d+/, 'timeout-minutes: 0'),
      ),
      'factory-control.yml',
    );
  }, /require timeout-minutes/);
});

it('night-scan policy: the secret names, model block and OCR pin agree with the lock file', () => {
  const policy = loadFactoryPolicy();
  assert.deepEqual(policy['secret_names'], ['OCR_LLM_AUTH_TOKEN', 'OPENCODE_GO_API_KEY']);
  for (const names of [
    ['OCR_LLM_AUTH_TOKEN'],
    ['OCR_LLM_AUTH_TOKEN', 'OPENCODE_GO_API_KEY', 'X'],
    [],
  ])
    assert.throws(() => {
      validateInertPolicy({ ...policy, secret_names: names });
    }, /secret_names must be exactly/);
  const night = loadNightPolicy();
  assert.equal(night.scan_model, 'glm-5.3');
  assert.equal(night.verifier_model, 'kimi-k3');
  assert.equal(night.analyst_model, 'kimi-k3');
  assert.equal(night.llm_url, 'https://opencode.ai/inference/go/v1');
  assert.deepEqual(
    [night.ocr_token_budget, night.verifier_token_budget, night.analyst_token_budget],
    [3_000_000, 300_000, 100_000],
  );
  assert.deepEqual([night.verify_cap, night.concurrency], [6, 4]);
  assert.equal(night.fingerprint_policy_revision, 'night-scan-fp-v1');
  const lock = record(
    record(JSON.parse(fs.readFileSync('tools/ocr/package-lock.json', 'utf8')))['packages'],
  );
  const main = record(lock['node_modules/@alibaba-group/open-code-review']);
  assert.equal(main['version'], night.ocr_version);
  assert.equal(main['integrity'], night.ocr_lock_integrity);
  assert.equal(
    record(lock['node_modules/@alibaba-group/ocr-linux-x64'])['integrity'],
    night.ocr_native_integrity['linux-x64'],
  );
  assert.equal(policy['activation'], false);
});

it('factory dispatch choices reach a job, a no-filter script command, or an explicitly unwired list', () => {
  const read = (file: string): string => fs.readFileSync(file, 'utf8');
  const source = (name: string): string =>
    fs.readFileSync(path.join('.github/workflows', name), 'utf8');
  for (const name of FACTORY_WORKFLOWS)
    validateDispatchReachability(
      source(name),
      name,
      read,
      name === 'factory-control.yml' ? UNWIRED_CONTROL_COMMANDS : [],
    );
  assert.deepEqual([...UNWIRED_CONTROL_COMMANDS].sort(), [
    'admit',
    'operation-intent',
    'operation-outcome',
    'retry-claim',
  ]);
  const control = source('factory-control.yml');
  assert.throws(() => {
    validateDispatchReachability(
      control.replace('            preflight,\n', '            preflight,\n            ghost,\n'),
      'factory-control.yml',
      read,
      UNWIRED_CONTROL_COMMANDS,
    );
  }, /reach no job: ghost/);
  assert.throws(() => {
    validateDispatchReachability(
      control,
      'factory-control.yml',
      read,
      UNWIRED_CONTROL_COMMANDS.filter((command) => command !== 'admit'),
    );
  }, /reach no job: admit/);
  assert.throws(() => {
    validateDispatchReachability(control, 'factory-control.yml', read, [
      ...UNWIRED_CONTROL_COMMANDS,
      'reserve',
    ]);
  }, /unwired but reachable or absent: reserve/);
  assert.throws(() => {
    validateDispatchReachability(
      source('factory-operations.yml').replace('[prepare, observe, stop]', '[prepare, vanish]'),
      'factory-operations.yml',
      read,
    );
  }, /reach no job: vanish/);
});

const inertWorkflow = (stepBody: string, on = 'on: workflow_dispatch'): string =>
  `name: t\n${on}\npermissions: {}\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n${stepBody}`;

it('inert gate rejects every secret reference form except the workflow token', () => {
  const rejected = [
    '      - run: echo\n        env:\n          X: ${{ toJSON(secrets) }}\n',
    '      - run: echo\n        env:\n          X: ${{ secrets }}\n',
    '      - run: echo\n        env:\n          X: ${{ SECRETS.OPENCODE_GO_API_KEY }}\n',
    "      - run: echo\n        env:\n          X: ${{ secrets['OPENCODE_GO_API_KEY'] }}\n",
    "      - run: echo\n        env:\n          X: ${{ '}}' && secrets.OPENCODE_GO_API_KEY }}\n",
    '      - run: echo\n        env:\n          X: ${{ secrets.GITHUB_TOKEN && secrets.OTHER }}\n',
    '      - run: echo\n        env:\n          X: ${{ secrets.GITHUB_TOKEN_OTHER }}\n',
    '      - run: |\n          # ${{ secrets.OPENCODE_GO_API_KEY }}\n          echo\n',
    "      - if: secrets.OPENCODE_GO_API_KEY != ''\n        run: echo\n",
    '      - uses: ./.github/actions/x\n        with:\n          key: ${{ secrets.OPENCODE_GO_API_KEY }}\n',
  ];
  for (const step of rejected)
    assert.throws(
      () => {
        validateInertWorkflow(inertWorkflow(step), 'i.yml');
      },
      /secret/,
      step,
    );
  for (const step of [
    '      - run: echo\n        env:\n          X: ${{ secrets.GITHUB_TOKEN }}\n',
    '      - run: echo\n        env:\n          X: ${{ SECRETS.github_token }}\n',
    '      - run: |\n          # secrets are never used here\n          echo ${{ github.run_id }}\n',
    "      - run: echo\n        env:\n          X: ${{ format('secrets {0}', github.run_id) }}\n",
  ])
    validateInertWorkflow(inertWorkflow(step), 'i.yml');
});

it('inert gate allows only the workflow_dispatch trigger and no stray factory workflow file', () => {
  const step = '      - run: echo\n';
  for (const on of [
    'on: push',
    'on: [workflow_dispatch, push]',
    'on:\n  workflow_dispatch:\n  pull_request_target:',
    'on:\n  workflow_dispatch:\n  workflow_run:\n    workflows: [x]',
    'on:\n  workflow_dispatch:\n  issues:\n    types: [opened]',
    "on:\n  workflow_dispatch:\n  schedule:\n    - cron: '0 3 * * *'",
  ])
    assert.throws(
      () => {
        validateInertWorkflow(inertWorkflow(step, on), 'i.yml');
      },
      /trigger is not enabled/,
      on,
    );
  validateInertWorkflow(inertWorkflow(step, 'on:\n  workflow_dispatch:'), 'i.yml');
  validateFactoryWorkflowSet(fs.readdirSync('.github/workflows'), (file) =>
    fs.readFileSync(path.join('.github/workflows', file), 'utf8'),
  );
  assert.throws(() => {
    validateFactoryWorkflowSet(['nightly.yaml'], () => 'run: node scripts/factory-control.ts');
  }, /nightly\.yaml/);
  assert.throws(() => {
    validateFactoryWorkflowSet(['other.yml'], () => 'if: vars.FACTORY_PRIVILEGED_JOBS_ENABLED');
  }, /other\.yml/);
  validateFactoryWorkflowSet(['ci.yml'], () => 'run: npm run ci');
  assert.throws(() => {
    validateFactoryWorkflowSet([...FACTORY_WORKFLOWS, 'factory-extra.yml']);
  }, /factory-extra\.yml/);
  validateFactoryWorkflowSet(['ci.yml', 'release.yml', ...FACTORY_WORKFLOWS]);
});

it('dispatch reachability needs a handler branch for the command, not just the string', () => {
  const workflow = `name: t\non:\n  workflow_dispatch:\n    inputs:\n      command:\n        type: choice\n        options: [preflight, stop]\n        default: preflight\npermissions: {}\njobs:\n  preflight:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node scripts/x.ts "$FACTORY_COMMAND"\n`;
  const check = (source: string): void => {
    validateDispatchReachability(workflow, 'w.yml', () => source);
  };
  for (const source of [
    "if (role !== 'stop') throw new Error('no');",
    "const label = 'stop';",
    "if (command !== 'stop') return;",
    "if (command === 'preflight') return;",
  ])
    assert.throws(
      () => {
        check(source);
      },
      /reach no job: stop/,
      source,
    );
  check("switch (command) { case 'stop': break; case 'preflight': break; }");
  check("if (command === 'stop' || command === 'preflight') return;");
});

it('factory hardening treats the token in job env, workflow env, action inputs and any casing as authentication', () => {
  const actionsRead = '    permissions:\n      actions: read\n';
  const readOnly = '    permissions:\n      contents: read\n';
  const run = '    steps:\n      - run: node tools/other.js\n';
  const cases: [string, string][] = [
    ['job env', `${readOnly}    env:\n      T: \${{ github.token }}\n${run}`],
    ['job env secret', `${readOnly}    env:\n      T: \${{ secrets.GITHUB_TOKEN }}\n${run}`],
    ['mixed case', `${readOnly}${run}        env:\n          T: \${{ GITHUB.TOKEN }}\n`],
    [
      'mixed case secret',
      `${readOnly}${run}        env:\n          T: \${{ SECRETS.GITHUB_TOKEN }}\n`,
    ],
    [
      'with github-token',
      `${readOnly}    steps:\n      - uses: x/y@v1\n        with:\n          github-token: literal\n`,
    ],
    [
      'with token',
      `${readOnly}    steps:\n      - uses: x/y@v1\n        with:\n          token: literal\n`,
    ],
    [
      'with token expression',
      `${readOnly}    steps:\n      - uses: x/y@v1\n        with:\n          other: \${{ github.token }}\n`,
    ],
    ['inline run', `${readOnly}    steps:\n      - run: echo \${{ github.token }}\n`],
  ];
  for (const [label, job] of cases)
    assert.throws(
      () => {
        validateFactoryHardening(hardeningWorkflow(job), 'h.yml');
      },
      /explicit actions permission/,
      label,
    );
  assert.throws(() => {
    validateFactoryHardening(
      hardeningWorkflow(`${readOnly}${run}`, 'permissions: {}\nenv:\n  T: ${{ github.token }}\n'),
      'h.yml',
    );
  }, /explicit actions permission/);
  for (const [, job] of cases)
    validateFactoryHardening(hardeningWorkflow(job.replace(readOnly, actionsRead)), 'h.yml');
});

// AC20–22/25–26 primary owner; no window start or additional target is synthesized.
it('keeps unassigned provider and stop identities Prepared/Waiting despite a valid secret name', () => {
  const policy = loadFactoryPolicy();
  const result = prepareTarget(policy);
  assert.equal(result.state, 'prepared-not-enabled');
  assert.equal(result.eligible, false);
  assert.deepEqual(result.required_checks, [
    { context: 'Test (Node 22 on ubuntu-latest)', app_id: null },
    { context: 'Test (Node 22 on macos-latest)', app_id: null },
  ]);
  assert.equal(result.strict, true);
  assert.deepEqual(result.new_targets, []);
});

it('validates native single/max queue and rejects max cancellation without masking any other actionlint error', async () => {
  const workflow = (
    queue: string,
    cancel: string,
    runner = 'ubuntu-latest',
  ): string => `name: Queue control
on: workflow_dispatch
permissions: {}
concurrency:
  group: factory-control-v1
  queue: ${queue}
  cancel-in-progress: ${cancel}
jobs:
  test:
    runs-on: ${runner}
    steps:
      - run: echo ready
`;
  await validateNativeWorkflow(workflow('single', 'false'), 'single.yml');
  await validateNativeWorkflow(workflow('max', 'false'), 'max.yml');
  assert.throws(() => {
    validateWorkflowSchema(workflow('max', 'true'), 'invalid.yml');
  }, /queue:max/);
  await assert.rejects(
    validateNativeWorkflow(workflow('max', 'false', 'definitely-not-a-runner'), 'other-error.yml'),
    /actionlint rejected/,
  );
});

it('does not manufacture a fourteen-day window or infer a successful stop from unknown registry', async () => {
  const policy = loadFactoryPolicy();
  const context = createFactoryContext(policy, '');
  assert.equal((await stopFactory(context)).status, 'Waiting');
  const result = observeFactory(
    policy,
    { components: [], updates: [], incidents: null },
    '2026-10-26T00:00:00Z',
  );
  assert.equal(result.eligible, false);
  assert.equal(result.window_start, null);
});

const BASE = '/repos/apolenkov/feynman';
function stopPlatform(test: TestContext): {
  platform: FactoryPlatform;
  activation: JsonRecord;
  context: ReturnType<FactoryPlatform['context']>;
  state: string;
} {
  const platform = new FactoryPlatform(test);
  const activation = platform.activation({
    activation: false,
    provider_transport: null,
    token_budget: null,
    timeout_seconds: null,
  });
  const context = platform.context(activation, '904', 'stop', 3);
  platform.runs.push({
    id: 905,
    workflow_id: 701,
    repository: { id: 1230959148 },
    status: 'queued',
  });
  platform.runs.push({
    id: 906,
    workflow_id: 272235418,
    repository: { id: 1230959148 },
    status: 'in_progress',
  });
  platform.pulls.push({
    number: 42,
    node_id: 'PR_42',
    head: { ref: 'factory/fix-42', repo: { id: 1230959148 } },
    base: { repo: { id: 1230959148 } },
    auto_merge: { enabled_by: { login: 'github-actions[bot]' } },
  });
  platform.pulls.push({
    number: 43,
    node_id: 'PR_43',
    head: { ref: 'feature/human', repo: { id: 1230959148 } },
    base: { repo: { id: 1230959148 } },
    auto_merge: { enabled_by: { login: 'apolenkov' } },
  });
  const state = platform.commitFiles(
    new Map([
      ['lineages/consumed.json', Buffer.from('{"repair_reservations":2,"unknown_consumed":true}')],
    ]),
    [],
  );
  platform.git(['update-ref', 'refs/heads/factory-state', state]);
  return { platform, activation, context, state };
}

it('AC20 stops complete registered mutators, reads terminal effects and retains consumed quota in real Git', async (test) => {
  const { platform, context, state } = stopPlatform(test);
  const result = await stopFactory(context);
  assert.equal(result.status, 'STOPPED', result.reason);
  assert.deepEqual(
    platform.requests.filter((request) => request.method === 'PUT').map((request) => request.path),
    ['701', '702', '703', '704'].map((id) => `${BASE}/actions/workflows/${id}/disable`),
  );
  assert.deepEqual(
    platform.requests
      .filter((request) => request.path.endsWith('/cancel'))
      .map((request) => request.path),
    [`${BASE}/actions/runs/904/cancel`, `${BASE}/actions/runs/905/cancel`],
  );
  assert.equal(record(platform.pulls[0])['auto_merge'], null);
  assert.notEqual(record(platform.pulls[1])['auto_merge'], null);
  assert.equal(record(platform.runs.find((run) => run['id'] === 906))['status'], 'in_progress');
  assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), state);
  assert.equal(
    platform.git(['show', `${state}:lineages/consumed.json`]),
    '{"repair_reservations":2,"unknown_consumed":true}',
  );
  assert.equal(
    platform.requests.some((request) => request.method !== 'GET' && request.path.includes('/git/')),
    false,
  );
});

function driftControl(platform: FactoryPlatform, context: FactoryContext): FactoryContext {
  const files = new Map(
    platform.manifest.map((entry) => [
      stringField(entry, 'path'),
      fs.readFileSync(stringField(entry, 'path')),
    ]),
  );
  files.set('scripts/factory-control.ts', Buffer.from('// drifted after the approved release\n'));
  const drifted = platform.commitFiles(files, [platform.release]);
  platform.git(['update-ref', 'refs/heads/main', drifted]);
  for (const route of ['904', '905'].map((id) => `${BASE}/actions/runs/${id}/attempts/1`)) {
    const run = platform.facts.get(route);
    if (run !== undefined) platform.facts.set(route, { ...record(run), head_sha: drifted });
  }
  return { ...context, job: { ...context.job, workflow_source_sha: drifted } };
}

it('F7 owner stop completes under control-file drift while ordinary effects stay denied and identity still binds', async (test) => {
  const { platform, context } = stopPlatform(test);
  const drifted = driftControl(platform, context);
  const repair = platform.context(platform.activation(), '910', 'repair', 2);
  await assert.rejects(
    verifyControlSource(await resolveFactoryContext(repair)),
    /Changed approved control blob/,
  );
  const result = await stopFactory(drifted);
  assert.equal(result.status, 'STOPPED', result.reason);
  assert.deepEqual(
    platform.requests.filter((request) => request.method === 'PUT').map((request) => request.path),
    ['701', '702', '703', '704'].map((id) => `${BASE}/actions/workflows/${id}/disable`),
  );
  assert.equal(
    platform.requests.some((request) => request.path.includes('contents/stop.json')),
    false,
  );
});

it('F7 the relaxed stop verification is refused to every role but stop', async (test) => {
  const { context } = stopPlatform(test);
  const stop = await resolveFactoryContext(context);
  await verifyControlSource(stop, true);
  for (const role of ['repair', 'bootstrap'] as const)
    await assert.rejects(
      verifyControlSource({ ...stop, role }, true),
      /requires the stop role/,
      role,
    );
});

it('every local import between factory scripts is a controlled manifest file', () => {
  const scripts = fs
    .readdirSync('scripts')
    .filter((file) => /^(?:factory-.*|check-factory-workflows)\.ts$/.test(file));
  assert.ok(scripts.length >= 8);
  for (const file of scripts) {
    assert.ok(CONTROL_FILES.includes(`scripts/${file}`), `${file} itself`);
    const source = fs.readFileSync(path.join('scripts', file), 'utf8');
    for (const [, imported = ''] of source.matchAll(/from '\.\/([^']+)'/g))
      assert.ok(CONTROL_FILES.includes(`scripts/${imported}`), `${file} imports ${imported}`);
  }
});

it('F7 stop switches ordinary effects off and a missing or non-false stop.json never opens them', async (test) => {
  const { platform, context } = stopPlatform(test);
  const repair = platform.context(platform.activation(), '910', 'repair', 2);
  const admitted = async (): Promise<void> => {
    await verifyControlSource(await resolveFactoryContext(repair));
  };
  const setStop = (content: string): void => {
    platform.git([
      'update-ref',
      'refs/heads/factory-state',
      platform.commitFiles(new Map([['stop.json', Buffer.from(content)]]), []),
    ]);
  };
  await assert.rejects(admitted(), 'absent stop.json must deny');
  for (const content of ['{"stopped":true}', '{"stopped":"false"}', '{}', 'not json']) {
    setStop(content);
    await assert.rejects(admitted(), content);
  }
  setStop('{"stopped":false}');
  await admitted();
  assert.equal((await stopFactory(context)).status, 'STOPPED');
  await assert.rejects(admitted(), /Foreign\/disabled job workflow/);
});

it('F7 stop under drift still denies a foreign actor, owner or repository before any effect', async (test) => {
  for (const failure of ['foreign-actor', 'foreign-owner', 'default-branch', 'unregistered-run'])
    await test.test(failure, async (subtest) => {
      const { platform, context } = stopPlatform(subtest);
      const drifted = driftControl(platform, context);
      const route = `${BASE}/actions/runs/904/attempts/1`;
      const run = record(platform.facts.get(route));
      if (failure === 'foreign-actor')
        platform.facts.set(route, { ...run, triggering_actor: { id: 1, login: 'mallory' } });
      if (failure === 'unregistered-run') platform.facts.set(route, { ...run, workflow_id: 1 });
      const repository = record(platform.facts.get(BASE));
      if (failure === 'foreign-owner')
        platform.facts.set(BASE, { ...repository, owner: { id: 1, login: 'mallory' } });
      if (failure === 'default-branch')
        platform.facts.set(BASE, { ...repository, default_branch: 'trunk' });
      assert.equal((await stopFactory(drifted)).status, 'Waiting');
      assert.equal(
        platform.requests.some((request) => request.method !== 'GET'),
        false,
      );
    });
});

it('AC20 denies unknown, incomplete, foreign and retired initial inventory before any stop effect', async (test) => {
  for (const failure of [
    'missing-workflow',
    'foreign-path',
    'unknown-writer',
    'retired-writer',
    'null-identity',
    'foreign-pr',
    'foreign-run',
    'unknown-auto-merge',
    'unknown-workflow-metadata',
    'unknown-run-workflow',
  ])
    await test.test(failure, async (subtest) => {
      const { platform, activation, context, state } = stopPlatform(subtest);
      const workflows = record(platform.facts.get(`${BASE}/actions/workflows`));
      const entries = Array.isArray(workflows['workflows'])
        ? workflows['workflows'].map(record)
        : [];
      let inputContext = context;
      switch (failure) {
        case 'missing-workflow':
          entries.pop();
          break;
        case 'unknown-workflow-metadata':
          entries.push({});
          break;
        case 'unknown-run-workflow':
          platform.runs.push({
            id: 907,
            workflow_id: null,
            repository: { id: 1230959148 },
            status: 'queued',
          });
          break;
        case 'foreign-path':
          entries[0] = { ...record(entries[0]), path: '.github/workflows/foreign.yml' };
          break;
        case 'unknown-writer':
          entries.push({
            id: 799,
            path: '.github/workflows/factory-unregistered.yml',
            state: 'active',
          });
          break;
        case 'retired-writer':
          entries.push({ id: 375253262, path: '.github/workflows/night-fix.yml', state: 'active' });
          break;
        case 'null-identity':
          inputContext = platform.context(
            {
              ...activation,
              workflow_registry: entries.map((entry, index) => ({
                id: index === 0 ? null : String(entry['id']),
                path: entry['path'],
                mutating: entry['mutating'],
              })),
            },
            '904',
            'stop',
            3,
          );
          break;
        case 'foreign-pr':
          platform.pulls[0] = {
            ...record(platform.pulls[0]),
            head: { ref: 'factory/fix-42', repo: { id: 999 } },
          };
          break;
        case 'foreign-run':
          platform.runs[1] = { ...record(platform.runs[1]), repository: { id: 999 } };
          break;
        case 'unknown-auto-merge': {
          const pr = { ...record(platform.pulls[0]) };
          delete pr['auto_merge'];
          platform.pulls[0] = pr;
          break;
        }
      }
      platform.facts.set(`${BASE}/actions/workflows`, {
        workflows: entries,
        total_count: entries.length,
      });
      assert.equal((await stopFactory(inputContext)).status, 'Waiting');
      assert.equal(
        platform.requests.some((request) => request.method !== 'GET'),
        false,
      );
      assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), state);
    });
});

it('AC20 requires exact complete workflow, run and PR readback after accepted stop effects', async (test) => {
  for (const failure of [
    'missing-workflow',
    'foreign-path',
    'retired-writer',
    'lost-run',
    'lost-pr',
    'pending-run',
    'armed-pr',
    'readback-unavailable',
  ])
    await test.test(failure, async (subtest) => {
      const { platform, context, state } = stopPlatform(subtest);
      const fetch = platform.fetch.bind(platform);
      let workflowReads = 0;
      const cancel = `${BASE}/actions/runs/905/cancel`;
      if (failure === 'pending-run') platform.overrides.set(`${cancel}#nonterminal`, true);
      subtest.mock.method(
        platform,
        'fetch',
        async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
          const url = new URL(input instanceof Request ? input.url : input);
          if (url.pathname === `${BASE}/actions/workflows` && ++workflowReads === 2) {
            if (failure === 'readback-unavailable') return new Response('{}', { status: 503 });
            const inventory = record(platform.facts.get(url.pathname));
            const entries = Array.isArray(inventory['workflows'])
              ? inventory['workflows'].map(record)
              : [];
            if (failure === 'missing-workflow') entries.pop();
            if (failure === 'foreign-path')
              entries[0] = { ...record(entries[0]), path: '.github/workflows/substituted.yml' };
            if (failure === 'retired-writer')
              entries.push({
                id: 375253262,
                path: '.github/workflows/night-fix.yml',
                state: 'active',
              });
            platform.facts.set(url.pathname, { workflows: entries, total_count: entries.length });
            if (failure === 'lost-run')
              platform.runs.splice(
                platform.runs.findIndex((run) => run['id'] === 905),
                1,
              );
            if (failure === 'lost-pr') platform.pulls.splice(0, 1);
            if (failure === 'armed-pr')
              platform.pulls[0] = {
                ...record(platform.pulls[0]),
                auto_merge: { enabled_by: { login: 'github-actions[bot]' } },
              };
          }
          return await fetch(input, init);
        },
      );
      assert.equal((await stopFactory(context)).status, 'Waiting');
      assert.equal(platform.requests.filter((request) => request.method === 'PUT').length, 4);
      assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), state);
    });
});

function observation(): JsonRecord {
  return {
    components: [
      { name: 'policy', fingerprint: 'reviewed-policy-v1', applied_at: '2026-10-01T00:00:00Z' },
      { name: 'workflow', fingerprint: 'reviewed-workflow-v1', applied_at: '2026-10-02T00:00:00Z' },
    ],
    updates: [101, 102, 103].map((number) => ({
      pr_number: number,
      kind: 'registry-update',
      bot: 'dependabot[bot]',
      merged: true,
      merged_at: `2026-10-${String(number - 98).padStart(2, '0')}T00:00:00Z`,
      head_sha: number.toString(16).padStart(40, '0'),
      human_intervention: false,
      trace_complete: true,
      timeline_complete: true,
      checks_complete: true,
      checks: [
        {
          context: 'Test (Node 22 on ubuntu-latest)',
          app_id: null,
          workflow_id: '272235418',
          workflow_path: '.github/workflows/ci.yml',
          head_sha: number.toString(16).padStart(40, '0'),
          conclusion: 'success',
        },
        {
          context: 'Test (Node 22 on macos-latest)',
          app_id: null,
          workflow_id: '272235418',
          workflow_path: '.github/workflows/ci.yml',
          head_sha: number.toString(16).padStart(40, '0'),
          conclusion: 'success',
        },
      ],
    })),
    incidents: [],
    incident_inventory_complete: true,
    target_contract_verified: true,
  };
}

it('AC21–22 computes a synthetic full stable window and three distinct genuine registered updates without claiming elapsed deployment', () => {
  const result = observeFactory(loadFactoryPolicy(), observation(), '2026-10-16T00:00:00Z');
  assert.equal(result.eligible, true);
  assert.equal(result.window_start, '2026-10-02T00:00:00.000Z');
  assert.equal(result.qualifying_updates, 3);
});

it('AC21–22 independently excludes false and missing timeline, checks and genuine-update evidence', () => {
  const policy = loadFactoryPolicy();
  const original = observation();
  const updates = Array.isArray(original['updates']) ? original['updates'].map(record) : [];
  const first = record(updates[0]);
  const controls: readonly [string, JsonRecord][] = [
    ['human-probe', { bot: 'apolenkov' }],
    ['source-pr', { kind: 'source-pr' }],
    ['night-fix', { kind: 'night-fix' }],
    ['closed-unmerged', { merged: false }],
    ['human-repair', { human_intervention: true }],
    ['missing-no-human-proof', { human_intervention: undefined }],
    ['false-trace', { trace_complete: false }],
    ['missing-trace', { trace_complete: undefined }],
    ['false-timeline', { timeline_complete: false }],
    ['missing-timeline', { timeline_complete: undefined }],
    ['false-check-inventory', { checks_complete: false }],
    ['missing-check-inventory', { checks_complete: undefined }],
    ['missing-check', { checks: [] }],
    [
      'wrong-head',
      {
        checks: Array.isArray(first['checks'])
          ? first['checks'].map((check) => ({ ...record(check), head_sha: 'f'.repeat(40) }))
          : [],
      },
    ],
    [
      'failed-check',
      {
        checks: Array.isArray(first['checks'])
          ? first['checks'].map((check) => ({ ...record(check), conclusion: 'failure' }))
          : [],
      },
    ],
    [
      'wrong-app',
      {
        checks: Array.isArray(first['checks'])
          ? first['checks'].map((check) => ({ ...record(check), app_id: 999 }))
          : [],
      },
    ],
    [
      'foreign-origin-workflow',
      {
        checks: Array.isArray(first['checks'])
          ? first['checks'].map((check) => ({ ...record(check), workflow_id: '1' }))
          : [],
      },
    ],
    [
      'missing-origin-workflow',
      {
        checks: Array.isArray(first['checks'])
          ? first['checks'].map((check) => ({ ...record(check), workflow_path: undefined }))
          : [],
      },
    ],
    ['invalid-merge-date', { merged_at: 'not-a-date' }],
    ['before-window', { merged_at: '2026-10-01T00:00:00Z' }],
    ['future-merge', { merged_at: '2026-10-17T00:00:00Z' }],
    ['missing-head', { head_sha: undefined }],
    ['duplicate-pr', { pr_number: 102 }],
  ];
  for (const [name, patch] of controls) {
    const result = observeFactory(
      policy,
      { ...original, updates: [{ ...first, ...patch }, ...updates.slice(1)] },
      '2026-10-16T00:00:00Z',
    );
    assert.equal(result.eligible, false, name);
    assert.equal(result.qualifying_updates, 2, name);
  }
});

it('AC21 restarts the window at material component application and denies day13, incident or incomplete target evidence', () => {
  const policy = loadFactoryPolicy();
  const input = observation();
  assert.equal(observeFactory(policy, input, '2026-10-15T00:00:00Z').eligible, false);
  const components = Array.isArray(input['components']) ? input['components'].map(record) : [];
  const changed = observeFactory(
    policy,
    {
      ...input,
      components: [
        {
          ...record(components[0]),
          fingerprint: 'reviewed-policy-v2',
          applied_at: '2026-10-15T00:00:00Z',
        },
        ...components.slice(1),
      ],
    },
    '2026-10-16T00:00:00Z',
  );
  assert.equal(changed.eligible, false);
  assert.equal(changed.window_start, '2026-10-15T00:00:00.000Z');
  assert.notEqual(
    changed.fingerprint,
    observeFactory(policy, input, '2026-10-16T00:00:00Z').fingerprint,
  );
  for (const patch of [
    { incidents: [{ kind: 'factory-incident' }] },
    { incidents: undefined },
    { incident_inventory_complete: false },
    { incident_inventory_complete: undefined },
    { target_contract_verified: false },
    { target_contract_verified: undefined },
    { components: [] },
  ])
    assert.equal(
      observeFactory(policy, { ...input, ...patch }, '2026-10-16T00:00:00Z').eligible,
      false,
    );
  assert.equal(observeFactory(policy, input, 'invalid-now').eligible, false);
});

it('AC25–26 preserves exact null check tuples, strict mode and unassigned target template without treating names as readiness', () => {
  const policy = loadFactoryPolicy();
  for (const patch of [
    {},
    { provider_transport: 'named-but-unverified', token_budget: 0, timeout_seconds: -1 },
    { activation: true },
    { security_gate_complete: true },
  ]) {
    const result = prepareTarget({ ...policy, ...patch });
    assert.equal(result.eligible, false);
    assert.equal(result.state, 'prepared-not-enabled');
    assert.equal(result.strict, true);
    assert.deepEqual(result.required_checks, policy['required_checks']);
    assert.deepEqual(result.new_targets, []);
  }
});

it('AC25 accepts a complete target with null check app IDs only through the approved CI workflow identity', () => {
  const policy = loadFactoryPolicy();
  const registry = arrayField(policy, 'workflow_registry').map((entry, index) => ({
    ...record(entry),
    id: String(701 + index),
  }));
  const complete = {
    ...policy,
    controller_workflow_id: '703',
    control_release_sha: 'a'.repeat(40),
    genesis_head: 'b'.repeat(40),
    provider_transport: 'fixture-approved-transport',
    token_budget: 1000,
    timeout_seconds: 60,
    workflow_registry: registry,
    security_gate_complete: true,
  };
  const result = prepareTarget(complete);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.eligible, true);
  assert.deepEqual(result.required_checks, policy['required_checks']);
  assert.ok(
    arrayField(complete, 'required_checks').every((check) => record(check)['app_id'] === null),
  );
  const origins: readonly [string, JsonRecord][] = [
    ['no CI workflow id', { ci_workflow_id: null }],
    ['non-numeric CI workflow id', { ci_workflow_id: 'ci' }],
    ['CI path outside workflows', { ci_workflow_path: 'scripts/ci.yml' }],
    ['invented zero app', { required_checks: [{ context: 'Test', app_id: 0 }] }],
    ['stringly app', { required_checks: [{ context: 'Test', app_id: '15368' }] }],
    ['absent app', { required_checks: [{ context: 'Test' }] }],
  ];
  for (const [name, patch] of origins) {
    const denied = prepareTarget({ ...complete, ...patch });
    assert.equal(denied.eligible, false, name);
    assert.deepEqual(denied.reasons, ['Unknown trusted check origin'], name);
  }
  assert.equal(
    prepareTarget({ ...complete, required_checks: [{ context: 'Test', app_id: 15368 }] }).eligible,
    true,
  );
});

it('AC21–22 native observe CLI refuses to certify supplied synthetic qualifying candidates without independent provenance', (test) => {
  const input = observation();
  const candidates = {
    ...input,
    components: [
      { name: 'policy', fingerprint: 'synthetic-only', applied_at: '2000-01-01T00:00:00Z' },
    ],
    updates: Array.isArray(input['updates'])
      ? input['updates'].map((update) => ({ ...record(update), merged_at: '2000-01-02T00:00:00Z' }))
      : [],
  };
  assert.equal(
    observeFactory(loadFactoryPolicy(), candidates, new Date().toISOString()).eligible,
    true,
  );
  fs.mkdirSync(path.resolve('.worktrees'), { recursive: true });
  const directory = fs.mkdtempSync(path.resolve('.worktrees', 'factory-observation-cli-'));
  test.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const request = path.join(directory, 'request.json');
  fs.writeFileSync(request, JSON.stringify(candidates));
  const output = execFileSync(
    process.execPath,
    ['scripts/factory-operations.ts', 'observe', request],
    {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_TOKEN: '', FACTORY_ACTIVATION_POLICY_PIN: '' },
    },
  );
  const parsed: unknown = JSON.parse(output);
  const decision = record(parsed);
  assert.equal(decision['status'], 'prepared');
  const result = record(decision['record']);
  assert.equal(result['qualifying_updates'], 3);
  assert.equal(result['eligible'], false);
  assert.match(
    String(result['reason']),
    /independent timeline\/component provenance not established/,
  );
});
