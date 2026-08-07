const sensitiveKey = /token|password|code|email|firstName|lastName|userId|auth/i;
const sanitise = (value: unknown, key = ''): unknown => {
  if (sensitiveKey.test(key)) return '[redacted]';
  if (Array.isArray(value)) return value.map((item) => sanitise(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [entryKey, sanitise(entryValue, entryKey)]));
  return value;
};
const operationName = (query: unknown) => typeof query === 'string' ? query.match(/\b(?:query|mutation)\s+([A-Za-z0-9_]+)/)?.[1] ?? 'GraphQL' : 'GraphQL';
export async function graphqlWithDevLog(client: any, options: any): Promise<any> {
  if (!__DEV__) return client.graphql(options);
  const operation = operationName(options.query); const startedAt = Date.now();
  console.info(`[API →] ${operation}`, { authMode: options.authMode, variables: sanitise(options.variables) });
  try { const result = await client.graphql(options); console.info(`[API ←] ${operation}`, { durationMs: Date.now() - startedAt, errors: 'errors' in result ? result.errors?.map((error: { message?: string }) => error.message) : undefined }); return result; }
  catch (error) { console.error(`[API ✕] ${operation}`, { durationMs: Date.now() - startedAt, message: error instanceof Error ? error.message : String(error) }); throw error; }
}
