(function () {
  // Mobiel menu
  var btn = document.querySelector('.menu-btn');
  var nav = document.querySelector('.nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Beeldvakken: verberg kapotte <img> zodat de placeholder zichtbaar blijft
  Array.prototype.forEach.call(document.querySelectorAll('.media img'), function (img) {
    if (img.complete && !img.naturalWidth) img.remove();
    else img.addEventListener('error', function () { img.remove(); });
  });

  // Winst-calculator
  var calc = document.getElementById('calc');
  if (calc) {
    var budget = calc.querySelector('#budget');
    var margin = calc.querySelector('#margin');
    var segs = calc.querySelectorAll('.seg button');
    var turns = 2;
    var euro = function (n) { return '€' + Math.round(n).toLocaleString('nl-NL'); };
    function update() {
      var b = +budget.value, m = +margin.value / 100;
      var gross = b * turns * m;
      var sub = 14.99;
      calc.querySelector('#out-budget').textContent = euro(b);
      calc.querySelector('#out-margin').textContent = margin.value + '%';
      calc.querySelector('#res-month').textContent = euro(gross);
      calc.querySelector('#res-flips').textContent = turns + 'x per maand';
      calc.querySelector('#res-net').textContent = euro(gross - sub);
      calc.querySelector('#res-year').textContent = euro((gross - sub) * 12);
    }
    budget.addEventListener('input', update);
    margin.addEventListener('input', update);
    Array.prototype.forEach.call(segs, function (s) {
      s.addEventListener('click', function () {
        Array.prototype.forEach.call(segs, function (o) { o.setAttribute('aria-pressed', 'false'); });
        s.setAttribute('aria-pressed', 'true');
        turns = +s.getAttribute('data-turns');
        update();
      });
    });
    update();
  }

  // ---------- Bron bijhouden: ?ref=CODE of ?utm_source=tiktok gaat mee naar de Telegram bot ----------
  try {
    var qs = new URLSearchParams(location.search);
    var tag = qs.get('ref') ? 'ref_' + qs.get('ref') : (qs.get('utm_source') ? 'src_' + qs.get('utm_source') : null);
    if (tag) localStorage.setItem('fs_start', tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60));
    var start = localStorage.getItem('fs_start');
    if (start) Array.prototype.forEach.call(document.querySelectorAll('a[href*="t.me/"][href*="start="]'), function (a) {
      a.href = a.href.replace(/start=[^&]*/, 'start=' + start);
    });
  } catch (e) {}

  // ---------- Founder deal teller ----------
  if (document.querySelector('[data-founder]') && window.fetch) {
    fetch('/api/founder').then(function (r) { return r.json(); }).then(function (f) {
      if (!f || !(f.left > 0)) return;
      Array.prototype.forEach.call(document.querySelectorAll('[data-founder-left]'), function (e) { e.textContent = f.left; });
      Array.prototype.forEach.call(document.querySelectorAll('[data-founder]'), function (e) { e.hidden = false; });
      var amt = document.querySelector('[data-month-amount]');
      if (amt) amt.innerHTML = '€9,99<small> /maand</small><s>€14,99</s>';
      var per = document.querySelector('[data-month-per]');
      if (per) per.textContent = 'Dat is €0,33 per dag';
      var bd = document.querySelector('[data-month-badge]');
      if (bd) bd.textContent = '🔥 Founder deal · bespaar 54%';
      var sv = document.querySelector('[data-month-save]');
      if (sv) sv.textContent = 'Je bespaart €11,63 per maand t.o.v. week, ruim €139 per jaar';
      Array.prototype.forEach.call(document.querySelectorAll('.sticky-cta span'), function (e) { e.textContent = 'Founder deal: €9,99 p/m, nog ' + f.left + ' plekken'; });
    }).catch(function () {});
  }

  // ---------- Echte advertenties (live uit /api/live-feed) ----------
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BELL = '<svg viewBox="0 0 16 16" fill="none"><path d="M3 11.5V6.5a5 5 0 0 1 10 0v5l1.5 1.5h-13L3 11.5Z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  var LABEL = { marktplaats: 'Marktplaats', vinted: 'Vinted', ebay: 'eBay' };
  var DOT = { marktplaats: 'mp', vinted: 'vi', ebay: 'eb' };
  function euro(n) { return '€ ' + (Math.round(n * 100) / 100).toLocaleString('nl-NL', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function pic(it) {
    var i = el('img'); i.src = it.image; i.alt = it.title; i.decoding = 'async';
    i.referrerPolicy = 'no-referrer';
    i.addEventListener('error', function () { var a = i.closest('.alert,.deal') || i.parentNode; if (a) a.style.display = 'none'; });
    return i;
  }
  function where(it) { return LABEL[it.platform] + (it.location ? ' · ' + it.location : ''); }
  function ago(iso) {
    if (!iso) return '';
    var m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return m < 1 ? 'zojuist' : m + ' min geleden';
  }

  function alertCard(it, isNew) {
    var a = el('div', 'alert' + (isNew ? ' flash' : ''));
    var m = el('div', 'media thumb'); m.appendChild(pic(it)); a.appendChild(m);
    a.appendChild(el('b', null, it.title));
    var row = el('div', 'row'); row.appendChild(el('span', 'price', euro(it.price)));
    var w = el('span'); w.appendChild(el('i', 'dot ' + DOT[it.platform])); w.appendChild(document.createTextNode(where(it))); row.appendChild(w);
    a.appendChild(row);
    var o = el('a', 'open', 'Bekijk advertentie'); o.href = it.url; o.target = '_blank'; o.rel = 'noopener nofollow';
    a.appendChild(o);
    return a;
  }

  // Korting t.o.v. de gemiddelde vraagprijs van vergelijkbare advertenties (alleen tonen als het echt scheelt)
  function offText(it) {
    if (!it.median || !it.price) return '';
    var pct = Math.round((1 - it.price / it.median) * 100);
    return pct >= 10 && pct <= 70 ? pct + '% onder gem.' : '';
  }

  // Kaart voor de dealmuur in de hero
  function wallCard(it) {
    var a = el('a', 'dcard'); a.href = it.url; a.target = '_blank'; a.rel = 'noopener nofollow';
    var p = el('div', 'pic'); var im = pic(it); im.loading = 'lazy'; p.appendChild(im);
    p.appendChild(el('span', 'price', euro(it.price)));
    var off = offText(it); if (off) p.appendChild(el('span', 'off', off));
    a.appendChild(p);
    var m = el('div', 'meta'); m.appendChild(el('b', null, it.title));
    var w = el('span'); w.appendChild(el('i', 'dot ' + DOT[it.platform])); w.appendChild(document.createTextNode(where(it))); m.appendChild(w);
    a.appendChild(m);
    return a;
  }

  function dealCard(it) {
    var a = el('a', 'deal'); a.href = it.url; a.target = '_blank'; a.rel = 'noopener nofollow';
    var p = el('div', 'pic'); p.appendChild(pic(it)); a.appendChild(p);
    var off = offText(it); if (off) p.appendChild(el('span', 'off', off));
    var b = el('div', 'body');
    b.appendChild(el('span', 'p', euro(it.price)));
    b.appendChild(el('span', 't', it.title));
    var m = el('span', 'm'); m.appendChild(el('i', 'dot ' + DOT[it.platform])); m.appendChild(document.createTextNode(where(it))); b.appendChild(m);
    a.appendChild(b);
    return a;
  }

  function mosaic(box, list) {
    var n = Math.min(+box.getAttribute('data-live') || 3, list.length);
    if (!n) return;
    var img = box.querySelector(':scope > img');
    if (img && img.naturalWidth) return; // eigen foto aanwezig, die wint
    if (img && !img.complete) { img.addEventListener('error', function () { mosaic(box, list); }); return; }
    if (img) img.remove();
    var g = el('div', 'mosaic n' + n);
    list.slice(0, n).forEach(function (it) {
      var inLink = !!box.closest('a');
      var a = el(inLink ? 'span' : 'a'); if (!inLink) { a.href = it.url; a.target = '_blank'; a.rel = 'noopener nofollow'; } a.title = it.title;
      a.appendChild(pic(it));
      var t = el('span', 'tag'); t.appendChild(el('i', 'dot ' + DOT[it.platform])); t.appendChild(document.createTextNode(euro(it.price) + ' · ' + it.title));
      a.appendChild(t);
      g.appendChild(a);
    });
    box.appendChild(g);
  }

  var needsLive = document.getElementById('ticker') || document.getElementById('wall') || document.getElementById('feed') || document.querySelector('[data-live]') || document.getElementById('live-grid');
  if (needsLive && window.fetch) {
    fetch('/api/live-feed').then(function (r) { return r.json(); }).then(function (data) {
      var raw = (data.items || []).filter(function (it) { return it.image && it.price; });
      // Afwisselen per zoekopdracht, zodat je niet 8x hetzelfde product ziet
      var groups = {}, order = [];
      raw.forEach(function (it) { if (!groups[it.query]) { groups[it.query] = []; order.push(it.query); } groups[it.query].push(it); });
      var items = [];
      for (var r = 0; items.length < raw.length; r++) order.forEach(function (q) { if (groups[q][r]) items.push(groups[q][r]); });
      if (!items.length) throw new Error('leeg');

      // Statusregels
      var meta = document.getElementById('live-meta');
      if (meta) meta.textContent = 'laatste check ' + ago(data.updatedAt) + (data.checked ? ' · ' + data.checked + ' advertenties bekeken' : '');
      var hl = document.getElementById('hero-live');
      if (hl) hl.textContent = 'live · ' + (data.checked || items.length) + ' advertenties gecheckt';

      // Hero dealmuur: kolommen met echte advertenties, inhoud dubbel voor een naadloze loop
      var wall = document.getElementById('wall');
      if (wall) {
        var cols = wall.querySelectorAll('.wall-col');
        var per = Math.max(4, Math.ceil(items.length / cols.length));
        Array.prototype.forEach.call(cols, function (col, ci) {
          var list = [];
          for (var k = 0; k < per; k++) list.push(items[(ci * per + k) % items.length]);
          col.innerHTML = '';
          list.concat(list).forEach(function (it) { col.appendChild(wallCard(it)); });
        });
      }

      // Ticker bovenaan elke pagina
      var ticker = document.getElementById('ticker');
      if (ticker) {
        var frag = items.slice(0, 14).map(function (it) {
          return '<a href="' + it.url.replace(/"/g, '%22') + '" target="_blank" rel="noopener nofollow"><span class="new">NIEUW</span>' +
            it.title.replace(/[<>&]/g, '').slice(0, 42) + ' · ' + euro(it.price) + ' · ' + LABEL[it.platform] + '</a>';
        }).join('');
        ticker.innerHTML = frag + frag;
      }

      // Pop-up melding in de hero, zoals een Telegram notificatie
      var ping = document.getElementById('ping');
      if (ping && !reduce) {
        var pi = 0;
        var showPing = function () {
          if (document.hidden) return;
          var it = items[(pi++ * 5 + 3) % items.length];
          ping.href = it.url; ping.target = '_blank'; ping.rel = 'noopener nofollow';
          ping.innerHTML = '';
          ping.appendChild(pic(it));
          var d = el('div');
          var sm = el('small'); sm.innerHTML = '<span class="bell" style="width:16px;height:16px;border-radius:5px;border:0">' + BELL + '</span>FlipScan · nu';
          d.appendChild(sm); d.appendChild(el('b', null, it.title)); d.appendChild(el('em', null, euro(it.price) + ' · ' + LABEL[it.platform]));
          ping.appendChild(d);
          ping.classList.add('show');
          setTimeout(function () { ping.classList.remove('show'); }, 3600);
        };
        setTimeout(showPing, 2200);
        setInterval(showPing, 7000);
      }

      // Grid met echte deals
      var grid = document.getElementById('live-grid');
      if (grid) { grid.innerHTML = ''; items.slice(0, 8).forEach(function (it) { grid.appendChild(dealCard(it)); }); }

      // Beeldvakken vullen met echte advertentiefoto's (per platform waar gevraagd), zonder dubbelingen
      var used = 8, boxes = document.querySelectorAll('[data-live]');
      Array.prototype.forEach.call(boxes, function (box) {
        var pl = box.getAttribute('data-platform');
        var pool = pl ? items.filter(function (it) { return it.platform === pl; }) : items.slice(used).concat(items.slice(0, used));
        if (!pl) used = (used + (+box.getAttribute('data-live') || 3)) % items.length;
        if (!pool.length) pool = items.slice(used).concat(items.slice(0, used));
        if (pool.length) mosaic(box, pool);
      });

      // Telefoon: elke paar seconden een nieuwe echte melding bovenaan
      var feed = document.getElementById('feed');
      if (feed) {
        feed.innerHTML = '';
        var phoneItems = items.slice().reverse();
        feed.appendChild(alertCard(phoneItems[0], false));
        if (phoneItems[1]) feed.insertBefore(alertCard(phoneItems[1], false), feed.firstChild);
        var i = 2;
        if (!reduce && phoneItems.length > 2) setInterval(function () {
          if (document.hidden) return;
          feed.insertBefore(alertCard(phoneItems[i % phoneItems.length], true), feed.firstChild);
          i++;
          while (feed.children.length > 2) feed.removeChild(feed.lastChild);
        }, 3800);
      }
    }).catch(function () {
      var wl = document.getElementById('wall'); if (wl) wl.style.display = 'none';
      var s = document.getElementById('live');
      if (s) s.style.display = 'none';
      var st = document.getElementById('feed-status'); if (st) st.textContent = 'meldingen';
    });
  }

  // Sticky knop op mobiel zodra je voorbij de hero scrolt
  var sticky = document.querySelector('.sticky-cta');
  if (sticky) {
    var onScroll = function () { sticky.classList.toggle('show', window.scrollY > 650 && (window.innerHeight + window.scrollY) < document.body.scrollHeight - 300); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }
  // Scroll reveal en optellende cijfers
  var revealEls = document.querySelectorAll('.reveal, [data-count]');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        e.target.classList.add('in');
        var to = +e.target.getAttribute('data-count');
        if (to) {
          var t0 = performance.now();
          var step = function (t) {
            var k = Math.min(1, (t - t0) / 900);
            e.target.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
            if (k < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      });
    }, { threshold: 0.15 });
    Array.prototype.forEach.call(revealEls, function (n) { io.observe(n); });
  } else {
    Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (n) { n.classList.add('in'); });
  }
})();
