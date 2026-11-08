var NUM = /(?:^|[^a-z])(?:chapter|chap|ch|episode|ep|kapitel|kap)\.?\s*#?\s*(\d{1,4})(?![\d])/i;
var HREF = /(?:^|[^a-z])(?:chapter|chap|ch|episode|ep)[\s._\/-]*(\d{1,4})(?![\d])/i;
var groups = {};
function add(key, n, el) { if (n > 0 && n < 5000) { (groups[key] = groups[key] || []).push({ n: n, el: el }); } }
var links = document.querySelectorAll('a[href]');
for (var k = 0; k < links.length; k++) {
  var a = links[k], txt = (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  var m = txt.match(NUM) || a.href.match(HREF);
  if (!m) continue;
  add('a:' + a.href.replace(/[?#].*$/, '').replace(/\d+/g, '#'), parseInt(m[1], 10), a);
}
var opts = document.querySelectorAll('option');
for (var j = 0; j < opts.length; j++) {
  var o = opts[j], mo = (o.textContent || '').match(NUM) || (o.value || '').match(HREF);
  if (mo) add('select', parseInt(mo[1], 10), null);
}
// The chapter list is the largest group of similar links; sidebars like "Popular" have only a few.
var best = 0, size = 0, bestKey = '';
// Drop single numbers far above the rest of a group (an ID or view count, not a chapter)
function topOf(list) {
  var ns = list.map(function (x) { return x.n; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (p, q) { return q - p; });
  while (ns.length > 2 && ns[0] > ns[1] + Math.max(20, ns[1] * 0.5)) ns.shift();
  return ns[0];
}
for (var g in groups) {
  var list = groups[g], max = topOf(list);
  groups[g] = list.filter(function (x) { return x.n <= max; });
  list = groups[g];
  if (list.length > size || (list.length === size && max > best)) { size = list.length; best = max; bestKey = g; }
}
if (size < 3) { var mu = location.href.match(HREF); if (mu) best = Math.max(best, parseInt(mu[1], 10)); }

// Release weekday from the dates shown next to the newest chapters
var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, mai: 5, okt: 10, dez: 12, mrz: 3 };
function day(y, mo, d) { var t = new Date(y, mo - 1, d, 12); return (t.getMonth() === mo - 1 && t.getDate() === d) ? t : null; }
function parseDate(s) {
  var now = new Date(), r;
  if ((r = s.match(/(\d+)\s*(second|sec|minute|min|hour|hr|day)s?\s+ago/i))) {
    var unit = r[2].toLowerCase(), v = parseInt(r[1], 10);
    var ms = /^d/.test(unit) ? v * 864e5 : /^h/.test(unit) ? v * 36e5 : /^m/.test(unit) ? v * 6e4 : v * 1e3;
    return new Date(now.getTime() - ms);
  }
  if (/\b(today|heute)\b/i.test(s)) return now;
  if (/\b(yesterday|gestern)\b/i.test(s)) return new Date(now.getTime() - 864e5);
  if ((r = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) return day(+r[1], +r[2], +r[3]);
  if ((r = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/))) return day(+r[3] < 100 ? 2000 + +r[3] : +r[3], +r[2], +r[1]);
  if ((r = s.match(/(?:^|[^a-z])([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i)) && MON[r[1].toLowerCase()]) return day(+r[3], MON[r[1].toLowerCase()], +r[2]);
  if ((r = s.match(/\b(\d{1,2})\.?\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})/i)) && MON[r[2].toLowerCase()]) return day(+r[3], MON[r[2].toLowerCase()], +r[1]);
  if ((r = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})/)) && +r[2] > 12) return day(+r[3], +r[1], +r[2]);
  return null;
}
function rowOf(x, all) {
  var e = x.el;
  for (var up = 0; up < 4 && e.parentElement; up++) {
    var p = e.parentElement, others = 0;
    for (var q = 0; q < all.length; q++) if (all[q].n !== x.n && all[q].el && p.contains(all[q].el)) { others++; break; }
    if (others || (p.textContent || '').length > 300) break;
    e = p;
  }
  return e;
}
// Rows of the chapter list as {n, text}. Some rows (for example early-access chapters) look different
// from the rest, so every row of the list the chapter links sit in is read.
var listRows = [];
if (bestKey && bestKey !== 'select') {
  var all0 = groups[bestKey], parents = [], seenN = {}, extra = [];
  for (var z = 0; z < all0.length; z++) {
    var rw = rowOf(all0[z], all0);
    if (!seenN[all0[z].n]) { seenN[all0[z].n] = 1; listRows.push({ n: all0[z].n, text: (rw.textContent || '').replace(/\s+/g, ' ') }); }
    if (all0.length >= 3 && rw.parentElement && parents.indexOf(rw.parentElement) < 0) parents.push(rw.parentElement);
  }
  parents.forEach(function (cont) {
    var kids = cont.children;
    for (var c = 0; c < kids.length; c++) {
      var tx = (kids[c].textContent || '').replace(/\s+/g, ' ');
      if (tx.length > 300) continue;
      var mm = tx.match(NUM);
      if (!mm) continue;
      var nn = parseInt(mm[1], 10);
      if (nn > best) extra.push(nn);
      if (!seenN[nn] && nn > 0 && nn < 5000) { seenN[nn] = 1; listRows.push({ n: nn, text: tx }); }
    }
  });
  // Accept higher numbers only as a continuous run above the last linked chapter (not a "Popular" sidebar).
  extra.sort(function (p, q) { return p - q; });
  for (var e2 = 0; e2 < extra.length; e2++) { if (extra[e2] <= best + 2) best = Math.max(best, extra[e2]); else break; }
  listRows = listRows.filter(function (x) { return x.n <= best; });
}
var relDay = 0, newest = null;
if (listRows.length) {
  listRows.sort(function (p, q) { return q.n - p.n; });
  var count = [0, 0, 0, 0, 0, 0, 0, 0], dated = 0;
  listRows.slice(0, 10).forEach(function (x) {
    var d = parseDate(x.text);
    if (d) { count[(d.getDay() + 6) % 7 + 1]++; dated++; if (!newest || d > newest) newest = d; }
  });
  var top = 0;
  for (var w = 1; w <= 7; w++) if (count[w] > count[top]) top = w;
  if (dated >= 3 && count[top] / dated >= 0.6) relDay = top;
}
var ymd = newest ? '' + newest.getFullYear() + ('0' + (newest.getMonth() + 1)).slice(-2) + ('0' + newest.getDate()).slice(-2) : '';
completion(encodeURIComponent(location.href) + '&latest=' + best + (relDay ? 'd' + relDay : '') + (ymd ? 't' + ymd : ''));
