/* Google OAuth callback: verify state, exchange the code, check the email
   against ALLOWED_EMAILS, then set a signed session cookie. */
'use strict';
const { cookie, parseCookies, sign, baseUrl, safePath } = require('../_lib/session.js');

function decodeJwtPayload(jwt) {
  const part = String(jwt).split('.')[1];
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function page(res, status, html) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">'
    + '<body style="font-family:system-ui,sans-serif;padding:40px 24px;max-width:440px;margin:auto;text-align:center;color:#101828">'
    + html + '</body>');
}

module.exports = async (req, res) => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET } = process.env;
  const allow = String(process.env.ALLOWED_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SESSION_SECRET) {
    return page(res, 500, '<h2>Not configured</h2><p>Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SESSION_SECRET.</p>');
  }

  const base = baseUrl(req);
  const url = new URL(req.url, base);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookies = parseCookies(req.headers.cookie);

  if (!code || !state || !cookies.hc_state || state !== cookies.hc_state) {
    return page(res, 400, '<h2>Sign-in failed</h2><p>Invalid or expired request. <a href="/api/auth/login">Try again</a>.</p>');
  }

  let tok;
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: base + '/api/auth/callback',
        grant_type: 'authorization_code',
      }),
    });
    tok = await r.json();
    if (!r.ok) throw new Error(tok.error_description || tok.error || 'token exchange failed');
  } catch (e) {
    return page(res, 502, '<h2>Sign-in failed</h2><p>Google token exchange failed.</p>');
  }

  let claims;
  try { claims = decodeJwtPayload(tok.id_token); }
  catch (e) { return page(res, 502, '<h2>Sign-in failed</h2><p>Malformed token from Google.</p>'); }

  const email = String(claims.email || '').toLowerCase();
  if (!claims.email_verified || !email) {
    return page(res, 403, '<h2>Access denied</h2><p>Your Google account has no verified email.</p>');
  }
  if (allow.length === 0) {
    return page(res, 403, '<h2>Access not configured</h2><p>Set <code>ALLOWED_EMAILS</code> to permit sign-in.</p>');
  }
  if (!allow.includes(email)) {
    return page(res, 403, `<h2>Access denied</h2><p><b>${email}</b> is not on the allow list.</p>`
      + '<p><a href="/api/auth/logout">Use a different account</a></p>');
  }

  const session = sign(SESSION_SECRET, {
    email, name: claims.name || '', exp: Date.now() + 7 * 24 * 3600 * 1000,
  });
  res.setHeader('Set-Cookie', [
    cookie('hc_session', session, { maxAge: 7 * 24 * 3600 }),
    cookie('hc_state', '', { expire: true }),
    cookie('hc_returnto', '', { expire: true }),
  ]);
  res.statusCode = 302;
  res.setHeader('Location', safePath(cookies.hc_returnto));
  res.end();
};
