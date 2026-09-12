// Test-only JWT builder for the Playwright harness.
//
// Duplicated from src/test/token.ts rather than imported: e2e/ compiles under its own tsconfig
// with no `@/` alias, and Playwright resolves nothing through Vite.
//
// Only the payload segment matters. Nothing on the client verifies the signature — the server is
// the authority — so the third segment is a placeholder.
const base64url = (value: object): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const tokenExpiringIn = (seconds: number, claims: Record<string, unknown> = {}): string =>
  [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({ sub: 'contact:1', exp: Math.floor(Date.now() / 1000) + seconds, ...claims }),
    'test-signature',
  ].join('.');
