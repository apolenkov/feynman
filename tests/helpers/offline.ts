const offlineCodes = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EADDRNOTAVAIL',
  'UND_ERR_CONNECT_TIMEOUT',
]);

function isOfflineError(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);
    if ('name' in current && (current.name === 'TimeoutError' || current.name === 'AbortError'))
      return true;
    if ('code' in current && typeof current.code === 'string' && offlineCodes.has(current.code))
      return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

export function shouldSkipActionlintDownload(error: unknown, env: NodeJS.ProcessEnv): boolean {
  const ci = env['CI']?.trim().toLowerCase() ?? '';
  return (ci === '' || ci === 'false' || ci === '0') && isOfflineError(error);
}
