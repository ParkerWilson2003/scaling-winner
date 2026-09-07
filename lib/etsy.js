const crypto = require('node:crypto');

const API_BASE = 'https://api.etsy.com/v3';
const AUTHORIZE_URL = 'https://www.etsy.com/oauth/connect';
const TOKEN_URL = `${API_BASE}/public/oauth/token`;
const SCOPES = ['shops_r', 'listings_r', 'transactions_r'];

function base64Url(buffer) {
  return buffer.toString('base64').replace(/=/gu, '').replace(/\+/gu, '-').replace(/\//gu, '_');
}

function createPkce() {
  const verifier = base64Url(crypto.randomBytes(48));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function buildAuthorizeUrl({ clientId, redirectUri, state, challenge, scopes = SCOPES }) {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  }).toString();
  return url.toString();
}

function credentials(env) {
  if (!env.ETSY_API_KEY || !env.ETSY_SHARED_SECRET) {
    throw new Error('Etsy API key and shared secret are not configured yet.');
  }
  return {
    apiKey: env.ETSY_API_KEY,
    sharedSecret: env.ETSY_SHARED_SECRET,
    xApiKey: `${env.ETSY_API_KEY}:${env.ETSY_SHARED_SECRET}`
  };
}

async function parseResponse(response) {
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { raw: text }; }
  if (!response.ok) {
    const detail = body.error_description || body.error || body.message || `HTTP ${response.status}`;
    throw new Error(`Etsy request failed: ${detail}`);
  }
  return body;
}

async function exchangeCode({ clientId, code, verifier, redirectUri, fetchImpl = fetch }) {
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier
    })
  });
  return parseResponse(response);
}

async function refreshAccessToken({ clientId, refreshToken, fetchImpl = fetch }) {
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken
    })
  });
  return parseResponse(response);
}

async function apiGet(path, { accessToken, xApiKey, fetchImpl = fetch }) {
  const headers = { Accept: 'application/json', 'x-api-key': xApiKey };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return parseResponse(await fetchImpl(`${API_BASE}/application${path}`, { headers }));
}

function userIdFromAccessToken(accessToken) {
  const match = String(accessToken || '').match(/^(\d+)\./u);
  if (!match) throw new Error('Etsy access token did not contain the expected user ID prefix.');
  return match[1];
}

module.exports = {
  SCOPES,
  apiGet,
  buildAuthorizeUrl,
  createPkce,
  credentials,
  exchangeCode,
  refreshAccessToken,
  userIdFromAccessToken
};
