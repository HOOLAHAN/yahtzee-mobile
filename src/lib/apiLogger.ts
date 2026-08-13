const sensitiveKey = /token|password|code|email|firstName|lastName|userId|auth/i;
const sanitise = (value: unknown, key = ''): unknown => {
  if (sensitiveKey.test(key)) return '[redacted]';
  if (Array.isArray(value)) return value.map((item) => sanitise(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [entryKey, sanitise(entryValue, entryKey)]));
  return value;
};
const operationName = (query: unknown) => typeof query === 'string' ? query.match(/\b(?:query|mutation)\s+([A-Za-z0-9_]+)/)?.[1] ?? 'GraphQL' : 'GraphQL';

const describeError = (error: unknown) => {
  if (error instanceof Error) return { name: error.name, message: error.message };
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; errors?: Array<{ message?: unknown; errorType?: unknown; path?: unknown }> };
    const errors = value.errors?.map((entry) => ({ message: entry.message, errorType: entry.errorType, path: entry.path }));
    return sanitise({
      message: typeof value.message === 'string'
        ? value.message
        : errors?.map((entry) => entry.message).filter(Boolean).join('; ') || 'GraphQL request failed',
      errors,
    });
  }
  return { message: String(error) };
};

export async function graphqlWithDevLog(client: any, options: any): Promise<any> {
  if (!__DEV__) return client.graphql(options);
  const operation = operationName(options.query); const startedAt = Date.now();
  console.info(`[API →] ${operation}`, { authMode: options.authMode, variables: sanitise(options.variables) });
  try { const result = await client.graphql(options); console.info(`[API ←] ${operation}`, { durationMs: Date.now() - startedAt, errors: 'errors' in result ? result.errors?.map((error: { message?: string }) => error.message) : undefined }); return result; }
  catch (error) { console.error(`[API ✕] ${operation}`, { durationMs: Date.now() - startedAt, ...(describeError(error) as Record<string, unknown>) }); throw error; }
}
