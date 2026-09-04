import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export type MutationKind =
  | 'let'
  | 'var'
  | 'assignment'
  | 'update'
  | 'delete'
  | 'array-mutator'
  | 'map-mutator'
  | 'set-mutator'
  | 'map-or-set-mutator'
  | 'builder-mutator'
  | 'process-exit-code';

export interface MutationCandidate {
  readonly file: string;
  readonly owner: string;
  readonly kind: MutationKind;
  readonly fingerprint: string;
  readonly normalizedText: string;
  readonly line: number;
}

export interface MutationSummary {
  readonly file: string;
  readonly owner: string;
  readonly mutationHash: string;
  readonly count: number;
  readonly mutations: readonly Pick<
    MutationCandidate,
    'kind' | 'fingerprint' | 'normalizedText' | 'line'
  >[];
}

interface MutationPermission {
  readonly file: string;
  readonly owner: string;
  readonly mutationHash: string;
  readonly count: number;
  readonly reason: string;
  readonly test: string;
}

const ARRAY_MUTATORS = new Set([
  'copyWithin',
  'fill',
  'pop',
  'push',
  'reverse',
  'shift',
  'sort',
  'splice',
  'unshift',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function propertyNameText(name: ts.PropertyName | undefined): string | undefined {
  if (name === undefined) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function declaredFunctionName(node: ts.Node): string | undefined {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    const directName = propertyNameText(node.name);
    if (directName !== undefined) return directName;
  }
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
      return node.parent.name.text;
    }
    if (ts.isPropertyAssignment(node.parent)) return propertyNameText(node.parent.name);
  }
  return undefined;
}

function calledMethod(node: ts.CallExpression): string | undefined {
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  if (
    ts.isElementAccessExpression(node.expression) &&
    (ts.isStringLiteral(node.expression.argumentExpression) ||
      ts.isNoSubstitutionTemplateLiteral(node.expression.argumentExpression))
  ) {
    return node.expression.argumentExpression.text;
  }
  return undefined;
}

function mutatorKind(method: string): MutationKind | undefined {
  if (ARRAY_MUTATORS.has(method)) return 'array-mutator';
  if (method === 'set') return 'map-mutator';
  if (method === 'add') return 'set-mutator';
  if (method === 'delete' || method === 'clear') return 'map-or-set-mutator';
  if (method === 'update') return 'builder-mutator';
  return undefined;
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function isProcessExitCode(node: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process' &&
    node.name.text === 'exitCode'
  );
}

export function scanSource(file: string, text: string): readonly MutationCandidate[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const printer = ts.createPrinter({ removeComments: true });
  const found: MutationCandidate[] = [];

  function record(node: ts.Node, owner: string, kind: MutationKind): void {
    const normalizedText = printer.printNode(ts.EmitHint.Unspecified, node, source).trim();
    found.push({
      file: file.replaceAll(path.sep, '/'),
      owner,
      kind,
      fingerprint: crypto.createHash('sha256').update(`${kind}\0${normalizedText}`).digest('hex'),
      normalizedText,
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    });
  }

  function visit(node: ts.Node, inheritedOwner: string): void {
    const owner = declaredFunctionName(node) ?? inheritedOwner;
    if (ts.isVariableDeclarationList(node)) {
      const kind =
        (node.flags & ts.NodeFlags.Let) !== 0
          ? 'let'
          : (node.flags & ts.NodeFlags.Const) === 0
            ? 'var'
            : undefined;
      if (kind !== undefined)
        for (const declaration of node.declarations) record(declaration, owner, kind);
    } else if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) {
      record(node, owner, isProcessExitCode(node.left) ? 'process-exit-code' : 'assignment');
    } else if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      record(node, owner, 'update');
    } else if (ts.isDeleteExpression(node)) {
      record(node, owner, 'delete');
    } else if (ts.isCallExpression(node)) {
      const method = calledMethod(node);
      const kind = method === undefined ? undefined : mutatorKind(method);
      if (kind !== undefined) record(node, owner, kind);
    }
    ts.forEachChild(node, (child) => {
      visit(child, owner);
    });
  }

  visit(source, '<module>');
  return found;
}

function ownerKey(value: Readonly<{ file: string; owner: string }>): string {
  return `${value.file}\0${value.owner}`;
}

export function summarizeMutations(
  candidates: readonly MutationCandidate[],
): readonly MutationSummary[] {
  const grouped = new Map<string, MutationCandidate[]>();
  for (const candidate of candidates) {
    const key = ownerKey(candidate);
    const group = grouped.get(key);
    if (group === undefined) grouped.set(key, [candidate]);
    else group.push(candidate);
  }
  return [...grouped.values()].map((mutations) => {
    const first = mutations[0];
    if (first === undefined) throw new Error('mutation group cannot be empty');
    return {
      file: first.file,
      owner: first.owner,
      mutationHash: crypto
        .createHash('sha256')
        .update(mutations.map((mutation) => `${mutation.kind}\0${mutation.fingerprint}`).join('\0'))
        .digest('hex'),
      count: mutations.length,
      mutations: mutations.map(({ kind, fingerprint, normalizedText, line }) => ({
        kind,
        fingerprint,
        normalizedText,
        line,
      })),
    };
  });
}

function permissionFromUnknown(value: unknown, index: number): MutationPermission | string {
  if (!isRecord(value)) return `permissions[${index}] must be an object`;
  const file = value['file'];
  const owner = value['owner'];
  const mutationHash = value['mutationHash'];
  const count = value['count'];
  const reason = value['reason'];
  const test = value['test'];
  const strings = { file, owner, mutationHash, reason, test };
  for (const [field, fieldValue] of Object.entries(strings)) {
    if (typeof fieldValue !== 'string' || fieldValue.trim().length === 0) {
      return `permissions[${index}].${field} must be a nonempty string`;
    }
  }
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
    return `permissions[${index}].count must be a positive integer`;
  }
  if (
    typeof file !== 'string' ||
    typeof owner !== 'string' ||
    typeof mutationHash !== 'string' ||
    typeof reason !== 'string' ||
    typeof test !== 'string'
  )
    return `permissions[${index}] contains invalid strings`;
  return {
    file,
    owner,
    mutationHash,
    count,
    reason,
    test,
  };
}

function permissionTestIssue(repositoryRoot: string, testPath: string): string | undefined {
  if (path.isAbsolute(testPath)) return `permission test must be repo-relative: ${testPath}`;
  const testsRoot = path.resolve(repositoryRoot, 'tests');
  const resolved = path.resolve(repositoryRoot, testPath);
  const relative = path.relative(testsRoot, resolved);
  if (relative.length === 0 || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return `permission test must be inside tests/: ${testPath}`;
  }
  try {
    const realTestsRoot = fs.realpathSync(testsRoot);
    const realTest = fs.realpathSync(resolved);
    const realRelative = path.relative(realTestsRoot, realTest);
    if (
      realRelative.length === 0 ||
      realRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(realRelative)
    ) {
      return `permission test must resolve inside tests/: ${testPath}`;
    }
    if (!fs.statSync(realTest).isFile())
      return `permission test must be a regular file: ${testPath}`;
  } catch {
    return `permission test does not exist: ${testPath}`;
  }
  return undefined;
}

export function validateMutationPolicy(
  candidates: readonly MutationCandidate[],
  policy: unknown,
  repositoryRoot: string,
): readonly string[] {
  if (!isRecord(policy) || !Array.isArray(policy['permissions'])) {
    return ['policy.permissions must be an array'];
  }
  const parsed = policy['permissions'].map(permissionFromUnknown);
  const schemaErrors = parsed.filter((entry): entry is string => typeof entry === 'string');
  if (schemaErrors.length > 0) return schemaErrors;
  const permissions = parsed.filter(
    (entry): entry is MutationPermission => typeof entry !== 'string',
  );
  const summaries = summarizeMutations(candidates);
  const summariesByOwner = new Map(summaries.map((summary) => [ownerKey(summary), summary]));
  const permissionKeys = new Set(permissions.map(ownerKey));
  const duplicateKeys = permissions
    .map(ownerKey)
    .filter((key, index, keys) => keys.indexOf(key) !== index)
    .map((key) => `duplicate owner permission: ${key}`);
  const unexpected = summaries
    .filter((summary) => !permissionKeys.has(ownerKey(summary)))
    .map(
      (summary) =>
        `unexpected mutation owner: ${summary.file} ${summary.owner}; actual ${summary.mutationHash}/${summary.count}; lines ${summary.mutations.map((mutation) => mutation.line).join(',')}`,
    );
  const invalidExitCodes = candidates
    .filter(
      (candidate) =>
        candidate.kind === 'process-exit-code' &&
        (candidate.file.startsWith('lib/') || !/main$/i.test(candidate.owner)),
    )
    .map(
      (candidate) =>
        `process.exitCode is restricted to a named main boundary outside lib: ${candidate.file}:${candidate.line}`,
    );
  const permissionErrors = permissions.flatMap((permission) => {
    const errors: string[] = [];
    const actual = summariesByOwner.get(ownerKey(permission));
    if (actual?.count !== permission.count || actual.mutationHash !== permission.mutationHash) {
      errors.push(
        `unused or changed owner permission: ${permission.file} ${permission.owner}; expected ${permission.mutationHash}/${permission.count}, actual ${actual?.mutationHash ?? '<none>'}/${actual?.count ?? 0}; lines ${actual?.mutations.map((mutation) => mutation.line).join(',') ?? '<none>'}`,
      );
    }
    const testIssue = permissionTestIssue(repositoryRoot, permission.test);
    if (testIssue !== undefined) errors.push(testIssue);
    return errors;
  });
  return [
    ...schemaErrors,
    ...duplicateKeys,
    ...unexpected,
    ...invalidExitCodes,
    ...permissionErrors,
  ];
}
