/* Token Launch Radar — the page's behaviour.
   Reads window.RADAR, written by main.ts beside the page, so the board and the file cannot disagree. */

(function () {
  'use strict';

  var data = window.RADAR || { rows: [], live: [], ratioTable: [], asOf: '—', watchlistSize: 0, floorUsd: 0 };
  var rows = data.rows.slice();
  var sortKey = 'rank';
  var sortDir = 1;
  var selected = null;

  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  };

  function money(n) {
    if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + n;
  }

  function pct(v) {
    if (v === null || v === undefined) return '—';
    var s = v > 0 ? '+' : '';
    return s + v.toFixed(1) + '%';
  }

  function dir(v) {
    if (v === null || v === undefined) return 'flat';
    return v > 1 ? 'up' : v < -1 ? 'down' : 'flat';
  }

  /* ---- header facts ---------------------------------------------------------------------- */

  $('fact-date').textContent = data.asOf;
  $('fact-rows').textContent = rows.length;
  $('fact-watch').textContent = data.watchlistSize;
  $('fact-live').textContent = data.live.length;

  /* ---- filter options -------------------------------------------------------------------- */

  var categories = {};
  var chains = {};
  rows.forEach(function (r) {
    if (r.category) categories[r.category] = (categories[r.category] || 0) + 1;
    (r.chains || []).forEach(function (c) { chains[c] = (chains[c] || 0) + 1; });
  });

  Object.keys(categories)
    .sort(function (a, b) { return categories[b] - categories[a]; })
    .forEach(function (c) {
      var o = el('option', null, c + ' (' + categories[c] + ')');
      o.value = c;
      $('category').appendChild(o);
    });

  Object.keys(chains)
    .sort(function (a, b) { return chains[b] - chains[a]; })
    .slice(0, 60)
    .forEach(function (c) {
      var o = el('option', null, c + ' (' + chains[c] + ')');
      o.value = c;
      $('chain').appendChild(o);
    });

  var ratioList = $('ratios');
  (data.ratioTable || []).forEach(function (r) {
    var li = el('li', null, r.category + ': ' + r.ratio.toFixed(1) + '×');
    ratioList.appendChild(li);
  });

  /* ---- filtering and sorting -------------------------------------------------------------- */

  function visible() {
    var q = $('q').value.trim().toLowerCase();
    var cat = $('category').value;
    var chain = $('chain').value;
    var watchOnly = $('watch-only').checked;
    var aboveFloor = $('min-floor').checked;

    var out = rows.filter(function (r) {
      if (watchOnly && !r.watch) return false;
      if (aboveFloor && r.tvl < data.floorUsd) return false;
      if (cat && r.category !== cat) return false;
      if (chain && (r.chains || []).indexOf(chain) === -1) return false;
      if (!q) return true;
      return (
        (r.name || '').toLowerCase().indexOf(q) !== -1 ||
        (r.category || '').toLowerCase().indexOf(q) !== -1 ||
        (r.chains || []).join(' ').toLowerCase().indexOf(q) !== -1 ||
        (r.slug || '').toLowerCase().indexOf(q) !== -1
      );
    });

    out.sort(function (a, b) {
      var x = a[sortKey];
      var y = b[sortKey];
      if (sortKey === 'chains') { x = (a.chains || []).length; y = (b.chains || []).length; }
      if (x === null || x === undefined) x = -Infinity;
      if (y === null || y === undefined) y = -Infinity;
      if (typeof x === 'string') return x.localeCompare(y) * sortDir;
      return (x - y) * sortDir || a.rank - b.rank;
    });

    return out;
  }

  function render() {
    var list = visible();
    var body = $('rows');
    body.textContent = '';

    list.forEach(function (r) {
      var tr = el('tr');
      tr.dataset.slug = r.slug;
      if (selected === r.slug) tr.className = 'selected';

      var tdRank = el('td', 'num rank', r.rank);
      var tdName = el('td', 'name', r.name);
      if (r.watch) tdName.appendChild(el('span', 'watch', 'watchlist'));
      var tdCat = el('td', 'cat', r.category || 'unclassified');
      var tdChains = el('td', 'chains', (r.chains || []).join(', '));
      tdChains.title = (r.chains || []).join(', ');
      var tdTvl = el('td', 'num', money(r.tvl));
      var tdChg = el('td', 'num ' + dir(r.change7d), pct(r.change7d));
      var tdImp = el('td', 'num implied', money(r.implied));
      var tdMul = el('td', 'num mult', r.multiple.toFixed(2) + '×');

      [tdRank, tdName, tdCat, tdChains, tdTvl, tdChg, tdImp, tdMul].forEach(function (td) { tr.appendChild(td); });
      tr.addEventListener('click', function () { select(r.slug); });
      body.appendChild(tr);
    });

    $('count').textContent =
      list.length + ' of ' + rows.length + ' protocols' + (list.length !== rows.length ? ' shown' : '');

    var heads = document.querySelectorAll('table.board thead th');
    for (var i = 0; i < heads.length; i++) {
      var th = heads[i];
      if (th.dataset.sort === sortKey) {
        th.setAttribute('aria-sort', sortDir === 1 ? 'ascending' : 'descending');
      } else {
        th.removeAttribute('aria-sort');
      }
    }
  }

  /* ---- detail view ------------------------------------------------------------------------ */

  function select(slug) {
    selected = slug;
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) { r = rows[i]; break; }
    if (!r) return;

    var box = $('detail');
    box.textContent = '';

    box.appendChild(el('h2', null, r.name));
    var sub = el('p', 'sub', (r.category || 'unclassified') + ' · ' + (r.chains || []).join(', '));
    box.appendChild(sub);

    var hero = el('div', 'hero');
    hero.appendChild(el('div', 'big', money(r.implied)));
    hero.appendChild(el('div', 'cap', 'implied value · rank ' + r.rank + ' of ' + rows.length));
    box.appendChild(hero);

    var kv = el('dl', 'kv');
    var pairs = [
      ['Recorded TVL', money(r.tvl)],
      ['7-day TVL change', pct(r.change7d)],
      ['Tracked with no token', r.ageDays.toLocaleString('en-US') + ' days'],
      ['Multiple applied', r.multiple.toFixed(2) + '× TVL'],
      ['On the watchlist', r.watch ? 'yes' : 'no'],
    ];
    pairs.forEach(function (p) {
      kv.appendChild(el('dt', null, p[0]));
      kv.appendChild(el('dd', null, p[1]));
    });
    box.appendChild(kv);

    box.appendChild(el('h3', null, 'How to farm it'));
    var ol = el('ol');
    (r.steps || []).forEach(function (s) { ol.appendChild(el('li', null, s)); });
    box.appendChild(ol);

    render();
  }

  /* ---- wiring ----------------------------------------------------------------------------- */

  document.querySelectorAll('table.board thead th').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.dataset.sort;
      if (sortKey === key) sortDir = -sortDir;
      else { sortKey = key; sortDir = key === 'rank' || key === 'tvl' ? 1 : key === 'implied' ? 1 : 1; }
      render();
    });
  });

  ['q', 'category', 'chain', 'watch-only', 'min-floor'].forEach(function (id) {
    $(id).addEventListener('input', render);
    $(id).addEventListener('change', render);
  });

  render();
  if (rows.length) select(rows[0].slug);
})();
