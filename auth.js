var crypto = require('crypto');

function sign(payload) {
  var data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  var mac = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(data).digest('base64url');
  return data + '.' + mac;
}

function verify(token) {
  try {
    var parts = String(token || '').split('.');
    if (parts.length !== 2) return null;
    var mac = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(parts[0]).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(parts[1]))) return null;
    var payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (!payload || !Number.isSafeInteger(payload.exp) || payload.exp <= Date.now() ||
        !['login', 'sess'].includes(payload.k) || typeof payload.c !== 'string' ||
        !/^[1-9][0-9]{0,18}$/.test(payload.c)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// Ondertekende login link (15 min geldig) die de bot stuurt.
function loginLink(chatId) {
  return require('./origin')() + '/login?t=' + sign({ c: String(chatId), exp: Date.now() + 15 * 60 * 1000, k: 'login' });
}

function sessionToken(chatId) {
  return sign({ c: String(chatId), exp: Date.now() + 30 * 24 * 60 * 60 * 1000, k: 'sess' });
}

function readCookie(req, name) {
  var raw = req.headers.cookie || '';
  var parts = raw.split(';');
  for (var i = 0; i < parts.length; i++) {
    var kv = parts[i].trim().split('=');
    if (kv[0] === name) {
      try { return decodeURIComponent(kv.slice(1).join('=')); } catch (e) { return null; }
    }
  }
  return null;
}

function requireUser(req, res, next) {
  var p = verify(readCookie(req, 'fsa'));
  if (!p || p.k !== 'sess') return res.status(401).json({ error: 'Niet ingelogd' });
  req.chatId = p.c;
  next();
}

module.exports = { sign: sign, verify: verify, loginLink: loginLink, sessionToken: sessionToken, requireUser: requireUser };
