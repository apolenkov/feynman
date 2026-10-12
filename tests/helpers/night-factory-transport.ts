import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { TestContext } from 'node:test';
import {
  arrayField,
  canonicalBytes,
  createFactoryContext,
  emitAuthority,
  loadFactoryPolicy,
  numberField,
  record,
  sha256,
  stringField,
} from '../../scripts/factory-protocol.ts';
import type { FactoryContext, JsonRecord } from '../../scripts/factory-protocol.ts';
import { gitFixtureEnvironment } from './git-environment.ts';

const REPOSITORY = '/repos/apolenkov/feynman';
export class FactoryPlatform {
  readonly root: string;
  readonly repository: string;
  readonly requests: { readonly method: string; readonly path: string; readonly body: unknown }[] =
    [];
  readonly facts = new Map<string, unknown>();
  readonly issues: JsonRecord[] = [];
  readonly pulls: JsonRecord[] = [];
  readonly artifacts: JsonRecord[] = [];
  readonly runs: JsonRecord[] = [];
  readonly archives = new Map<string, Buffer>();
  readonly logs = new Map<string, Buffer>();
  readonly failures = new Map<string, number>();
  readonly overrides = new Map<string, unknown>();
  private readonly immutable = new Map<string, unknown>();
  readonly release: string;
  readonly manifest: readonly JsonRecord[];
  readonly workflowIds = ['701', '702', '703', '704'];
  private counter = 1000;
  private gitProcessLaunches = 0;
  constructor(test: TestContext, fileOverrides: ReadonlyMap<string, Buffer> = new Map()) {
    this.root = fs.mkdtempSync(path.join(process.cwd(), '.worktrees', 'factory-platform-'));
    this.repository = path.join(this.root, 'remote.git');
    execFileSync('git', ['init', '--bare', '-q', this.repository], {
      env: gitFixtureEnvironment(),
    });
    test.after(() => {
      fs.rmSync(this.root, { recursive: true, force: true });
    });
    const files = [
      '.github/workflows/ci.yml',
      '.github/workflows/night-review.yml',
      '.github/workflows/factory-ingress.yml',
      '.github/workflows/factory-control.yml',
      '.github/workflows/factory-operations.yml',
      'scripts/factory-policy.json',
      'scripts/factory-protocol.ts',
      'scripts/factory-control.ts',
      'scripts/factory-publication.ts',
      'scripts/factory-writer.ts',
      'scripts/factory-operations.ts',
      'scripts/factory-preservation.ts',
      'scripts/check-factory-workflows.ts',
      'package.json',
      'package-lock.json',
    ];
    const contents = new Map(
      files.map((file) => [file, fileOverrides.get(file) ?? fs.readFileSync(file)]),
    );
    this.manifest = [...contents.entries()].map(([file, bytes]) => ({
      path: file,
      blob_sha: this.git(['hash-object', '-w', '--stdin'], bytes),
    }));
    this.release = this.commitFiles(contents, []);
    this.git(['update-ref', 'refs/heads/main', this.release]);
    this.facts.set(REPOSITORY, {
      id: 1230959148,
      full_name: 'apolenkov/feynman',
      default_branch: 'main',
      visibility: 'public',
      owner: { id: 23296915, login: 'apolenkov' },
      allow_squash_merge: true,
      allow_merge_commit: false,
      allow_rebase_merge: false,
    });
    const workflows = record(loadFactoryPolicy())['workflow_registry'];
    if (!Array.isArray(workflows)) throw new Error('Fixture requires real static policy registry');
    const registry = workflows.map((workflow, index) => ({
      ...record(workflow),
      id: this.workflowIds[index],
      state: 'active',
    }));
    this.facts.set(`${REPOSITORY}/actions/workflows`, {
      workflows: registry,
      total_count: registry.length,
    });
    for (const workflow of registry)
      this.facts.set(`${REPOSITORY}/actions/workflows/${String(workflow.id)}`, workflow);
    test.mock.method(
      globalThis,
      'fetch',
      async (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
        await this.fetch(input, init),
    );
  }
  git(args: readonly string[], input?: Buffer | string): string {
    this.gitProcessLaunches++;
    const inputFile =
      input !== undefined && args[0] === 'hash-object' && args.includes('--stdin')
        ? path.join(this.root, `git-input-${this.counter++}`)
        : undefined;
    if (inputFile !== undefined && input !== undefined) fs.writeFileSync(inputFile, input);
    try {
      return execFileSync(
        'git',
        [
          '--git-dir',
          this.repository,
          ...args.map((argument) =>
            argument === '--stdin' && inputFile !== undefined ? inputFile : argument,
          ),
          ...(inputFile === undefined ? [] : ['--no-filters']),
        ],
        {
          env: gitFixtureEnvironment(),
          encoding: 'utf8',
          input: inputFile === undefined ? input : undefined,
          timeout: 30000,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      ).trim();
    } finally {
      if (inputFile !== undefined) fs.rmSync(inputFile);
    }
  }
  commitFiles(files: ReadonlyMap<string, Buffer>, parents: readonly string[]): string {
    const index = path.join(this.root, `index-${this.counter++}`);
    const env = {
      ...gitFixtureEnvironment(),
      GIT_INDEX_FILE: index,
      GIT_AUTHOR_NAME: 'Platform',
      GIT_AUTHOR_EMAIL: 'platform@example.invalid',
      GIT_COMMITTER_NAME: 'Platform',
      GIT_COMMITTER_EMAIL: 'platform@example.invalid',
    };
    const git = (args: readonly string[], input?: string): string =>
      execFileSync('git', ['--git-dir', this.repository, ...args], {
        env,
        input,
        encoding: 'utf8',
      }).trim();
    git(['read-tree', '--empty']);
    for (const [file, bytes] of files)
      git([
        'update-index',
        '--add',
        '--cacheinfo',
        `100644,${this.git(['hash-object', '-w', '--stdin'], bytes)},${file}`,
      ]);
    const tree = git(['write-tree']);
    return git(
      ['commit-tree', tree, ...parents.flatMap((parent) => ['-p', parent])],
      'fixture: platform Git object\n',
    );
  }
  context(
    activation: JsonRecord,
    runId = '901',
    role: FactoryContext['role'] = 'repair',
    workflowIndex = 2,
  ): FactoryContext {
    const bytes = Buffer.from(JSON.stringify(activation, null, 2));
    const revision = this.commitFiles(new Map([['activation-policy.json', bytes]]), []);
    const blob = this.git(['rev-parse', `${revision}:activation-policy.json`]);
    const registry = activation['workflow_registry'];
    if (!Array.isArray(registry)) throw new Error('Fixture activation registry absent');
    const workflow = record(registry[workflowIndex]);
    const run = {
      id: Number(runId),
      workflow_id: Number(workflow['id']),
      path: workflow['path'],
      event: 'workflow_dispatch',
      head_sha: this.release,
      head_branch: 'main',
      repository: { id: 1230959148 },
      head_repository: { id: 1230959148 },
      run_attempt: 1,
      actor: { id: 23296915, login: 'apolenkov' },
      triggering_actor: { id: 23296915, login: 'apolenkov' },
      status: 'in_progress',
      run_started_at: '2026-10-12T00:01:00Z',
      updated_at: '2026-10-12T00:01:00Z',
    };
    this.runs.push(run);
    this.facts.set(`${REPOSITORY}/actions/runs/${runId}`, run);
    this.facts.set(`${REPOSITORY}/actions/runs/${runId}/attempts/1`, run);
    this.facts.set(`${REPOSITORY}/actions/runs/${runId}/attempts/1/jobs`, {
      jobs: [],
      total_count: 0,
    });
    return createFactoryContext(
      loadFactoryPolicy(),
      'platform-fixture-token',
      {
        run_id: runId,
        run_attempt: 1,
        workflow_source_sha: this.release,
        workflow_ref: `apolenkov/feynman/${stringField(workflow, 'path')}@refs/heads/main`,
        activation_policy_pin: `${revision}:${blob}`,
      },
      role,
    );
  }
  activation(overrides: JsonRecord = {}): JsonRecord {
    const policy = loadFactoryPolicy();
    const registry = policy['workflow_registry'];
    if (!Array.isArray(registry)) throw new Error('Fixture static registry absent');
    return {
      schema: 'factory/v1',
      repository_id: '1230959148',
      activation: true,
      control_release_sha: this.release,
      control_manifest: this.manifest,
      controller_workflow_id: '703',
      workflow_registry: registry.map((entry, index) => ({
        ...record(entry),
        id: this.workflowIds[index],
      })),
      epoch_id: 'fixture-epoch',
      genesis_head: 'a'.repeat(40),
      genesis_receipt_sha256: 'b'.repeat(64),
      bootstrap_ticket: {
        schema: 'factory/v1',
        repository_id: '1230959148',
        epoch_id: 'fixture-epoch',
        control_release_sha: this.release,
        legacy_mode: 'quarantine',
        legacy_cutoff_sha: this.release,
        legacy_cutoff_at: '2026-10-11T00:00:00Z',
      },
      legacy_inventory_sha256: 'c'.repeat(64),
      bootstrap_completed: true,
      provider_transport: 'fixture-approved-transport',
      token_budget: 1000,
      timeout_seconds: 60,
      ...overrides,
    };
  }
  upload(
    core: JsonRecord,
    kind: 'receipt' | 'checkpoint',
    transitionId: string,
    phase: string,
  ): JsonRecord {
    const artifactId = String(this.counter++);
    const jobId = String(this.counter++);
    const directory = path.join(this.root, `upload-${artifactId}`);
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, `${kind}.json`), canonicalBytes(core));
    const archive = execFileSync(
      'bsdtar',
      ['--format=zip', '-cf', '-', '-C', directory, `${kind}.json`],
      { maxBuffer: 2_000_000 },
    );
    const digest = sha256(archive);
    const jobsPath = `${REPOSITORY}/actions/runs/${String(core['run_id'])}/attempts/${numberField(core, 'run_attempt')}/jobs`;
    const previous = this.facts.get(jobsPath);
    const jobs = previous === undefined ? [] : arrayField(record(previous), 'jobs');
    const actualRun = this.facts.get(
      `${REPOSITORY}/actions/runs/${String(core['run_id'])}/attempts/${numberField(core, 'run_attempt')}`,
    );
    const runStarted =
      actualRun === undefined
        ? Date.parse('2026-10-12T00:01:00Z')
        : Date.parse(stringField(record(actualRun), 'run_started_at'));
    const completedJobs = [...this.facts.entries()]
      .filter(([route]) => /^\/repos\/apolenkov\/feynman\/actions\/jobs\/\d+$/.test(route))
      .map(([, job]) => Date.parse(stringField(record(job), 'completed_at')) + 1000);
    const started = Math.max(runStarted, ...completedJobs);
    const startAt = new Date(started).toISOString();
    const completedAt = new Date(started + 1000).toISOString();
    const createdAt = new Date(started + 500).toISOString();
    const marker = emitAuthority({
      schema: 'factory/v1',
      kind,
      run_id: core['run_id'],
      run_attempt: core['run_attempt'],
      workflow_id: core['workflow_id'],
      workflow_source_sha: core['workflow_source_sha'],
      control_release_sha: core['control_release_sha'],
      phase,
      transition_id: transitionId,
      artifact_id: artifactId,
      archive_sha256: digest,
      receipt_sha256: sha256(core),
    });
    const log = Buffer.from(`${completedAt} ${marker}\n`);
    this.archives.set(artifactId, archive);
    this.logs.set(jobId, log);
    const job = {
      id: Number(jobId),
      run_id: Number(core['run_id']),
      run_attempt: core['run_attempt'],
      name: `factory-authority-${phase}`,
      head_sha: core['workflow_source_sha'],
      status: 'completed',
      conclusion: 'success',
      started_at: startAt,
      completed_at: completedAt,
      steps: [
        { name: 'Upload authority', conclusion: 'success' },
        { name: 'Emit authority', conclusion: 'success' },
      ],
    };
    this.facts.set(`${REPOSITORY}/actions/jobs/${jobId}`, job);
    this.facts.set(jobsPath, { jobs: [...jobs, job], total_count: jobs.length + 1 });
    const artifact = {
      id: Number(artifactId),
      name: `factory-v1-${kind}-${String(core['run_id'])}-${numberField(core, 'run_attempt')}-${transitionId}`,
      expired: false,
      digest: `sha256:${digest}`,
      created_at: createdAt,
      expires_at: new Date(started + 500 + 90 * 86400000).toISOString(),
      workflow_run: {
        id: Number(core['run_id']),
        repository_id: 1230959148,
        head_repository_id: 1230959148,
        head_sha: core['workflow_source_sha'],
      },
    };
    this.artifacts.push(artifact);
    this.facts.set(`${REPOSITORY}/actions/artifacts/${artifactId}`, artifact);
    return {
      schema: 'factory/v1',
      receipt: core,
      receipt_sha256: sha256(core),
      transport: {
        artifact_id: artifactId,
        archive_sha256: digest,
        producer_job_id: jobId,
        producer_log_sha256: sha256(log),
      },
    };
  }
  async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    return await Promise.resolve(this.response(input, init));
  }
  private response(input: string | URL | Request, init?: RequestInit): Response {
    const url = new URL(input instanceof Request ? input.url : input);
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    this.requests.push({ method, path: url.pathname + url.search, body });
    fs.writeFileSync(
      path.join(this.root, 'transport-trace.json'),
      JSON.stringify({
        git_process_launches: this.gitProcessLaunches,
        requests: this.requests.length,
        last: { method, path: url.pathname + url.search },
        recent: this.requests.slice(-8).map(({ method, path }) => ({ method, path })),
      }),
    );
    const failure = this.failures.get(`${method} ${url.pathname}`);
    if (failure !== undefined) return new Response('{}', { status: failure });
    if (url.hostname === 'artifact-storage.example.invalid') {
      const archive = this.archives.get(url.pathname.slice(1));
      return archive === undefined ? new Response('', { status: 404 }) : new Response(archive);
    }
    if (this.overrides.has(url.pathname)) return Response.json(this.overrides.get(url.pathname));
    const logs = /^\/repos\/apolenkov\/feynman\/actions\/jobs\/(\d+)\/logs$/.exec(
      url.pathname,
    )?.[1];
    if (logs !== undefined)
      return new Response(this.logs.get(logs) ?? '', { status: this.logs.has(logs) ? 200 : 404 });
    const archive = /^\/repos\/apolenkov\/feynman\/actions\/artifacts\/(\d+)\/zip$/.exec(
      url.pathname,
    )?.[1];
    if (archive !== undefined)
      return new Response(null, {
        status: 302,
        headers: { location: `https://artifact-storage.example.invalid/${archive}` },
      });
    if (method === 'GET' && this.facts.has(url.pathname))
      return this.page(this.facts.get(url.pathname), url);
    const issuePatch = /^\/repos\/apolenkov\/feynman\/issues\/(\d+)$/.exec(url.pathname)?.[1];
    if (method === 'PATCH' && issuePatch !== undefined) {
      const issue = this.issues.find((candidate) => candidate['number'] === Number(issuePatch));
      if (issue === undefined) return new Response('{}', { status: 404 });
      const updated = { ...issue, ...record(body) };
      this.issues.splice(this.issues.indexOf(issue), 1, updated);
      this.facts.set(url.pathname, updated);
      return Response.json(updated);
    }
    const disable = /^\/repos\/apolenkov\/feynman\/actions\/workflows\/(\d+)\/disable$/.exec(
      url.pathname,
    )?.[1];
    if (method === 'PUT' && disable !== undefined) {
      const route = `${REPOSITORY}/actions/workflows/${disable}`;
      const workflow = this.facts.get(route);
      if (workflow === undefined) return new Response(null, { status: 404 });
      const updated = { ...record(workflow), state: 'disabled_manually' };
      this.facts.set(route, updated);
      const listing = record(this.facts.get(`${REPOSITORY}/actions/workflows`));
      const entries = arrayField(listing, 'workflows');
      this.facts.set(`${REPOSITORY}/actions/workflows`, {
        ...listing,
        workflows: entries.map((entry) =>
          String(record(entry)['id']) === disable ? updated : entry,
        ),
      });
      return new Response(null, { status: 204 });
    }
    const cancel = /^\/repos\/apolenkov\/feynman\/actions\/runs\/(\d+)\/cancel$/.exec(
      url.pathname,
    )?.[1];
    if (method === 'POST' && cancel !== undefined) {
      const run = this.runs.find((candidate) => String(candidate['id']) === cancel);
      if (run === undefined) return new Response(null, { status: 404 });
      if (this.overrides.get(`${url.pathname}#nonterminal`) !== true) {
        const updated = { ...run, status: 'completed', conclusion: 'cancelled' };
        this.runs.splice(this.runs.indexOf(run), 1, updated);
        this.facts.set(`${REPOSITORY}/actions/runs/${cancel}`, updated);
      }
      return Response.json(null, { status: 202 });
    }
    if (method === 'POST' && url.pathname === '/graphql') {
      const request = record(body);
      if (
        typeof request['query'] === 'string' &&
        request['query'].includes('disablePullRequestAutoMerge')
      ) {
        const pr = this.pulls.find(
          (candidate) => candidate['node_id'] === record(request['variables'])['id'],
        );
        if (pr === undefined) return Response.json({ errors: [{ message: 'Unknown node' }] });
        this.pulls.splice(this.pulls.indexOf(pr), 1, { ...pr, auto_merge: null });
        return Response.json({ data: { disablePullRequestAutoMerge: { clientMutationId: null } } });
      }
      const response = this.facts.get(`graphql:${String(record(request['variables'])['id'])}`);
      return Response.json(
        response === undefined
          ? { errors: [{ message: 'Unconfigured fixture GraphQL response' }] }
          : { data: response },
      );
    }
    if (url.pathname === `${REPOSITORY}/issues`) {
      if (method === 'POST') {
        const issue = {
          ...record(body),
          number: this.counter++,
          node_id: `I_${this.counter}`,
          state: 'open',
          created_at: '2026-10-12T00:00:00Z',
        };
        this.issues.push(issue);
        this.facts.set(`${REPOSITORY}/issues/${issue.number}`, issue);
        return Response.json(issue, { status: 201 });
      }
      return this.page(this.issues, url);
    }
    if (url.pathname === `${REPOSITORY}/pulls`) return this.page(this.pulls, url);
    if (url.pathname === `${REPOSITORY}/actions/artifacts`)
      return this.page({ artifacts: this.artifacts, total_count: this.artifacts.length }, url);
    if (
      /\/actions\/workflows\/\d+\/runs$/.test(url.pathname) ||
      url.pathname === `${REPOSITORY}/actions/runs`
    )
      return this.page({ workflow_runs: this.runs, total_count: this.runs.length }, url);
    const immutableKey = url.pathname + url.search;
    if (method === 'GET' && this.immutable.has(immutableKey))
      return Response.json(this.immutable.get(immutableKey));
    const content = /^\/repos\/apolenkov\/feynman\/contents\/(.+)$/.exec(url.pathname)?.[1];
    if (content !== undefined) {
      try {
        const ref = url.searchParams.get('ref') ?? 'main';
        const blob = this.git(['rev-parse', `${ref}:${content}`]);
        const bytes = execFileSync(
          'git',
          ['--git-dir', this.repository, 'cat-file', 'blob', blob],
          { env: gitFixtureEnvironment(), timeout: 30000 },
        );
        const value = {
          type: 'file',
          sha: blob,
          encoding: 'base64',
          content: bytes.toString('base64'),
          size: bytes.length,
        };
        if (/^[a-f0-9]{40}$/.test(ref)) this.immutable.set(immutableKey, value);
        return Response.json(value);
      } catch {
        return new Response('{}', { status: 404 });
      }
    }
    const ref = /^\/repos\/apolenkov\/feynman\/git\/ref\/heads\/(.+)$/.exec(url.pathname)?.[1];
    if (ref !== undefined) {
      try {
        return Response.json({ object: { sha: this.git(['rev-parse', `refs/heads/${ref}`]) } });
      } catch {
        return new Response('{}', { status: 404 });
      }
    }
    const comparison =
      /^\/repos\/apolenkov\/feynman\/compare\/([a-f0-9]{40})\.\.\.([a-f0-9]{40})$/.exec(
        url.pathname,
      );
    if (comparison?.[1] !== undefined && comparison[2] !== undefined) {
      try {
        this.git(['merge-base', '--is-ancestor', comparison[1], comparison[2]]);
        return Response.json({ status: comparison[1] === comparison[2] ? 'identical' : 'ahead' });
      } catch {
        return Response.json({ status: 'diverged' });
      }
    }
    const gitCommit = /^\/repos\/apolenkov\/feynman\/git\/commits\/([a-f0-9]{40})$/.exec(
      url.pathname,
    )?.[1];
    if (gitCommit !== undefined) {
      try {
        const [tree, parents = ''] = this.git(['show', '-s', '--format=%T%n%P', gitCommit]).split(
          '\n',
        );
        const value = {
          sha: gitCommit,
          tree: { sha: tree },
          parents: parents ? parents.split(' ').map((sha) => ({ sha })) : [],
        };
        this.immutable.set(immutableKey, value);
        return Response.json(value);
      } catch {
        return new Response('{}', { status: 404 });
      }
    }
    const gitTree = /^\/repos\/apolenkov\/feynman\/git\/trees\/([a-f0-9]{40})$/.exec(
      url.pathname,
    )?.[1];
    if (gitTree !== undefined) {
      try {
        const rows = this.git(['ls-tree', '-r', '-t', '-z', gitTree]).split('\0').filter(Boolean);
        const tree = rows.map((row) => {
          const [metadata, file] = row.split('\t');
          const [mode, type, sha] = (metadata ?? '').split(' ');
          return { mode, type, sha, path: file };
        });
        const value = { sha: gitTree, truncated: false, tree };
        this.immutable.set(immutableKey, value);
        return Response.json(value);
      } catch {
        return new Response('{}', { status: 404 });
      }
    }
    const gitBlob = /^\/repos\/apolenkov\/feynman\/git\/blobs\/([a-f0-9]{40})$/.exec(
      url.pathname,
    )?.[1];
    if (gitBlob !== undefined) {
      try {
        const bytes = execFileSync(
          'git',
          ['--git-dir', this.repository, 'cat-file', 'blob', gitBlob],
          { env: gitFixtureEnvironment(), timeout: 30000 },
        );
        const value = {
          sha: gitBlob,
          size: bytes.length,
          encoding: 'base64',
          content: bytes.toString('base64'),
        };
        this.immutable.set(immutableKey, value);
        return Response.json(value);
      } catch {
        return new Response('{}', { status: 404 });
      }
    }
    if (method === 'POST' && url.pathname === `${REPOSITORY}/git/blobs`)
      return Response.json(
        {
          sha: this.git(
            ['hash-object', '-w', '--stdin'],
            Buffer.from(stringField(record(body), 'content'), 'base64'),
          ),
        },
        { status: 201 },
      );
    if (method === 'POST' && url.pathname === `${REPOSITORY}/git/trees`) {
      const entries = record(body)['tree'];
      if (!Array.isArray(entries)) return new Response('{}', { status: 422 });
      const index = path.join(this.root, `tree-index-${this.counter++}`);
      const env = { ...gitFixtureEnvironment(), GIT_INDEX_FILE: index };
      const git = (args: readonly string[]): string =>
        execFileSync('git', ['--git-dir', this.repository, ...args], {
          env,
          encoding: 'utf8',
        }).trim();
      git(['read-tree', '--empty']);
      for (const entry of entries.map(record))
        git([
          'update-index',
          '--add',
          '--cacheinfo',
          `${stringField(entry, 'mode')},${stringField(entry, 'sha')},${stringField(entry, 'path')}`,
        ]);
      return Response.json({ sha: git(['write-tree']) }, { status: 201 });
    }
    if (method === 'POST' && url.pathname === `${REPOSITORY}/git/commits`) {
      const input = record(body);
      const parents = input['parents'];
      if (!Array.isArray(parents) || parents.some((parent) => typeof parent !== 'string'))
        return new Response('{}', { status: 422 });
      const env = {
        ...gitFixtureEnvironment(),
        GIT_AUTHOR_NAME: 'Platform',
        GIT_AUTHOR_EMAIL: 'platform@example.invalid',
        GIT_COMMITTER_NAME: 'Platform',
        GIT_COMMITTER_EMAIL: 'platform@example.invalid',
      };
      const sha = execFileSync(
        'git',
        [
          '--git-dir',
          this.repository,
          'commit-tree',
          stringField(input, 'tree'),
          ...parents.flatMap((parent) => ['-p', String(parent)]),
        ],
        { env, input: stringField(input, 'message'), encoding: 'utf8' },
      ).trim();
      return Response.json({ sha }, { status: 201 });
    }
    if (method === 'POST' && url.pathname === `${REPOSITORY}/git/refs`) {
      try {
        this.git([
          'update-ref',
          stringField(record(body), 'ref'),
          stringField(record(body), 'sha'),
          '',
        ]);
        return Response.json(body, { status: 201 });
      } catch {
        return new Response('{}', { status: 422 });
      }
    }
    const update = /^\/repos\/apolenkov\/feynman\/git\/refs\/heads\/(.+)$/.exec(url.pathname)?.[1];
    if (method === 'DELETE' && update !== undefined) {
      try {
        this.git(['rev-parse', `refs/heads/${update}`]);
        this.git(['update-ref', '-d', `refs/heads/${update}`]);
        return new Response(null, { status: 204 });
      } catch {
        return new Response('{}', { status: 404 });
      }
    }
    if (method === 'PATCH' && update !== undefined) {
      try {
        if (record(body)['force'] !== false) return new Response('{}', { status: 422 });
        const old = this.git(['rev-parse', `refs/heads/${update}`]);
        const next = stringField(record(body), 'sha');
        this.git(['merge-base', '--is-ancestor', old, next]);
        this.git(['update-ref', `refs/heads/${update}`, next]);
        return Response.json({ object: { sha: next } });
      } catch {
        return new Response('{}', { status: 422 });
      }
    }
    return new Response('{}', { status: 404 });
  }
  private page(value: unknown, url: URL): Response {
    const page = Number(url.searchParams.get('page') ?? 1);
    const offset = (page - 1) * 100;
    if (Array.isArray(value)) {
      const following = new URL(url);
      following.searchParams.set('page', String(page + 1));
      return Response.json(value.slice(offset, offset + 100), {
        headers:
          offset + 100 < value.length ? { link: `<${following.toString()}>; rel="next"` } : {},
      });
    }
    const object = record(value);
    const entry = Object.entries(object).find(([, v]) => Array.isArray(v));
    if (entry !== undefined) {
      const [name, values] = entry;
      if (!Array.isArray(values)) throw new Error('Fixture platform collection shape');
      const following = new URL(url);
      following.searchParams.set('page', String(page + 1));
      return Response.json(
        { ...object, [name]: values.slice(offset, offset + 100) },
        {
          headers:
            offset + 100 < values.length ? { link: `<${following.toString()}>; rel="next"` } : {},
        },
      );
    }
    return Response.json(value);
  }
}
