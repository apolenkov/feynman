/** Temporary repositories must not inherit pointers to the caller's Git state. */
export function gitFixtureEnvironment(
  environment: Readonly<NodeJS.ProcessEnv> = process.env,
): Readonly<NodeJS.ProcessEnv> {
  return {
    ...Object.fromEntries(Object.entries(environment).filter(([name]) => !name.startsWith('GIT_'))),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
}

/** Mutate the native environment so implicit child processes see the synchronous test scope. */
export function withGitFixtureEnvironment(operation: () => undefined): undefined {
  const original = { ...process.env };
  try {
    for (const name of Object.keys(process.env)) {
      if (name.startsWith('GIT_')) Reflect.deleteProperty(process.env, name);
    }
    Object.assign(process.env, gitFixtureEnvironment(original));
    operation();
    return;
  } finally {
    for (const name of Object.keys(process.env)) {
      if (!Object.hasOwn(original, name)) Reflect.deleteProperty(process.env, name);
    }
    Object.assign(process.env, original);
  }
}
