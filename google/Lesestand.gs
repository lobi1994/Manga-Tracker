/** Lesestand-Overlay (v2.5): server side for the Safari userscript userscript/manga-tracker.user.js.
 *  - apiLesestandHosts: reading sites from your list, so the overlay only runs there
 *  - apiLesestand:      where you stopped for the series on this page ("Wo war ich?")
 *  - apiAutoGelesen:    saves a chapter automatically, but only if it is newer than the saved one
 *  - apiRueckgaengig:   undo for the automatic saving (v2.12: also "Neuestes Kapitel", hiatus and release info)
 *  - apiNeueSerie:      adds a series that is not in the list yet (only after you tap "Add")
 *  v2.13 "Erneut lesen": while a re-read is active, the effective chapter is the re-read chapter (rrCh);
 *  the first pass (chapter, url) is never overwritten by a lower chapter.
 *  Kept in its own file so Code.gs stays unchanged. */

function apiLesestandHosts(key) {
  check_(key);
  const seen = {};
  alle_().forEach(function (it) {
    [it.url, it.overview].forEach(function (u) { const h = hostOhneWww_(u); if (h) seen[h] = 1; });
  });
  return Object.keys(seen);
}

function lesestandTreffer_(key, url) {
  const r = apiErkennenPlus(key, url);
  if (!r) return null;
  const it = r.matchId ? alle_().find(function (x) { return x.id === r.matchId; }) : null;
  return { r: r, it: it || null };
}

function apiLesestand(key, url) {
  check_(key);
  const t = lesestandTreffer_(key, url);
  if (!t) return { found: false };
  const r = t.r, it = t.it;
  if (!it) return { found: false, title: r.title, ch: r.ch };
  const rr = it.rrCh != null;
  const out = {
    found: true, id: it.id, title: it.title, ch: r.ch,
    chapter: rr ? it.rrCh : it.chapter, latest: it.latest, status: it.status,
    next: it.next, overview: it.overview, sameSite: r.sameSite, rr: rr
  };
  if (rr) { out.first = it.chapter; out.pass = it.pass; }   // next already points to rrCh + 1 (ding_)
  return out;
}

function apiAutoGelesen(key, url) {
  check_(key);
  const t = lesestandTreffer_(key, url);
  if (!t || t.r.ch == null) return { ok: false, reason: 'nochapter' };
  if (!t.it) return { ok: false, reason: 'unknown', title: t.r.title };
  const it = t.it, info = urlInfo_(url), n = t.r.ch;
  const rr = it.rrCh != null, eff = rr ? it.rrCh : it.chapter;
  if (eff != null && n <= eff) return { ok: false, reason: 'older', title: it.title, chapter: eff };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    // v2.12: everything this save may change (also "Neuestes Kapitel", hiatus, release info), read from the row itself, for "Undo"
    const prev = lesestandVorher_(it);
    // v2.13: re-read active → only the re-read progress is saved (schreiben_ ends the re-read once it reaches the first pass)
    const patch = rr ? { rrCh: n, rrUrl: info.url, lastRead: heute_() } : { chapter: n, lastRead: heute_(), url: info.url };
    if (!it.status) patch.status = 'Lese ich gerade';
    if (!rr && !t.r.sameSite) patch.overview = uebersicht_(info.url) || info.url;   // read on another site: follow it
    const now = schreiben_(it.id, patch);
    const first = now ? now.chapter : null;
    return {
      ok: true, id: it.id, title: it.title, ch: n, prev: prev,
      unread: now && now.latest != null ? Math.max(0, Math.floor(now.latest) - Math.floor(rr ? (first || 0) : n)) : null,
      rr: !!(now && now.rrCh != null), first: first, pass: now ? now.pass : 1
    };
  } finally { lock.releaseLock(); }
}

/** Fields an automatic save may change (directly or through schreiben_). readAt is left as it is. */
const LESESTAND_UNDO = ['chapter', 'lastRead', 'url', 'overview', 'status', 'latest', 'latestSince', 'check', 'lockedCh',
  'relDate', 'relCh', 'relDay', 'back', 'autoHiatus', 'rrCh', 'rrUrl', 'pass'];

/** The row as it is now, in the form schreiben_ writes back unchanged (dates as yyyy-MM-dd, empty cells as null). */
function lesestandVorher_(it) {
  const sh = blatt_(); const r = zeile_(sh, it.id);
  if (!r) return { chapter: it.chapter, lastRead: it.lastRead, url: it.url, overview: it.overview };
  const row = sh.getRange(r, 1, 1, HEAD.length).getValues()[0];
  const prev = {};
  LESESTAND_UNDO.forEach(function (k) {
    const v = row[C[k] - 1];
    prev[k] = v instanceof Date ? tag_(v) : (v === '' || v == null ? null : v);
  });
  return prev;
}

function apiRueckgaengig(key, id, prev) {
  check_(key);
  const patch = {};
  // Older answers only had chapter, lastRead, url and overview: only the fields that are there are restored
  LESESTAND_UNDO.forEach(function (k) {
    if (prev && k in prev) patch[k] = prev[k] == null ? '' : prev[k];
  });
  if (!Object.keys(patch).length) return null;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return schreiben_(String(id), patch, true); } finally { lock.releaseLock(); }
}

function apiNeueSerie(key, url) {
  check_(key);
  return linkEintragenNeu_(url);
}
