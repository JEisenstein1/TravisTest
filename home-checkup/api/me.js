/* Who is signed in — used by the app to show the account / sign-out link. */
'use strict';
const { parseCookies, verify } = require('./_lib/session.js');

module.exports = async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const session = verify(process.env.SESSION_SECRET, cookies.hc_session);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (!session) { res.statusCode = 401; return res.end(JSON.stringify({ authenticated: false })); }
  res.end(JSON.stringify({ authenticated: true, email: session.email, name: session.name || '' }));
};
