import assert from 'node:assert/strict';
import fs from 'node:fs';
import { it } from 'node:test';
import {
  validateFactoryHardening,
  validateInertWorkflow,
  validateKeyJob,
  validateSecretIsolation,
  validateWorkflowSchema,
} from '../scripts/check-factory-workflows.ts';

const NAME = 'factory-control.yml';
const workflow = fs.readFileSync(new URL(`../.github/workflows/${NAME}`, import.meta.url), 'utf8');
const marker = '\n  role-prepare:\n';
const split = workflow.indexOf(marker);
const prefix = workflow.slice(0, split);
const role = workflow.slice(split);
function gate(content: string): void {
  validateWorkflowSchema(content, NAME);
  validateInertWorkflow(content, NAME);
  validateKeyJob(content, NAME);
  validateSecretIsolation(content, NAME);
  validateFactoryHardening(content, NAME);
}

it('pins the real readonly role job including native owner/attempt, authority pins and no effects', () => {
  assert.ok(split > 0, 'real role-prepare job present');
  gate(workflow);
  for (const [from, to] of [
    ["github.actor_id == '23296915'", "github.actor_id != '23296915'"],
    ["github.actor == 'apolenkov'", "github.actor == 'github-actions[bot]'"],
    ['github.run_attempt == 1', 'github.run_attempt >= 1'],
    ["github.event_name == 'workflow_dispatch'", "github.event_name == 'workflow_run'"],
    ["github.ref == 'refs/heads/main'", "github.ref != 'refs/heads/main'"],
    ['needs: append-reserve', 'needs: preflight'],
    ['contents: read', 'contents: write'],
    ['actions: read', 'actions: none'],
    ['issues: read', 'issues: write'],
    ['timeout-minutes: 10', 'timeout-minutes: 90'],
    ['persist-credentials: false', 'persist-credentials: true'],
    ['ref: ${{ github.workflow_sha }}', 'ref: ${{ github.sha }}'],
    ['npm ci --ignore-scripts', 'npm ci'],
    ['${{ vars.FACTORY_ROLE_CONTROL_PIN }}', '${{ inputs.request }}'],
    ['${{ vars.FACTORY_ACTIVATION_POLICY_PIN }}', '${{ inputs.request }}'],
    ['factory-repair.ts prepare', 'factory-repair.ts publish'],
    ['    steps:', '    container: node:26\n    steps:'],
    ['    steps:', '    environment: ci\n    steps:'],
    [
      '          GITHUB_TOKEN:',
      '          OCR_LLM_AUTH_TOKEN: ${{ secrets.OCR_LLM_AUTH_TOKEN }}\n          GITHUB_TOKEN:',
    ],
  ] as const) {
    assert.ok(role.includes(from), `mutation target present: ${from}`);
    assert.throws(() => {
      gate(prefix + role.replace(from, to));
    }, from);
  }
  assert.throws(() => {
    gate(prefix + role + '      - run: echo unexpected\n');
  });
  assert.throws(() => {
    gate(prefix);
  }, /role-prepare/);
  assert.throws(() => {
    gate(
      workflow +
        '\n  role-publish:\n    runs-on: ubuntu-latest\n    permissions: {}\n    steps:\n      - run: echo HOLD\n',
    );
  }, /role/);
  assert.throws(() => {
    gate(
      workflow +
        '\n  another-job:\n    runs-on: ubuntu-latest\n    permissions:\n      actions: read\n    steps:\n      - run: node scripts/factory-repair.ts publish\n',
    );
  }, /role/);
});
