/* Shared session helpers for the Vercel Node serverless functions.
   The session cookie is a signed token:  base64url(JSON payload).HMAC-SHA256
   The Edge middleware verifies the same format with Web Crypto — keep the two
   in sync (HMAC-SHA256 over the base64url payload, base64url digest). */
'use strict';
const crypto = require('crypto');

function sign(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + sig;
}

function verify(secret, token) {
  if (!secret || !token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  const expect = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let obj;
  try { obj = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
  catch (e) { return null; }
  if (obj.exp && Date.now() > obj.exp) return null;
  return obj;
}

function parseCookies(header) {
  const out = {};
  (header || '').split(/; */).forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1));
  });
  return out;
}

function cookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (opts.expire) parts.push('Max-Age=0');
  else if (opts.maxAge != null) parts.push('Max-Age=' + opts.maxAge);
  return parts.join('; ');
}

function baseUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// only allow same-site absolute paths as a post-login redirect target
function safePath(p) {
  if (!p || typeof p !== 'string' || p[0] !== '/' || p.startsWith('//')) return '/';
  return p;
}

module.exports = { sign, verify, parseCookies, cookie, baseUrl, safePath };
