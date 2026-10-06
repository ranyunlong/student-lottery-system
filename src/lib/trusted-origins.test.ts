import { expect, test } from 'vitest';
import { resolveTrustedOrigins } from './trusted-origins';

test('normalizes trusted auth origins from deployment environment variables', () => {
  expect(resolveTrustedOrigins({
    BETTER_AUTH_URL: 'https://luck.geckoai.cn',
    DOMAIN: 'luck.geckoai.cn',
  })).toEqual(['http://localhost:3000', 'https://luck.geckoai.cn']);

  expect(resolveTrustedOrigins({
    DOMAIN: 'https://luck.geckoai.cn',
  })).toEqual(['http://localhost:3000', 'https://luck.geckoai.cn']);

  expect(resolveTrustedOrigins({
    BETTER_AUTH_TRUSTED_ORIGINS: 'https://a.example.com, http://b.example.com:3000',
    DOMAIN: 'not a domain',
  })).toEqual(['http://localhost:3000', 'https://a.example.com', 'http://b.example.com:3000']);
});
