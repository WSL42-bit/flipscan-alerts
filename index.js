var express = require('express');
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var db = require('./db');
var tg = require('./telegram');
var auth = require('./auth');
var worker = require('./worker');
var livefeed = require('./livefeed');
var growth = require('./growth');
var video = require('./video');
var config = require('./config');
var TIERS = config.TIERS;
var PLANS = config.PLANS;

var stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
var BOT = process.env.TELEGRAM_BOT_USERNAME || 'FlipScanAlertsBot';
var TG_SECRET = crypto.createHash('sha256').update(String(process.env.TELEGRAM_BOT_TOKEN)).digest('hex').slice(0, 32);
var app = express();

// Stripe webhook heeft de raw body nodig, dus voor express.json()
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async function (req, res) {
  var event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send('Webhook fout: ' + e.message);
  }
  try {
    var o = event.data.object;
    if (event.type === 'checkout.session.completed') {
      var interval = o.metadata && o.metadata.interval === 'month' ? 'month' : 'week';
      await db.pool.query(
        'UPDATE alert_users SET tier=$1, plan_interval=$2, stripe_customer_id=$3, stripe_subscription_id=$4 WHERE chat_id=$5',
        ['pro', interval, o.customer, o.subscription, o.client_reference_id]
      );
      await db.pool.query('UPDATE alert_searches SET active=TRUE WHERE chat_id=$1', [o.client_reference_id]);
      await tg.sendMessage(o.client_reference_id, '🎉 Je abonnement is actief' +
        (o.metadata && o.metadata.trial === '1' ? ' (eerste ' + config.TRIAL_DAYS + ' dagen gratis)' : '') +
        '. Stel nu je zoekopdrachten in, je kan er ' + TIERS.pro.maxSearches + ' maken.' +
        (interval === 'week' ? '\n\n💡 Tip: per week betaal je omgerekend €21,62 per maand. Met het maandabonnement is dat €14,99, je bespaart €6,63 per maand. Wisselen kan met één klik in je dashboard.' : ''),
        loginButton(o.client_reference_id));
    }
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      var active = o.status === 'active' || o.status === 'trialing';
      var priceId = o.items && o.items.data[0] ? o.items.data[0].price.id : null;
      var newTier = active ? 'pro' : 'free';
      var newInterval = priceId === process.env.STRIPE_PRICE_MONTHLY ? 'month' : 'week';
      var r = await db.pool.query(
        'UPDATE alert_users SET tier=$1, plan_interval=$2 WHERE stripe_customer_id=$3 RETURNING chat_id',
        [newTier, active ? newInterval : null, o.customer]
      );
      if (newTier === 'free' && r.rows[0]) {
        await tg.sendMessage(r.rows[0].chat_id, 'Je abonnement is gestopt, meldingen staan uit. Je zoekopdrachten blijven bewaard.', loginButton(r.rows[0].chat_id));
      }
    }
  } catch (e) {
    console.error('Stripe webhook verwerking:', e.message);
  }
  res.json({ received: true });
});

app.use(express.json());

// Publieke pagina's (zelfde rendering als de Netlify build)
var render = require('./render');
app.use('/assets', express.static(path.join(render.PUB, 'assets'), {
  setHeaders: function (res, file) { res.set('Cache-Control', 'public, max-age=300'); }
}));
app.use('/img', express.static(path.join(render.PUB, 'img'), { maxAge: '1d' }));
render.PAGES.forEach(function (p) {
  if (p.url === '/404') return;
  app.get(p.url, function (req, res) { res.type('html').send(render.renderPage(p)); });
});
app.get('/dashboard', function (req, res) { res.type('html').send(render.renderDashboard()); });
app.get('/sitemap.xml', function (req, res) { res.type('application/xml').send(render.sitemap()); });
app.get('/robots.txt', function (req, res) { res.type('text/plain').send(render.robots()); });


app.get('/login', function (req, res) {
  var p = auth.verify(req.query.t);
  if (!p || p.k !== 'login') return res.status(401).send('Link verlopen. Stuur /login naar de bot voor een nieuwe.');
  res.setHeader('Set-Cookie', 'fsa=' + auth.sessionToken(p.c) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000');
  res.redirect('/dashboard');
});

app.post('/logout', function (req, res) {
  res.setHeader('Set-Cookie', 'fsa=; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// ---------- API ----------
app.get('/api/me', auth.requireUser, async function (req, res) {
  var u = await db.pool.query('SELECT chat_id, username, first_name, tier, plan_interval, paused, stripe_customer_id FROM alert_users WHERE chat_id=$1', [req.chatId]);
  if (!u.rows[0]) return res.status(404).json({ error: 'Gebruiker niet gevonden' });
  var user = u.rows[0];
  res.json({ user: user, tier: TIERS[user.tier], plans: PLANS, trialDays: config.TRIAL_DAYS, trialAvailable: !user.stripe_customer_id, hasBilling: !!user.stripe_customer_id });
});

app.get('/api/searches', auth.requireUser, async function (req, res) {
  var r = await db.pool.query('SELECT id, query, platforms, min_price, max_price, active, last_checked_at FROM alert_searches WHERE chat_id=$1 ORDER BY created_at', [req.chatId]);
  res.json(r.rows);
});

function cleanSearch(b, tier) {
  var q = String(b.query || '').trim().slice(0, 80);
  if (q.length < 2) return { error: 'Vul een zoekterm in' };
  var platforms = (Array.isArray(b.platforms) ? b.platforms : []).filter(function (p) { return config.ALL_PLATFORMS.indexOf(p) !== -1; });
  if (!platforms.length) return { error: 'Kies minimaal één platform' };
  var locked = platforms.filter(function (p) { return TIERS[tier].platforms.indexOf(p) === -1; });
  if (locked.length) return { error: 'Platform niet beschikbaar' };
  var min = b.min_price ? Math.max(0, parseInt(b.min_price, 10)) : null;
  var max = b.max_price ? Math.max(0, parseInt(b.max_price, 10)) : null;
  return { query: q, platforms: platforms, min: isNaN(min) ? null : min, max: isNaN(max) ? null : max };
}

app.post('/api/searches', auth.requireUser, async function (req, res) {
  try {
    var u = (await db.pool.query('SELECT tier FROM alert_users WHERE chat_id=$1', [req.chatId])).rows[0];
    var c = cleanSearch(req.body, u.tier);
    if (c.error) return res.status(400).json({ error: c.error });
    var count = (await db.pool.query('SELECT COUNT(*)::int AS n FROM alert_searches WHERE chat_id=$1 AND active=TRUE', [req.chatId])).rows[0].n;
    if (u.tier !== 'pro') return res.status(403).json({ error: 'Start eerst je abonnement (' + config.TRIAL_DAYS + ' dagen gratis) om meldingen te krijgen.' });
    if (count >= TIERS.pro.maxSearches) return res.status(403).json({ error: 'Maximum van ' + TIERS.pro.maxSearches + ' zoekopdrachten bereikt.' });
    var r = await db.pool.query(
      'INSERT INTO alert_searches (chat_id, query, platforms, min_price, max_price) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.chatId, c.query, c.platforms, c.min, c.max]
    );
    res.json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Er ging iets mis' });
  }
});

app.patch('/api/searches/:id', auth.requireUser, async function (req, res) {
  try {
    var u = (await db.pool.query('SELECT tier FROM alert_users WHERE chat_id=$1', [req.chatId])).rows[0];
    if (req.body.active === true) {
      var count = (await db.pool.query('SELECT COUNT(*)::int AS n FROM alert_searches WHERE chat_id=$1 AND active=TRUE', [req.chatId])).rows[0].n;
      if (u.tier !== 'pro') return res.status(403).json({ error: 'Start eerst je abonnement.' });
      if (count >= TIERS.pro.maxSearches) return res.status(403).json({ error: 'Maximum bereikt.' });
      await db.pool.query('UPDATE alert_searches SET active=TRUE WHERE id=$1 AND chat_id=$2', [req.params.id, req.chatId]);
      return res.json({ ok: true });
    }
    if (req.body.active === false) {
      await db.pool.query('UPDATE alert_searches SET active=FALSE WHERE id=$1 AND chat_id=$2', [req.params.id, req.chatId]);
      return res.json({ ok: true });
    }
    var c = cleanSearch(req.body, u.tier);
    if (c.error) return res.status(400).json({ error: c.error });
    await db.pool.query(
      'UPDATE alert_searches SET query=$1, platforms=$2, min_price=$3, max_price=$4, seeded=FALSE WHERE id=$5 AND chat_id=$6',
      [c.query, c.platforms, c.min, c.max, req.params.id, req.chatId]
    );
    await db.pool.query('DELETE FROM alert_seen WHERE search_id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Er ging iets mis' });
  }
});

app.delete('/api/searches/:id', auth.requireUser, async function (req, res) {
  await db.pool.query('DELETE FROM alert_searches WHERE id=$1 AND chat_id=$2', [req.params.id, req.chatId]);
  res.json({ ok: true });
});

app.post('/api/pause', auth.requireUser, async function (req, res) {
  await db.pool.query('UPDATE alert_users SET paused=$1 WHERE chat_id=$2', [!!req.body.paused, req.chatId]);
  res.json({ ok: true });
});

app.post('/api/checkout', auth.requireUser, async function (req, res) {
  try {
    if (!stripe) return res.status(500).json({ error: 'Betalingen nog niet ingesteld' });
    var interval = req.body.interval === 'month' ? 'month' : 'week';
    var price = process.env[PLANS[interval].envKey];
    var u = (await db.pool.query('SELECT stripe_customer_id, stripe_subscription_id, tier FROM alert_users WHERE chat_id=$1', [req.chatId])).rows[0];

    // Al actief? Dan direct wisselen tussen week en maand
    if (u.stripe_subscription_id && u.tier === 'pro') {
      var sub = await stripe.subscriptions.retrieve(u.stripe_subscription_id);
      await stripe.subscriptions.update(sub.id, {
        items: [{ id: sub.items.data[0].id, price: price }],
        proration_behavior: 'create_prorations'
      });
      await db.pool.query('UPDATE alert_users SET plan_interval=$1 WHERE chat_id=$2', [interval, req.chatId]);
      return res.json({ url: '/dashboard?upgraded=1' });
    }

    // Proefperiode alleen voor wie nog nooit een abonnement had
    var trial = !u.stripe_customer_id;

    var params = {
      mode: 'subscription',
      line_items: [{ price: price, quantity: 1 }],
      client_reference_id: String(req.chatId),
      payment_method_collection: 'always',
      metadata: { interval: interval, trial: trial ? '1' : '0' },
      subscription_data: trial
        ? { trial_period_days: config.TRIAL_DAYS, metadata: { chat_id: String(req.chatId) } }
        : { metadata: { chat_id: String(req.chatId) } },
      allow_promotion_codes: true,
      success_url: process.env.BASE_URL + '/dashboard?upgraded=1',
      cancel_url: process.env.BASE_URL + '/dashboard'
    };
    if (u.stripe_customer_id) params.customer = u.stripe_customer_id;
    var session = await stripe.checkout.sessions.create(params);
    res.json({ url: session.url });
  } catch (e) {
    console.error('checkout:', e.message);
    res.status(500).json({ error: 'Kon betaling niet starten' });
  }
});

app.post('/api/portal', auth.requireUser, async function (req, res) {
  try {
    var u = (await db.pool.query('SELECT stripe_customer_id FROM alert_users WHERE chat_id=$1', [req.chatId])).rows[0];
    if (!u.stripe_customer_id) return res.status(400).json({ error: 'Geen abonnement' });
    var s = await stripe.billingPortal.sessions.create({ customer: u.stripe_customer_id, return_url: process.env.BASE_URL + '/dashboard' });
    res.json({ url: s.url });
  } catch (e) {
    res.status(500).json({ error: 'Kon portal niet openen' });
  }
});

// ---------- Telegram bot ----------
async function upsertUser(from, chatId) {
  await db.pool.query(
    'INSERT INTO alert_users (chat_id, username, first_name) VALUES ($1,$2,$3) ON CONFLICT (chat_id) DO UPDATE SET username=$2, first_name=$3',
    [chatId, from.username || null, from.first_name || null]
  );
}

function loginButton(chatId) {
  return { reply_markup: { inline_keyboard: [[{ text: '⚙️ Open dashboard', url: auth.loginLink(chatId) }]] } };
}

app.post('/tg/webhook', async function (req, res) {
  res.sendStatus(200);
  if (req.headers['x-telegram-bot-api-secret-token'] !== TG_SECRET) return;
  try {
    var m = req.body.message;
    if (!m || !m.text || m.chat.type !== 'private') return;
    var chatId = m.chat.id;
    var cmd = m.text.split(' ')[0].split('@')[0].toLowerCase();
    await upsertUser(m.from, chatId);

    if (cmd === '/start' || cmd === '/login') {
      await tg.sendMessage(chatId,
        (cmd === '/start' ? '👋 Welkom bij <b>FlipScan Alerts</b>!\n\nJe krijgt hier binnen een minuut een melding zodra er een nieuwe advertentie op Marktplaats, Vinted of eBay verschijnt die past bij jouw zoekopdracht.\n\nDe eerste ' + config.TRIAL_DAYS + ' dagen zijn gratis, daarna €4,99 per week of €14,99 per maand.\n\n' : '') +
        'Tik op de knop om je zoekopdrachten in te stellen (link is 15 min geldig).', loginButton(chatId));
      return;
    }
    if (cmd === '/admin') {
      var ok = await growth.claimAdmin(chatId, m.text.split(' ').slice(1).join(' '));
      return tg.sendMessage(chatId, ok ? '✅ Je bent nu beheerder. Stuur /stats, en je krijgt elke ochtend om 09:00 het rapport.' : 'Code klopt niet.');
    }
    if (cmd === '/video') {
      if (!(await growth.isAdminChat(m.from, chatId))) return tg.sendMessage(chatId, 'Dit commando is alleen voor de beheerder.');
      await tg.sendMessage(chatId, '🎬 Video wordt gemaakt, duurt ongeveer een minuut...');
      video.sendTo(chatId).catch(function (e) { console.error('[video]', e.message); tg.sendMessage(chatId, 'Video maken mislukt: ' + tg.esc(e.message.slice(0, 200))); });
      return;
    }
    if (cmd === '/stats') {
      if (!(await growth.isAdminChat(m.from, chatId))) return tg.sendMessage(chatId, 'Dit commando is alleen voor de beheerder.');
      await growth.registerAdmin(chatId);
      return tg.sendMessage(chatId, await growth.statsText() + '\n\n<i>Je krijgt dit rapport elke ochtend om 09:00.</i>');
    }
    if (cmd === '/zoekopdrachten') {
      var r = await db.pool.query('SELECT query, platforms, min_price, max_price, active FROM alert_searches WHERE chat_id=$1 ORDER BY created_at', [chatId]);
      if (!r.rows.length) return tg.sendMessage(chatId, 'Je hebt nog geen zoekopdrachten.', loginButton(chatId));
      var lines = r.rows.map(function (s) {
        var price = s.min_price || s.max_price ? ' (€' + (s.min_price || 0) + ' tot €' + (s.max_price || '∞') + ')' : '';
        return (s.active ? '✅ ' : '⏸ ') + '<b>' + tg.esc(s.query) + '</b>' + price + '\n    ' + s.platforms.join(', ');
      });
      return tg.sendMessage(chatId, lines.join('\n'), loginButton(chatId));
    }
    if (cmd === '/pauze') {
      await db.pool.query('UPDATE alert_users SET paused=TRUE WHERE chat_id=$1', [chatId]);
      return tg.sendMessage(chatId, '⏸ Meldingen staan op pauze. Stuur /hervat om weer te starten.');
    }
    if (cmd === '/hervat') {
      await db.pool.query('UPDATE alert_users SET paused=FALSE WHERE chat_id=$1', [chatId]);
      return tg.sendMessage(chatId, '▶️ Meldingen staan weer aan.');
    }
    await tg.sendMessage(chatId, 'Commando\'s:\n/login  dashboard openen\n/zoekopdrachten  overzicht\n/pauze  meldingen pauzeren\n/hervat  meldingen hervatten');
  } catch (e) {
    console.error('bot fout:', e.message);
  }
});

app.get('/health', function (req, res) { res.json({ ok: true }); });

// Echte, actuele advertenties voor de homepage (titel, prijs, foto, link naar de advertentie)
app.get('/api/live-feed', function (req, res) {
  var c = livefeed.get();
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ updatedAt: c.updatedAt, checked: c.checked, items: c.items });
});

// ---------- Start ----------
var PORT = process.env.PORT || 3000;
db.init().then(async function () {
  app.listen(PORT, function () { console.log('FlipScan Alerts draait op poort ' + PORT); });
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.BASE_URL) {
    var hookBase = process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : process.env.BASE_URL;
    await tg.call('setWebhook', { url: hookBase + '/tg/webhook', secret_token: TG_SECRET, allowed_updates: ['message'] });
    await tg.call('setMyCommands', { commands: [
      { command: 'login', description: 'Dashboard openen' },
      { command: 'zoekopdrachten', description: 'Je zoekopdrachten' },
      { command: 'pauze', description: 'Meldingen pauzeren' },
      { command: 'hervat', description: 'Meldingen hervatten' }
    ] });
  }
  worker.start();
  livefeed.start();
  try { await growth.init(stripe); growth.start(); video.start(); } catch (e) { console.error('[growth] start:', e.message); }
}).catch(function (e) {
  console.error('Start mislukt:', e);
  process.exit(1);
});
