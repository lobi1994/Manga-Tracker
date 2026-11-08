/** Shortcut "Kapitel aktualisieren": sets only the latest released chapter. Reading progress stays unchanged. */
function neuestesEintragen_(url, latest) {
  // latest = chapter number, optionally followed by d<weekday 1-7> and t<yyyymmdd of the newest dated chapter>
  const pm = String(latest).match(/^(\d+)(?:[.,]\d+)?(?:d([1-7]))?(?:t(\d{8}))?/);
  const N = pm ? Number(pm[1]) : 0;
  const D = pm && pm[2] ? Number(pm[2]) : 0;
  const T = pm && pm[3] ? pm[3].slice(0, 4) + '-' + pm[3].slice(4, 6) + '-' + pm[3].slice(6, 8) : '';
  if (!(N > 0 && N < 10000)) return kaMsg_('latestNone');
  const info = urlInfo_(url);
  if (!info) return kaMsg_('invalid');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const m = besterTreffer_(info, alle_());
    if (!m) return kaMsg_('notInList');
    const sh = blatt_(); const r = zeile_(sh, m.id); if (!r) return kaMsg_('notInList');
    const row = sh.getRange(r, 1, 1, HEAD.length).getValues()[0];
    const status = row[C.status - 1]; const rating = parseInt(row[C.rating - 1], 10) || 0;
    const closed = status === 'Beendet' || status === 'Abgebrochen';
    const L = row[C.latest - 1] === '' ? null : Number(row[C.latest - 1]);
    const read = Number(row[C.chapter - 1] || 0);
    const today = heute_(); const now = new Date();

    // Release day, last release date and hiatus status from the chapter dates on the page
    const extra = {}; let note = '';
    if (!closed && D) { extra.relDay = D; note += kaMsg_('dayFound', D); }
    if (!closed && T && T <= today && (L == null || N >= L)) {
      extra.relDate = T; extra.relCh = N;
      const age = tage_(T, today);
      if ((status === 'Lese ich gerade' || status === 'Marinate') && age > 42) {
        extra.status = 'Hiatus'; extra.autoHiatus = today + '|' + (N + 1); extra.back = '';
        note += kaMsg_('toHiatus', Math.floor(age / 7));
      } else if (status === 'Hiatus' && age <= 14) {
        extra.back = today;
        if (row[C.autoHiatus - 1]) { extra.status = 'Lese ich gerade'; extra.autoHiatus = ''; }
        note += kaMsg_('backHiatus');
      }
    }
    if (Object.keys(extra).length) schreibeFelder_(sh, r, extra);

    if (N < read) return kaMsg_('latestLower', m.title, N, read) + note;
    if (L != null && N > L * 3 + 100) return kaMsg_('implausible', m.title, N, L);
    if (L != null && N < L) {
      // The page shows fewer chapters than saved (for example a wrong earlier reading): correct it
      schreibeFelder_(sh, r, { latest: N, latestSince: today, lockedCh: '', checkedAt: now, check: (N + 1) + '|no|' + today });
      return kaMsg_('latestFixed', m.title, L, N, N - read) + note;
    }
    const patch = { checkedAt: now, check: (N + 1) + '|no|' + today };
    if (L != null && N === L) {
      const pc = parseCheck_(row[C.check - 1]);
      if (pc && pc.ch === N + 1 && pc.st === 'no' && pc.since) patch.check = (N + 1) + '|no|' + pc.since;
      schreibeFelder_(sh, r, patch);
      return kaMsg_('latestSame', m.title, N) + note;
    }
    const pc = parseCheck_(row[C.check - 1]);
    const last = row[C.checkedAt - 1] instanceof Date ? row[C.checkedAt - 1].getTime() : 0;
    if (!closed && !T && L != null && pc && pc.ch === L + 1 && pc.st === 'no' && now.getTime() - last < 36 * 3600 * 1000) {
      patch.relDate = today; patch.relCh = N; patch.relDay = D || wochentag_();
      if (status === 'Hiatus' && rating >= 4) patch.back = today;
    }
    if (!extra.status && L != null && status === 'Hiatus' && row[C.autoHiatus - 1] && !(T && tage_(T, today) > 42)) { patch.status = 'Lese ich gerade'; patch.autoHiatus = ''; }
    patch.latest = N; patch.latestSince = today; patch.lockedCh = '';
    schreibeFelder_(sh, r, patch);
    return kaMsg_('latestSet', m.title, N, N - read) + note;
  } finally { lock.releaseLock(); }
}
function schreibeFelder_(sh, r, patch) {
  Object.keys(patch).forEach(k => { if (C[k]) sh.getRange(r, C[k]).setValue(zelle_(k, patch[k])); });
}

const KA_MSG = {
  en: {
    invalid: 'That was not a valid link.',
    latestSet: function (t, n, u) { return t + ': latest chapter ' + n + (u > 0 ? ' (' + u + ' unread)' : '') + '. Your reading progress is unchanged.'; },
    latestSame: function (t, n) { return t + ': no new chapter, latest is still ' + n + '.'; },
    latestLower: function (t, n, cur) { return t + ': ' + n + ' is lower than the saved ' + cur + ', nothing changed.'; },
    latestNone: 'No chapter number found on this page.',
    latestFixed: function (t, o, n, u) { return t + ': latest chapter corrected from ' + o + ' to ' + n + (u > 0 ? ' (' + u + ' unread)' : '') + '.'; },
    implausible: function (t, n, o) { return t + ': ' + n + ' chapters looks wrong (saved: ' + o + '), nothing changed. You can correct it in Edit.'; },
    toHiatus: function (w) { return ' Last chapter ' + w + ' weeks ago, status set to Hiatus.'; },
    backHiatus: ' New chapter within the last 2 weeks: marked as back from hiatus.',
    dayFound: function (d) { return ' Release day: ' + ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][d] + '.'; },
    notInList: 'This series is not in your list. Add it first with Manga gelesen or in the app.'
  },
  de: {
    invalid: 'Das war kein g\u00fcltiger Link.',
    latestSet: function (t, n, u) { return t + ': neuestes Kapitel ' + n + (u > 0 ? ' (' + u + ' offen)' : '') + '. Dein Lesestand bleibt unver\u00e4ndert.'; },
    latestSame: function (t, n) { return t + ': kein neues Kapitel, neuestes ist weiter ' + n + '.'; },
    latestLower: function (t, n, cur) { return t + ': ' + n + ' ist niedriger als das gespeicherte ' + cur + ', nichts ge\u00e4ndert.'; },
    latestNone: 'Auf dieser Seite wurde keine Kapitelnummer gefunden.',
    latestFixed: function (t, o, n, u) { return t + ': neuestes Kapitel von ' + o + ' auf ' + n + ' korrigiert' + (u > 0 ? ' (' + u + ' offen)' : '') + '.'; },
    implausible: function (t, n, o) { return t + ': ' + n + ' Kapitel wirkt falsch (gespeichert: ' + o + '), nichts ge\u00e4ndert. Du kannst es unter Bearbeiten korrigieren.'; },
    toHiatus: function (w) { return ' Letztes Kapitel vor ' + w + ' Wochen, Status auf Hiatus gesetzt.'; },
    backHiatus: ' Neues Kapitel in den letzten 2 Wochen: als zur\u00fcck aus Hiatus markiert.',
    dayFound: function (d) { return ' Erscheinungstag: ' + ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'][d] + '.'; },
    notInList: 'Diese Serie ist nicht in deiner Liste. Lege sie zuerst mit Manga gelesen oder in der App an.'
  }
};
function kaMsg_(k) {
  var lang = prefs_().lang === 'de' ? 'de' : 'en';
  var v = KA_MSG[lang][k]; var args = Array.prototype.slice.call(arguments, 1);
  return typeof v === 'function' ? v.apply(null, args) : v;
}
