/** Lesestand-Overlay (v2.5): server side for the Safari userscript userscript/manga-tracker.user.js.
 *  - apiLesestandHosts: reading sites from your list, so the overlay only runs there
 *  - apiLesestand:      where you stopped for the series on this page ("Wo war ich?")
 *  - apiAutoGelesen:    saves a chapter automatically, but only if it is newer than the saved one
 *  - apiRueckgaengig:   undo for the automatic saving
 *  - apiNeueSerie:      adds a series that is not in the list yet (only after you tap "Add")
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
  return {
    found: true, id: it.id, title: it.title, ch: r.ch,
    chapter: it.chapter, latest: it.latest, status: it.status,
    next: it.next, overview: it.overview, sameSite: r.sameSite
  };
}

function apiAutoGelesen(key, url) {
  check_(key);
  const t = lesestandTreffer_(key, url);
  if (!t || t.r.ch == null) return { ok: false, reason: 'nochapter' };
  if (!t.it) return { ok: false, reason: 'unknown', title: t.r.title };
  const it = t.it, info = urlInfo_(url), n = t.r.ch;
  if (it.chapter != null && n <= it.chapter) return { ok: false, reason: 'older', title: it.title, chapter: it.chapter };
  const prev = { chapter: it.chapter, lastRead: it.lastRead, url: it.url, overview: it.overview };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const patch = { chapter: n, lastRead: heute_(), url: info.url };
    if (!it.status) patch.status = 'Lese ich gerade';
    if (!t.r.sameSite) patch.overview = uebersicht_(info.url) || info.url;   // read on another site: follow it
    const now = schreiben_(it.id, patch);
    return {
      ok: true, id: it.id, title: it.title, ch: n, prev: prev,
      unread: now && now.latest != null ? Math.max(0, Math.floor(now.latest) - Math.floor(n)) : null
    };
  } finally { lock.releaseLock(); }
}

function apiRueckgaengig(key, id, prev) {
  check_(key);
  const patch = {};
  ['chapter', 'lastRead', 'url', 'overview'].forEach(function (k) {
    if (prev && k in prev) patch[k] = prev[k] == null ? '' : prev[k];
  });
  if (!Object.keys(patch).length) return null;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return schreiben_(String(id), patch); } finally { lock.releaseLock(); }
}

function apiNeueSerie(key, url) {
  check_(key);
  return linkEintragenNeu_(url);
}
