# FlipScan Alerts

Website + Telegram bot die nieuwe advertenties op Marktplaats, Vinted en eBay doorstuurt.
Losse service, raakt de FlipScan app niet. Draait op Railway met Postgres.

## 1. Bot aanmaken (2 min)
Telegram → @BotFather → `/newbot` → naam `FlipScan Alerts` → username bijv. `FlipScanAlertsBot`. Token bewaren.

## 2. Stripe (5 min)
1. Product "FlipScan Alerts" met twee terugkerende prijzen:
   €4,99 per week (kopieer `price_...`) en €14,99 per maand (kopieer `price_...`)
   De 2 dagen proefperiode zet de code zelf, niet in Stripe instellen
2. Instellingen → Betaalmethoden: kaart, iDEAL, Bancontact en SEPA Direct Debit aan
   (iDEAL werkt bij abonnementen via een SEPA incasso machtiging)
3. Instellingen → Billing → Subscriptions: zet de mail "trial ending reminder" aan
4. Instellingen → Klantportaal: activeren (opzeggen en plan wisselen toestaan)
5. Webhook komt in stap 4

## 3. Deploy op Railway (terminal)
```bash
cd ~/Desktop/flipscan-alerts
git init && git add . && git commit -m "FlipScan Alerts v1"
railway init            # nieuw project: flipscan-alerts
railway add --database postgres
railway up
railway domain          # geeft je een URL, of koppel je eigen domein
```

Dan variabelen zetten (vul je eigen waardes in):
```bash
railway variables --set "DATABASE_URL=\${{Postgres.DATABASE_URL}}" \
  --set "BASE_URL=https://JOUW-URL" \
  --set "SESSION_SECRET=$(openssl rand -hex 32)" \
  --set "TELEGRAM_BOT_TOKEN=JOUW_TOKEN" \
  --set "TELEGRAM_BOT_USERNAME=FlipScanAlertsBot" \
  --set "STRIPE_SECRET_KEY=sk_live_..." \
  --set "STRIPE_PRICE_WEEKLY=price_1UQ2X13UAjn74n3nUg6BYoil" \
  --set "STRIPE_PRICE_MONTHLY=price_1UQ2X13UAjn74n3nFsyizWQ6" \
  --set "EBAY_CLIENT_ID=..." --set "EBAY_CLIENT_SECRET=..."
```
eBay keys: hergebruik die van flipscan-backend (`railway variables` in die map).

## 4. Stripe webhook
Stripe → Developers → Webhooks → endpoint `https://JOUW-URL/stripe/webhook`
Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
Kopieer `whsec_...` en:
```bash
railway variables --set "STRIPE_WEBHOOK_SECRET=whsec_..."
```

## 5. Testen
1. Open `https://JOUW-URL`, tik "Probeer 2 dagen gratis"
2. Bot stuurt login knop → dashboard
3. Start de proefperiode (eerst in Stripe testmodus met kaart 4242 4242 4242 4242)
4. Zoekopdracht maken, binnen 15 sec: bevestiging in Telegram, daarna alleen nieuwe advertenties
5. Logs: `railway logs`

## Let op
- Vinted kan Datadome blokkades geven vanaf Railway IP's. Zie je `Vinted HTTP 403` in de logs, zet dan je Puppeteer aanpak uit flipscan-backend in `scrapers/vinted.js` (fetchCookie vervangen).
- Proefperiode en limieten: `config.js` (TRIAL_DAYS, maxSearches, intervalSec)
- Proefperiode krijg je alleen als je nog nooit klant was (tegen misbruik)
- Prijzen op de site: `public/index.html` en `public/dashboard.html`
