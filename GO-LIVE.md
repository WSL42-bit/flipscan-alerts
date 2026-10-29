# FlipScan go-live checklist

## Al gedaan
- Backend live op Railway (bot, scrapers, Stripe, database)
- Stripe product + prijzen (€4,99/week, €14,99/maand), iDEAL, klantportaal, webhook
- Nieuwe website + Netlify build (`node build-netlify.js`)
- Voorwaarden met Wapps KvK en contact, favicon, OG beeld, sitemap, robots

## Jij (± 20 min)
1. Nieuwe versie deployen (Terminal):
   cd ~/Downloads && unzip -o flipscan-alerts.zip -d ~/Desktop && cd ~/Desktop/flipscan-alerts && railway up --service flipscan-alerts --detach
2. Netlify: app.netlify.com/drop, sleep de map `flipscan-netlify` erin
3. Domein kopen in Netlify (Domains, Register): bijv. getflipscan.nl of flipscanalerts.nl
4. Na domein (Terminal, vul domein in):
   cd ~/Desktop/flipscan-alerts && railway variables --service flipscan-alerts --set "BASE_URL=https://DOMEIN"
   SITE_URL=https://DOMEIN node build-netlify.js && sleep de nieuwe map netlify-site opnieuw in Netlify (Deploys tab)
5. Stripe: Instellingen, Billing, Abonnementen en e-mails: proefperiode-herinnering aanzetten en Opslaan
6. Railway: kapotte service "Postgres" (rood) verwijderen. NIET Postgres-KP-2
7. eBay keys (uit flipscan-backend) zetten:
   railway variables --service flipscan-alerts --set "EBAY_CLIENT_ID=..." --set "EBAY_CLIENT_SECRET=..."
   Geen eBay keys? Haal eBay dan tijdelijk van de site, zeg het tegen Claude.
8. Foto's in public/img (zie LEESMIJ.txt), daarna stap 4 opnieuw builden

## Testen voor je promoot
- Site openen, Probeer 2 dagen gratis, bot Start, dashboard opent
- Proef starten (echte kaart/iDEAL, 2 dagen niks afgeschreven)
- Zoekopdracht "iphone 13" max €300 op Marktplaats + Vinted
- Binnen 15 sec "Zoekopdracht staat aan" in Telegram
- Binnen een uur echte meldingen? Zo niet: `railway logs | tail -50` naar Claude
- Opzeggen via dashboard, check of Stripe het abonnement stopt
