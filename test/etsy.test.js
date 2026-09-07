const test = require('node:test');
const assert = require('node:assert/strict');
const Etsy = require('../lib/etsy');
const { parseEnv } = require('../lib/env');

test('PKCE verifier and challenge use URL-safe characters', () => {
  const pkce = Etsy.createPkce();
  assert.match(pkce.verifier, /^[A-Za-z0-9_-]{43,128}$/u);
  assert.match(pkce.challenge, /^[A-Za-z0-9_-]+$/u);
});

test('authorization URL contains exact redirect and read-only scopes', () => {
  const result = new URL(Etsy.buildAuthorizeUrl({
    clientId: 'abc',
    redirectUri: 'https://example.test/oauth/callback/',
    state: 'state',
    challenge: 'challenge'
  }));
  assert.equal(result.searchParams.get('redirect_uri'), 'https://example.test/oauth/callback/');
  assert.equal(result.searchParams.get('scope'), 'shops_r listings_r transactions_r');
  assert.equal(result.searchParams.get('code_challenge_method'), 'S256');
});

test('access token exposes Etsy user id prefix', () => {
  assert.equal(Etsy.userIdFromAccessToken('12345.token-value'), '12345');
});

test('env parser preserves values containing equals signs', () => {
  assert.deepEqual(parseEnv('TOKEN=abc==\nPORT=8787\n'), { TOKEN: 'abc==', PORT: '8787' });
});
