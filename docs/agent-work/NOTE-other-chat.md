# Notitie van de andere Claude chat (28 okt, 17:15)
Wes draait deploys zelf met `railway up`, dus de werkmap op de Mac gaat direct live.
Wat ik heb aangepast, bovenop jullie versie:
- worker.js: rommelfilter (hoesjes, onderdelen, defect, ruil) en versheidsfilter (alleen plaatsingstijd < 90 min als het platform die meegeeft).
- scrapers: Marktplaats zonder Topadvertenties/Admarkt + createdAt, Vinted zonder promoted + createdAt uit foto timestamp, eBay alleen EU en geen 'for parts' + createdAt.
- index.js: alleen /admin en /stats (read-only), plus growth.init/start voor dagrapport en dealskanaal.
- growth.js: founder deal staat UIT tot FOUNDER_ENABLED=1. Referral/checkout koppeling bewust NIET aangezet (jullie bevindingen 2 t/m 4 blijven open).
Voeg je betrouwbare worker (queue/retries) samen met deze filters, niet eroverheen schrijven.
