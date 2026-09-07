const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadEnv, updateEnv } = require('./lib/env');
const Etsy = require('./lib/etsy');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const STATE_PATH = path.join(ROOT, '.oauth-state.json');
const env = loadEnv();
const port = Number(env.PORT || 8787);

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sendRedirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

function publicFile(res, file) {
  const extensions = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  try {
    const data = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': extensions[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch (error) {
    sendJson(res, error.code === 'ENOENT' ? 404 : 500, { ok: false, error: error.message });
  }
}

function saveOauthState(value) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(value), { mode: 0o600 });
}

function loadOauthState() {
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function removeOauthState() {
  try { fs.unlinkSync(STATE_PATH); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function tokenUpdates(tokens) {
  const expiresAt = Date.now() + (Number(tokens.expires_in || 3600) * 1000);
  return {
    ETSY_ACCESS_TOKEN: tokens.access_token,
    ETSY_REFRESH_TOKEN: tokens.refresh_token,
    ETSY_TOKEN_EXPIRES_AT: String(expiresAt),
    ETSY_USER_ID: Etsy.userIdFromAccessToken(tokens.access_token)
  };
}

async function validAccess() {
  let current = loadEnv();
  if (current.ETSY_ACCESS_TOKEN && Number(current.ETSY_TOKEN_EXPIRES_AT || 0) > Date.now() + 60000) return current;
  if (!current.ETSY_REFRESH_TOKEN) throw new Error('Etsy OAuth authorization has not been completed.');
  const tokens = await Etsy.refreshAccessToken({ clientId: current.ETSY_API_KEY, refreshToken: current.ETSY_REFRESH_TOKEN });
  updateEnv(tokenUpdates(tokens));
  current = loadEnv();
  return current;
}

async function identifyShop(current) {
  const creds = Etsy.credentials(current);
  const userId = current.ETSY_USER_ID || Etsy.userIdFromAccessToken(current.ETSY_ACCESS_TOKEN);
  const shop = await Etsy.apiGet(`/users/${encodeURIComponent(userId)}/shops`, {
    accessToken: current.ETSY_ACCESS_TOKEN,
    xApiKey: creds.xApiKey
  });
  updateEnv({ ETSY_USER_ID: userId, ETSY_SHOP_ID: String(shop.shop_id || ''), ETSY_SHOP_NAME: String(shop.shop_name || '') });
  return shop;
}

async function route(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);

  if (req.method === 'GET' && url.pathname === '/api/status') {
    const current = loadEnv();
    return sendJson(res, 200, {
      ok: true,
      appRegistered: Boolean(current.ETSY_API_KEY && current.ETSY_SHARED_SECRET),
      oauthConnected: Boolean(current.ETSY_REFRESH_TOKEN),
      shopConnected: Boolean(current.ETSY_SHOP_ID),
      shopName: current.ETSY_SHOP_NAME || null,
      redirectUri: current.ETSY_REDIRECT_URI || null,
      scopes: Etsy.SCOPES
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/etsy/connect') {
    const current = loadEnv();
    Etsy.credentials(current);
    if (!current.ETSY_REDIRECT_URI || !current.ETSY_REDIRECT_URI.startsWith('https://')) {
      throw new Error('ETSY_REDIRECT_URI must be the exact public HTTPS callback registered with Etsy.');
    }
    const state = crypto.randomBytes(32).toString('hex');
    const pkce = Etsy.createPkce();
    saveOauthState({ state, verifier: pkce.verifier, createdAt: Date.now() });
    return sendRedirect(res, Etsy.buildAuthorizeUrl({
      clientId: current.ETSY_API_KEY,
      redirectUri: current.ETSY_REDIRECT_URI,
      state,
      challenge: pkce.challenge
    }));
  }

  if (req.method === 'GET' && url.pathname === '/oauth/callback') {
    if (url.searchParams.get('error')) throw new Error(url.searchParams.get('error_description') || url.searchParams.get('error'));
    const stored = loadOauthState();
    if (Date.now() - stored.createdAt > 10 * 60 * 1000) throw new Error('OAuth request expired. Start the Etsy connection again.');
    if (!url.searchParams.get('state') || url.searchParams.get('state') !== stored.state) throw new Error('OAuth state did not match.');
    const code = url.searchParams.get('code');
    if (!code) throw new Error('Etsy did not return an authorization code.');
    const current = loadEnv();
    const tokens = await Etsy.exchangeCode({
      clientId: current.ETSY_API_KEY,
      code,
      verifier: stored.verifier,
      redirectUri: current.ETSY_REDIRECT_URI
    });
    updateEnv(tokenUpdates(tokens));
    removeOauthState();
    await identifyShop(loadEnv());
    return sendRedirect(res, '/?connected=1');
  }

  if (req.method === 'GET' && url.pathname === '/api/etsy/test') {
    const current = await validAccess();
    const shop = await identifyShop(current);
    return sendJson(res, 200, {
      ok: true,
      shop: {
        shopId: shop.shop_id,
        name: shop.shop_name,
        title: shop.title,
        currency: shop.currency_code,
        activeListings: shop.listing_active_count
      }
    });
  }

  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  let relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  if (relative.endsWith('/')) relative += 'index.html';
  const file = path.resolve(PUBLIC_DIR, relative);
  if (!file.startsWith(`${PUBLIC_DIR}${path.sep}`)) return sendJson(res, 403, { ok: false, error: 'Forbidden' });
  return publicFile(res, file);
}

const server = http.createServer((req, res) => {
  Promise.resolve(route(req, res)).catch((error) => sendJson(res, 400, { ok: false, error: error.message }));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`StarNet Etsy dashboard: http://127.0.0.1:${port}`);
});
