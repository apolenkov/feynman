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

/** Synchronous test scope: default adapters read process.env without an injection point. */
export function withGitFixtureEnvironment(operation: () => undefined): undefined {
  const original = process.env;
  process.env = { ...gitFixtureEnvironment(original) };
  try {
    operation();
    return;
  } finally {
    process.env = original;
  }
}
