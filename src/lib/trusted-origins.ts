type Environment = Record<string, string | undefined>;

function normalizeOrigin(value: string): string | undefined {
  let candidate = value.trim();
  if (!candidate) return undefined;

  const protocol = candidate.match(/^(https?):\/\//i)?.[1]?.toLowerCase();
  if (protocol) {
    const remainder = candidate.slice(protocol.length + 3);
    if (remainder.toLowerCase().startsWith(`${protocol}://`)) candidate = remainder;
  }

  try {
    const url = candidate.includes('://') ? new URL(candidate) : new URL(`https://${candidate}`);
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

export function resolveAuthBaseURL(environment: Environment = process.env): string | undefined {
  return resolveTrustedOrigins(environment).find((origin) => origin !== 'http://localhost:3000');
}
