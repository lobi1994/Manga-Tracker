/** Manga-Ideen von Instagram (v2.6): Inbox + Titelsuche.
 *  - Kurzbefehl „Manga merken“ (Teilen in Instagram) → apiInboxNeu: merkt sich den Link im Blatt „Inbox“
 *  - Safari-Overlay auf instagram.com → apiInbox, apiMangaSuche, apiInboxHinzufuegen, apiInboxStatus
 *  Kapitelzahlen kommen kostenlos von MangaUpdates (Kapitelstand) und AniList (Ersatz). */

const INBOX_SHEET = 'Inbox';
const INBOX_HEAD = ['Link', 'Gemerkt am', 'Status', 'Titel'];
const MU = 'https://api.mangaupdates.com/v1';

function inboxBlatt_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(INBOX_SHEET);
  if (!sh) {
    sh = ss.insertSheet(INBOX_SHEET);
    sh.getRange(1, 1, 1, INBOX_HEAD.length).setValues([INBOX_HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Instagram-Link vereinheitlichen (ohne ?igsh=… usw.). Sucht den Link auch in geteiltem Text. */
function igLink_(s) {
  const m = String(s || '').match(/https?:\/\/(?:www\.|m\.)?instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(p|reels?|tv)\/([A-Za-z0-9_-]+)/i);
  if (!m) return null;
  return 'https://www.instagram.com/' + (m[1].toLowerCase() === 'p' ? 'p' : 'reel') + '/' + m[2] + '/';
}
function igId_(s) { const l = igLink_(s); return l ? l.split('/')[4] : null; }

function inboxZeilen_(sh) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, INBOX_HEAD.length).getValues().map(function (r, i) {
    return { row: i + 2, url: String(r[0] || ''), date: r[1] instanceof Date ? Utilities.formatDate(r[1], TZ, 'yyyy-MM-dd') : String(r[1] || ''), status: String(r[2] || ''), title: String(r[3] || '') };
  });
}
function inboxMsg_(k, a, b) {
  const de = prefs_().lang === 'de';
  const M = {
    saved: de ? 'Gemerkt ✓ (' + a + ' offen)' : 'Saved ✓ (' + a + ' open)',
    dup: de ? 'Schon gemerkt (' + a + ' offen)' : 'Already saved (' + a + ' open)',
    done: de ? 'Schon erledigt: ' + a : 'Already done: ' + a,
    noLink: de ? 'Kein Instagram-Link gefunden.' : 'No Instagram link found.'
  };
  return M[k];
}

/** Kurzbefehl „Manga merken“: Link in die Inbox. */
function apiInboxNeu(key, url) {
  check_(key);
  const link = igLink_(url);
  if (!link) return inboxMsg_('noLink');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = inboxBlatt_();
    const rows = inboxZeilen_(sh);
    const id = igId_(link);
    const old = rows.find(function (r) { return igId_(r.url) === id; });
    const open = rows.filter(function (r) { return !r.status || r.status === 'offen'; }).length;
    if (old && (!old.status || old.status === 'offen')) return inboxMsg_('dup', open);
    if (old) return inboxMsg_('done', old.title || old.status);
    sh.appendRow([link, new Date(), 'offen', '']);
    return inboxMsg_('saved', open + 1);
  } finally { lock.releaseLock(); }
}

/** Offene Links, älteste zuerst. */
function apiInbox(key) {
  check_(key);
  return inboxZeilen_(inboxBlatt_()).filter(function (r) { return r.url && (!r.status || r.status === 'offen'); })
    .map(function (r) { return { url: r.url, id: igId_(r.url), date: r.date }; });
}

/** Alle geteilten Links für die Liste in der App, neueste zuerst. */
function apiInboxAlle(key) {
  check_(key);
  return inboxZeilen_(inboxBlatt_()).filter(function (r) { return r.url; }).map(function (r) {
    return { url: r.url, date: r.date, status: r.status || 'offen', title: r.title };
  }).reverse();
}

/** Link als erledigt oder verworfen markieren. */
function apiInboxStatus(key, url, status, title) {
  check_(key);
  const id = igId_(url); if (!id) return null;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = inboxBlatt_();
    inboxZeilen_(sh).forEach(function (r) {
      if (igId_(r.url) !== id) return;
      sh.getRange(r.row, 3).setValue(status === 'verworfen' ? 'verworfen' : 'erledigt');
      if (title) sh.getRange(r.row, 4).setValue(txt_(title));
    });
  } finally { lock.releaseLock(); }
  return apiInbox(key);
}

/* ------------------------------------------------------------ Suche */

function muJson_(method, path, body) {
  try {
    const opt = { method: method, muteHttpExceptions: true, headers: { 'Accept': 'application/json', 'User-Agent': 'MangaTracker/1.0 (private reading list)' } };
    if (body) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
    const r = UrlFetchApp.fetch(MU + path, opt);
    return r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : null;
  } catch (e) { Logger.log('MangaUpdates: ' + e.message); return null; }
}
function zahl_(v) { const m = String(v == null ? '' : v).match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; }

/** Bis zu 4 Treffer: Titel, Art, Jahr, neuestes Kapitel, abgeschlossen?, Cover, Links, schon in der Liste? */
function apiMangaSuche(key, q) {
  check_(key);
  q = String(q || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (q.length < 2) return [];
  const cache = CacheService.getScriptCache();
  const ck = 'ms:' + norm_(q).slice(0, 200);
  let res = null;
  try { res = JSON.parse(cache.get(ck) || 'null'); } catch (e) {}
  if (!res) {
    res = [];
    const s = muJson_('post', '/series/search', { search: q, perpage: 5 });
    ((s && s.results) || []).slice(0, 4).forEach(function (hit) {
      const rec = hit.record || {};
      if (!rec.series_id || /novel/i.test(rec.type || '')) return;
      const d = muJson_('get', '/series/' + rec.series_id) || {};
      const img = (d.image && d.image.url && (d.image.url.original || d.image.url.thumb)) || (rec.image && rec.image.url && (rec.image.url.original || rec.image.url.thumb)) || '';
      res.push({
        title: decode_(String(rec.title || d.title || '')), type: rec.type || d.type || '', year: rec.year || d.year || '',
        latest: zahl_(d.latest_chapter != null ? d.latest_chapter : rec.latest_chapter),
        completed: d.completed === true, statusText: String(d.status || '').replace(/\s+/g, ' ').slice(0, 80),
        image: img, muUrl: rec.url || d.url || ''
      });
    });
    if (!res.length) {
      (alSuche_(q) || []).slice(0, 4).forEach(function (m) {
        const t = m.title || {};
        res.push({ title: decode_(t.english || t.romaji || ''), type: m.countryOfOrigin === 'KR' ? 'Manhwa' : m.countryOfOrigin === 'CN' ? 'Manhua' : 'Manga',
          year: '', latest: m.chapters || null, completed: m.status === 'FINISHED', statusText: m.status || '',
          image: (m.coverImage && m.coverImage.large) || '', alUrl: m.siteUrl || '' });
      });
    }
    try { cache.put(ck, JSON.stringify(res), 6 * 3600); } catch (e) {}
  }
  const list = alle_();
  return res.map(function (r) {
    const n = titelNorm_(r.title);
    const hit = n && list.find(function (it) {
      return [it.title, it.dbTitle].concat(it.alt || []).filter(Boolean).some(function (a) { return titelNorm_(a) === n; });
    });
    return Object.assign({}, r, { inList: hit ? hit.title : null });
  });
}

/** Treffer als neue Serie anlegen und den Instagram-Link als erledigt markieren. */
function apiInboxHinzufuegen(key, r, igUrl) {
  check_(key);
  if (!r || !r.title) throw new Error('title');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let it;
  try {
    const n = titelNorm_(r.title);
    it = alle_().find(function (x) { return titelNorm_(x.title) === n; });
    if (!it) {
      const o = { title: String(r.title).slice(0, 120), genres: [], note: 'Idee von Instagram' + (igLink_(igUrl) ? ': ' + igLink_(igUrl) : '') };
      if (r.latest) { o.latest = Math.floor(Number(r.latest)); o.latestSince = heute_(); }
      it = anlegen_(o);
    }
  } finally { lock.releaseLock(); }
  if (igUrl) apiInboxStatus(key, igUrl, 'erledigt', r.title);
  return { title: it ? it.title : r.title, id: it ? it.id : null };
}
