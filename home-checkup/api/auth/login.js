/* Start the Google OAuth flow: set a state cookie, redirect to Google. */
'use strict';
const crypto = require('crypto');
const { cookie, baseUrl, safePath } = require('../_lib/session.js');

module.exports = async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) { res.statusCode = 500; return res.end('GOOGLE_CLIENT_ID is not set'); }

  const base = baseUrl(req);
  const url = new URL(req.url, base);
  const returnTo = safePath(url.searchParams.get('returnTo'));
  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: base + '/api/auth/callback',
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });

  res.setHeader('Set-Cookie', [
    cookie('hc_state', state, { maxAge: 600 }),
    cookie('hc_returnto', returnTo, { maxAge: 600 }),
  ]);
  res.statusCode = 302;
  res.setHeader('Location', 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
  res.end();
};
