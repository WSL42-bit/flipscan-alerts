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

  // Voorbeeld-meldingen in de telefoon
  var feed = document.getElementById('feed');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (feed && !reduce) {
    var items = [
      { t: 'iPhone 13 128GB, accu 89%', p: '€ 285', pl: 'Marktplaats', c: 'mp', s: 'Utrecht' },
      { t: 'Nike Dunk Low Panda, maat 43', p: '€ 45', pl: 'Vinted', c: 'vi', s: 'Rotterdam' },
      { t: 'PS5 Disc Edition + 2 controllers', p: '€ 310', pl: 'eBay', c: 'eb', s: 'Duitsland' },
      { t: 'Bose QC45, zo goed als nieuw', p: '€ 120', pl: 'Marktplaats', c: 'mp', s: 'Amsterdam' },
      { t: 'Arc\'teryx Atom jas, maat M', p: '€ 95', pl: 'Vinted', c: 'vi', s: 'Den Haag' }
    ];
    var i = 2;
    setInterval(function () {
      var it = items[i % items.length]; i++;
      var el = document.createElement('div');
      el.className = 'alert new';
      el.innerHTML = '<div class="media thumb"><div class="ph"></div></div>' +
        '<b></b><div class="row"><span class="price"></span><span><i class="dot ' + it.c + '"></i> </span></div>' +
        '<a class="open" href="#" tabindex="-1">Bekijk advertentie</a>';
      el.querySelector('b').textContent = it.t;
      el.querySelector('.price').textContent = it.p;
      el.querySelector('.row span:last-child').append(it.pl + ' · ' + it.s + ' · zojuist');
      feed.insertBefore(el, feed.firstChild);
      while (feed.children.length > 2) feed.removeChild(feed.lastChild);
    }, 4200);
  }
})();
