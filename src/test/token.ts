// Test-only JWT builder.
//
// The app reads `exp` out of the token to decide when to renew and whether a stored session is
// still live, so tests need tokens whose expiry they control. Only the payload segment matters:
// nothing on the client verifies the signature (the server is the authority on that), so the
// third segment is a placeholder.

// UTF-8 bytes -> base64 -> base64url, the way a real JWT is built. Plain btoa would throw on a
// claim in a non-Latin script, which is exactly one of the cases the decoder has to survive.
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
