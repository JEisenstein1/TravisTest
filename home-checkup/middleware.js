/* Vercel Edge Middleware — gates every route except the auth endpoints.
   Verifies the signed session cookie (same format the Node functions issue)
   with Web Crypto, and redirects unauthenticated requests to Google sign-in.

   matcher lets /api/* through (the functions guard themselves), so this
   protects the app HTML, JS, calibration data and every other asset. */
export const config = { matcher: ['/((?!api/).*)'] };

const enc = new TextEncoder();

function b64urlToBytes(b64) {
  b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function verify(secret, token) {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  if (bytesToB64url(mac) !== sig) return null;
  try {
    const obj = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch (e) { return null; }
}

function getCookie(req, name) {
  const header = req.headers.get('cookie') || '';
  for (const p of header.split(/; */)) {
    const i = p.indexOf('=');
    if (i > 0 && decodeURIComponent(p.slice(0, i)) === name) return decodeURIComponent(p.slice(i + 1));
  }
  return null;
}

export default async function middleware(req) {
  const secret = process.env.SESSION_SECRET;
  const session = secret ? await verify(secret, getCookie(req, 'hc_session')) : null;
  if (session) return; // authenticated — continue to the asset

  const url = new URL(req.url);
  const login = new URL('/api/auth/login', url.origin);
  login.searchParams.set('returnTo', url.pathname + url.search);
  return Response.redirect(login, 302);
}
