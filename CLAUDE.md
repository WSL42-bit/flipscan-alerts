# FlipScan Alerts

Telegram-meldingen van nieuwe advertenties op Marktplaats, Vinted en eBay. Website voor abonnement en zoekopdrachten. Van Wapps (Wes Roelofs, KvK 93466285).

## Werkafspraken
- Communiceer in het Nederlands, kort en casual (WhatsApp-stijl).
- NOOIT em dashes, en dashes of streepjes als gedachtestreepje, ook niet in teksten op de site of in de bot.
- Claims op de site moeten kloppen: we checken elke 30 sec, melding "binnen een minuut", geen garanties die we niet meten.
- Nooit geheimen (Stripe, Telegram token, eBay keys) in code of commits. Die staan in Railway variables.
- Werk maar in één sessie tegelijk aan deze repo, anders overschrijven sessies elkaars werk.

## Stack en hosting
- Node/Express backend op Railway: project 75516097-a3f3-46a8-ac8b-a88068bcd18b, service `flipscan-alerts`, database `Postgres-KP-2`. Origin: https://flipscan-alerts-production.up.railway.app
- Domein https://flipscanalerts.nl via Cloudflare Worker `flipscan-alerts` die alles naar Railway proxyt (www gaat naar apex, /assets en /img 1 dag edge cache, CSS/JS hebben ?v=hash).
- Deploy: `railway up --service flipscan-alerts --detach` (of via GitHub auto-deploy als die is gekoppeld).
- Telegram bot @FlipScanAlertsBot, dealskanaal @FlipScanDeals (bot is admin). Beheerder: @WSR21 (env ADMIN_USERNAME).
- Stripe: weekprijs €4,99 (STRIPE_PRICE_WEEKLY), maandprijs €14,99 (STRIPE_PRICE_MONTHLY), proef 2 dagen. Founder prijs €9,99 bestaat (lookup_key flipscan_founder_month) maar staat UIT tot FOUNDER_ENABLED=1.

## Belangrijkste bestanden
- `index.js`: routes, Stripe webhook, Telegram bot (/start /login /zoekopdrachten /pauze /hervat, admin: /admin /stats /video)
- `worker.js`: checkt zoekopdrachten, rommelfilter (hoesjes, onderdelen, defect, ruil) en versheidsfilter (plaatsing < 90 min als het platform dat meegeeft)
- `scrapers/`: marktplaats (lrp api, geen Topadvertenties/Admarkt), vinted (svc-catalogue + token, geen promoted), ebay (Browse API, alleen EU, geen "for parts")
- `livefeed.js`: echte deals voor de site via /api/live-feed + mediaan vraagprijs per zoekterm (stats)
- `growth.js`: dagrapport 09:00 + /stats, dealskanaal (elke 40 min 08:00 tot 23:00), referral en founder logica (referral/founder checkout bewust nog NIET gekoppeld, zie docs/agent-work)
- `video.js`: dagelijkse deal-video 1080x1920 (~13 sec, hook, snelle cuts) met echte advertentiefoto's, om 08:30 naar de beheerder, of /video
- `render.js` + `public/`: site (home, hoe-het-werkt, prijzen, academy, voorwaarden, dashboard)
- `docs/agent-work/`: openstaande betrouwbaarheids- en betaalbevindingen van een eerdere sessie

## Status (29 okt 2026)
- Live: site, abonnementen, meldingen met filters, live deals, /stats, dealskanaal.
- Nog live te zetten na laatste wijzigingen: video.js + ffmpeg in Dockerfile.
- Open: referral beloning alleen bij echte betaalde invoice, founder plekken concurrency-safe, webhook idempotent (zie docs/agent-work/reliability/CHECKPOINT.md).

## Marketing (doel: 100 betalende abonnees)
- Focus: TikTok en Instagram Reels. Dagelijkse automatische deal-video + 2x per week eigen flip-content met gezicht.
- Bronnen meten met ?utm_source=tiktok / instagram / facebook, affiliates via ?ref=CODE. Resultaat in /stats.
- Geen automatische posts in groepen of op Reddit van anderen (spam, bans). Wel: groepen met toestemming van de admin, eigen community, waardevolle Reddit posts.
- Contentplan en scripts staan in het Claude Docs document "FlipScan groeiplan: content en scripts".
