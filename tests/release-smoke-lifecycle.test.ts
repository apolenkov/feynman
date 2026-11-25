import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it, type TestContext } from 'node:test';
import { releaseSmoke, type ReleaseCommandRunner } from '../scripts/release-smoke.ts';

const version = '1.2.3';

function packedFixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-smoke-trace-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ version, files: ['plugins/'] }),
  );
  const dist = path.join(root, 'dist');
  const tarball = path.join(dist, 'fixture.tgz');
  fs.mkdirSync(dist);
  fs.writeFileSync(tarball, 'synthetic packed artifact');
  fs.writeFileSync(path.join(dist, 'TARBALL.txt'), 'dist/fixture.tgz\n');
  const temporaryRoot = path.join(root, 'temporary');
  fs.mkdirSync(temporaryRoot);
  const calls: string[][] = [];
  const stdout: string[] = [];
  t.mock.method(console, 'log', (message: string) => stdout.push(message));
  const members = [
    [
      '.codex-plugin/plugin.json',
      JSON.stringify({
        name: 'feynman',
        version,
        skills: './skills/',
        interface: { brandColor: '#2563EB' },
      }),
    ],
    ['skills/feynman/SKILL.md', '[settings](references/settings.md)'],
    ['skills/feynman/references/settings.md', 'feynman state [status|on|off]'],
  ] as const;
  const entries = new Map(
    members.map(([name, contents]) => ['package/plugins/feynman/' + name, contents]),
  );
  const archiveCalls = [
    ['tar', '-tzf', tarball],
    ...Array.from(entries.keys(), (member) => ['tar', '-xOf', tarball, member]),
  ];
  const ok = (stdout = '') => ({ stdout, stderr: '', status: 0, signal: null, error: undefined });
  const inspect: ReleaseCommandRunner = (_command, args) => {
    if (args[0] === '-tzf') return ok(Array.from(entries.keys()).join('\n'));
    const member = entries.get(args[2] ?? '');
    assert.ok(member !== undefined);
    return ok(member);
  };
  const run = (consumer: ReleaseCommandRunner) => {
    releaseSmoke({
      root,
      temporaryRoot,
      runCommand: (command, args, options) => {
        assert.equal(options.cwd, root);
        calls.push([command, ...args]);
        return (command === 'tar' ? inspect : consumer)(command, args, options);
      },
    });
  };
  return { root, temporaryRoot, tarball, calls, stdout, archiveCalls, run, ok };
}

function scratch(temporaryRoot: string): string {
  const dirs = fs.readdirSync(temporaryRoot);
  assert.equal(dirs.length, 1);
  const [dir] = dirs;
  assert.ok(dir !== undefined);
  assert.match(dir, /^feynman-release-smoke-/);
  return path.join(temporaryRoot, dir);
}

it('inspects packed members, then runs the installed CLI, registered hook and lint in order', (t) => {
  const fx = packedFixture(t);
  let tmp = '';
  fx.run((command, args, options) => {
    tmp = scratch(fx.temporaryRoot);
    const home = path.join(tmp, 'home');
    const project = path.join(tmp, 'project');
    const hookScript = path.join(project, 'hooks', 'feynman-session-start.js');
    const codexHome = path.join(home, '.codex');
    const hook = `FEYNMAN_HOME='${codexHome}' node '${hookScript}'`;
    if (command === 'npm') {
      assert.equal(options.env['HOME'], path.join(tmp, 'npm-home'));
      assert.equal(options.env['npm_config_ignore_scripts'], 'true');
      return fx.ok();
    }
    if (args[0] === 'version' || args[0] === 'install' || args[0] === 'doctor') {
      assert.equal(options.env['HOME'], home);
      if (args[0] === 'version') return fx.ok(version);
      if (args[0] === 'doctor') return fx.ok('Status: OK');
      assert.deepEqual(args, ['install']);
      const settings = path.join(codexHome, 'hooks.json');
      const stale = fs.readFileSync(settings, 'utf8');
      fs.writeFileSync(
        settings,
        stale.replace(JSON.stringify('node /stale/feynman-session-start.ts'), JSON.stringify(hook)),
      );
      return fx.ok(`│ hook:     ${hookScript}\n`);
    }
    if (command === hook) {
      assert.equal(options.env['HOME'], home);
      assert.equal(options.shell, true);
      assert.equal(
        options.input,
        '{"hook_event_name":"SessionStart","session_id":"codex-release-smoke"}',
      );
      return fx.ok('<triggers>');
    }
    return fx.ok('{"issues":[]}');
  });
  assert.ok(tmp);
  const project = path.join(tmp, 'project');
  const bin = path.join(project, 'node_modules', '.bin');
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  const feynman = path.join(bin, 'feynman' + suffix);
  const codexHome = path.join(tmp, 'home', '.codex');
  const hookScript = path.join(project, 'hooks', 'feynman-session-start.js');
  assert.deepEqual(fx.calls, [
    ...fx.archiveCalls,
    ['npm', 'install', '--prefix', project, fx.tarball],
    [feynman, 'version'],
    [feynman, 'install'],
    [feynman, 'doctor'],
    [`FEYNMAN_HOME='${codexHome}' node '${hookScript}'`],
    [
      path.join(bin, 'feynman-lint' + suffix),
      '--json',
      path.join(fx.root, 'tests/fixtures/valid-flow.md'),
    ],
  ]);
  assert.deepEqual(fx.stdout, [
    'tarball manifest OK (1 files[] entries present)',
    'release smoke OK (fixture.tgz)',
  ]);
  assert.deepEqual(fs.readdirSync(fx.temporaryRoot), []);
});

it('keeps the install signal and both streams as the cause when smoke cleanup also fails', (t) => {
  const fx = packedFixture(t);
  const cleanup = new Error('scratch cleanup denied');
  const original = fs.rmSync;
  const remove = t.mock.method(fs, 'rmSync', (target: fs.PathLike, options?: fs.RmOptions) => {
    if (path.dirname(String(target)) === fx.temporaryRoot) throw cleanup;
    original(target, options);
  });
  try {
    assert.throws(
      () => {
        fx.run(() => ({
          stdout: 'install output',
          stderr: 'install interrupted',
          status: null,
          signal: 'SIGTERM',
          error: undefined,
        }));
      },
      (error: unknown) => {
        const tmp = scratch(fx.temporaryRoot);
        const args = ['npm', 'install', '--prefix', path.join(tmp, 'project'), fx.tarball];
        const diagnostic = [
          `command failed: ${args.join(' ')}`,
          'terminated by signal: SIGTERM',
          'install output',
          'install interrupted',
        ].join('\n');
        assert.ok(error instanceof AggregateError && error.cause instanceof Error);
        assert.equal(error.cause.message, diagnostic);
        assert.equal(error.message, diagnostic + '; cleanup also failed');
        assert.deepEqual(error.errors, [error.cause, cleanup]);
        assert.deepEqual(fx.calls, [...fx.archiveCalls, args]);
        assert.deepEqual(
          remove.mock.calls.map((call) => call.arguments),
          [[tmp, { recursive: true, force: true }]],
        );
        return true;
      },
    );
    assert.deepEqual(fx.stdout, ['tarball manifest OK (1 files[] entries present)']);
  } finally {
    remove.mock.restore();
  }
});
