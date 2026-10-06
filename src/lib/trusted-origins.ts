type Environment = Record<string, string | undefined>;

function normalizeOrigin(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

export function resolveTrustedOrigins(environment: Environment = process.env): string[] {
  const configured = [
    'http://localhost:3000',
    environment.BETTER_AUTH_URL,
    environment.BETTER_AUTH_TRUSTED_ORIGINS,
    environment.DOMAIN,
  ]
    .flatMap((value) => value?.split(',') ?? [])
    .map(normalizeOrigin)
    .filter((value): value is string => Boolean(value));

  return [...new Set(configured)];
}
