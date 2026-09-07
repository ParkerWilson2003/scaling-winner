# StarNet Etsy Dashboard

Private local Etsy shop analytics and OAuth helper. This project uses Etsy Open API v3, OAuth 2.0 Authorization Code flow, PKCE, state validation, and automatic refresh-token exchange.

## Registration values

- Application type: Seller App
- Name: StarNet Etsy Dashboard
- Use: Seller tools for the owner's own shop
- Users: Just myself or colleagues
- Commercial: No
- Capabilities: Read sales data; upload/edit listings can remain disabled for this read-only dashboard
- OAuth scopes: `shops_r listings_r transactions_r`
- Local URL: `http://127.0.0.1:8787`
- Redirect URI: `https://parkerwilson2003.github.io/scaling-winner/oauth/callback/`

## Local setup

1. Add the Etsy keystring, shared secret, and deployed callback URL to `.env`.
2. Run `npm start`.
3. Open `http://127.0.0.1:8787` and choose **Connect Etsy**.
4. After Etsy consent, the public callback forwards the authorization result to the local server. Tokens and the discovered shop ID are written to `.env`.
5. Choose **Test connection** for a read-only shop request.

The `.env` and transient PKCE state file are ignored by Git. Never commit either file.
