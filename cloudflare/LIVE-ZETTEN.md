# FlipScan Alerts live op flipscanalerts.nl (Cloudflare Pages)

Alles is getest: pagina's, login, dashboard API en Stripe webhook gaan via Cloudflare naar de backend op Railway.

## 1. Site uploaden (eenmalig, 2 min)
Open Terminal en plak:

    cd ~/Desktop/flipscan-alerts/cloudflare
    npx wrangler login
    npx wrangler pages deploy public --project-name flipscan-alerts

Eerste keer vraagt hij of hij het project mag aanmaken: kies ja, production branch "main".
Je krijgt een link zoals https://flipscan-alerts.pages.dev, daar staat de site al.

## 2. Domein koppelen
1. Cloudflare dashboard > Add a domain > flipscanalerts.nl > Free plan.
2. Cloudflare geeft 2 nameservers. Zet die bij Mijndomein: Mijn domeinen > flipscanalerts.nl > Nameservers wijzigen.
3. Cloudflare > Workers & Pages > flipscan-alerts > Custom domains > voeg flipscanalerts.nl toe, daarna www.flipscanalerts.nl.
4. Wachten tot het groen is (meestal 10 min tot een paar uur).

## 3. Backend laten weten wat het domein is
Als https://flipscanalerts.nl werkt, in Terminal:

    cd ~/Desktop/flipscan-alerts
    railway variables --service flipscan-alerts --set "BASE_URL=https://flipscanalerts.nl"

Railway herstart vanzelf. Login links uit Telegram en de Stripe terugstuur links gaan dan naar je eigen domein.

## Later iets aanpassen (teksten, foto's)
Foto's in ~/Desktop/flipscan-alerts/public/img zetten (namen staan in LEESMIJ.txt), dan:

    cd ~/Desktop/flipscan-alerts
    SITE_URL=https://flipscanalerts.nl node build-netlify.js cloudflare/public cloudflare
    cd cloudflare && npx wrangler pages deploy public --project-name flipscan-alerts

## Opruimen
- Railway: de gecrashte service "Postgres" verwijderen (NIET Postgres-KP-2).
- Stripe: Instellingen > E-mails > herinnering einde proefperiode aanzetten en Opslaan.
