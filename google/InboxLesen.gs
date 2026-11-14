/** Instagram-Ideen ohne Safari (v2.11).
 *  Nach dem Teilen (Kurzbefehl „Manga merken“) liest das Skript den Beitrag im Hintergrund selbst aus:
 *  die öffentliche Einbettungs-Seite des Beitrags liefert die Beschreibung und die Bilder; die Texterkennung
 *  (BildText.gs) liest die Bilder. Übrig bleiben nur Titel, die es bei MangaUpdates oder AniList wirklich gibt.
 *  Die App zeigt sie unter „Instagram-Ideen“ mit „Hinzufügen“ / „Nicht hinzufügen“. Angelegt wird nichts von selbst.
 *  Kostenlos: es werden nur Google-Dienste und die freien Schnittstellen von MangaUpdates und AniList benutzt. */

const IG_MAX_BILDER = 10, IG_MAX_TITEL = 12;

function igJson_(v) { try { const a = JSON.parse(String(v || '') || 'null'); return Array.isArray(a) ? a : null; } catch (e) { return null; } }

/** Einbettungs-Seite eines Beitrags holen. */
function igEinbettung_(link) {
  const r = UrlFetchApp.fetch(link + 'embed/captioned/', { muteHttpExceptions: true, followRedirects: true,
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.8' } });
  return { code: r.getResponseCode(), html: r.getContentText() };
}

/** Aus der Einbettungs-Seite: Beschreibung und Bild-Adressen (bei Beiträgen zum Durchwischen alle Bilder). */
function igAuswerten_(html) {
  html = String(html || '');
  let caption = '';
  const m = html.match(/<div class="Caption">([\s\S]*?)<div class="CaptionComments"/) || html.match(/<div class="Caption">([\s\S]*?)<\/div>/);
  if (m) {
    caption = decode_(m[1].replace(/<a class="CaptionUsername"[\s\S]*?<\/a>/, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
      .replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  const entf = function (s) {
    return String(s).replace(/\\+u([0-9a-fA-F]{4})/g, function (x, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/\\+\//g, '/').replace(/&amp;/g, '&');
  };
  const seen = {}, bilder = [];
  const nimm = function (u) {
    u = entf(u);
    if (!/^https:\/\/[^\/]+\.(?:cdninstagram\.com|fbcdn\.net)\//.test(u)) return;
    const k = u.replace(/[?#].*$/, '').split('/').pop();
    if (!k || seen[k]) return;
    seen[k] = 1; bilder.push(u);
  };
  let x; const re = /display_url\\*"\s*:\s*\\*"(https:[^"]*?)\\*"/g;
  while ((x = re.exec(html))) nimm(x[1]);
  if (!bilder.length) { const e = html.match(/<img class="EmbeddedMediaImage"[^>]*\ssrc="([^"]+)"/); if (e) nimm(e[1]); }
  // Beim Durchwischen steht das erste Bild doppelt (einmal für den Beitrag, einmal als erstes Kind): nach Dateiname schon entfernt
  return { caption: caption, bilder: bilder.slice(0, IG_MAX_BILDER), video: /is_video\\*"\s*:\s*true/.test(html), ok: !!m || bilder.length > 0 };
}

/** Ein Titelvorschlag → bester Treffer bei MangaUpdates (Kapitelstand von dort, nicht aus dem Beitrag), sonst AniList. */
function igTreffer_(q) {
  const cache = CacheService.getScriptCache();
  const ck = 'igt:' + norm_(q).slice(0, 200);
  try { const c = cache.get(ck); if (c) return JSON.parse(c); } catch (e) {}
  let out = null;
  const pass = function (titel, alt) {
    const a = titelNorm_(q);
    return [titel].concat(alt || []).filter(Boolean).reduce(function (best, t) {
      const b = titelNorm_(t);
      if (!a || !b) return best;
      if (a === b) return 1;
      const ta = toks_(q), tb = toks_(t);
      const j = ta.length && tb.length ? jacc_(ta, tb) : 0;
      const teil = (a.length >= 8 && b.indexOf(a) >= 0) || (b.length >= 8 && a.indexOf(b) >= 0) ? 0.75 : 0;
      return Math.max(best, j, teil);
    }, 0);
  };
  const s = muJson_('post', '/series/search', { search: q, perpage: 4 });
  let best = null;
  ((s && s.results) || []).forEach(function (hit) {
    const rec = hit.record || {};
    if (!rec.series_id || /novel/i.test(rec.type || '')) return;
    const p = pass(decode_(String(rec.title || '')), hit.hit_title ? [decode_(String(hit.hit_title))] : []);
    if (!best || p > best.p) best = { rec: rec, p: p };
  });
  if (best && best.p >= 0.6) {
    const rec = best.rec, d = muJson_('get', '/series/' + rec.series_id) || {};
    out = {
      title: decode_(String(rec.title || d.title || '')), type: rec.type || d.type || '', year: rec.year || d.year || '',
      latest: zahl_(d.latest_chapter != null ? d.latest_chapter : rec.latest_chapter), completed: d.completed === true,
      image: (d.image && d.image.url && (d.image.url.original || d.image.url.thumb)) || (rec.image && rec.image.url && (rec.image.url.original || rec.image.url.thumb)) || '',
      link: rec.url || d.url || '', sure: best.p >= 0.9
    };
  } else {
    let al = null, ap = 0;
    (alSuche_(q) || []).slice(0, 4).forEach(function (m) {
      const t = m.title || {};
      const p = pass(t.english || t.romaji || '', [t.romaji, t.english, t.native].concat(m.synonyms || []));
      if (p > ap) { ap = p; al = m; }
    });
    if (al && ap >= 0.6) {
      const t = al.title || {};
      out = { title: decode_(t.english || t.romaji || ''), type: al.countryOfOrigin === 'KR' ? 'Manhwa' : al.countryOfOrigin === 'CN' ? 'Manhua' : 'Manga',
        year: '', latest: al.chapters || null, completed: al.status === 'FINISHED',
        image: (al.coverImage && al.coverImage.large) || '', link: al.siteUrl || '', sure: ap >= 0.9 };
    }
  }
  try { cache.put(ck, JSON.stringify(out), 6 * 3600); } catch (e) {}
  return out;
}

/** Einen Beitrag auslesen: Beschreibung + Bildtexte → Titel, die es wirklich gibt. Gibt { cand, note } zurück. */
function igLesen_(link, html, ende) {
  let seite = html ? { code: 200, html: String(html) } : igEinbettung_(link);
  if (seite.code !== 200) return { cand: null, note: 'Fehler: Instagram antwortet mit ' + seite.code };
  const a = igAuswerten_(seite.html);
  if (!a.ok) return { cand: null, note: 'Fehler: Beitrag nicht lesbar (Instagram verlangt eine Anmeldung)' };
  const ocr = []; let ocrFehler = '';
  for (let i = 0; i < a.bilder.length; i++) {
    if (ende && Date.now() > ende) break;
    const o = bildText_(a.bilder[i]);
    if (o.text) ocr.push(o.text); else if (o.error && !ocrFehler) ocrFehler = o.error;
  }
  const namen = igKandidaten_([a.caption], ocr, true);
  const list = alle_(), cand = [], doppelt = {};
  for (let i = 0; i < namen.length && cand.length < IG_MAX_TITEL; i++) {
    if (ende && Date.now() > ende) break;
    const t = igTreffer_(namen[i]);
    if (!t || !t.title) continue;
    const n = titelNorm_(t.title);
    if (doppelt[n]) continue;
    doppelt[n] = 1;
    const hit = list.find(function (it) {
      return [it.title, it.dbTitle].concat(it.alt || []).filter(Boolean).some(function (x) { return titelNorm_(x) === n; });
    });
    cand.push({ q: namen[i], title: t.title, type: t.type, year: t.year, latest: t.latest, completed: t.completed, image: t.image, link: t.link, sure: t.sure, inList: hit ? hit.title : null, state: '' });
  }
  cand.sort(function (x, y) { return (y.sure ? 1 : 0) - (x.sure ? 1 : 0); });
  const note = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm') + ' · ' + a.bilder.length + ' Bilder, ' + ocr.length + ' mit Text'
    + (a.video ? ' · Video' : '') + (ocrFehler && !ocr.length ? ' · Texterkennung: ' + ocrFehler : '');
  return { cand: cand, note: note };
}

function igSchreiben_(sh, row, res) {
  sh.getRange(row, 5, 1, 2).setValues([[res.cand ? txt_(JSON.stringify(res.cand)) : '', txt_(res.note)]]);
}

/** Läuft im Hintergrund (eine Minute nach dem Teilen): liest alle offenen, noch nicht ausgelesenen Beiträge. */
function inboxAuslesen() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'inboxAuslesen') ScriptApp.deleteTrigger(t); });
  const ende = Date.now() + 4 * 60 * 1000;
  const sh = inboxBlatt_();
  const offen = inboxZeilen_(sh).filter(function (r) { return r.url && (!r.status || r.status === 'offen') && !r.read; });
  for (let i = 0; i < offen.length; i++) {
    if (Date.now() > ende - 60 * 1000) { planeLauf_('inboxAuslesen'); return; }
    let res;
    try { res = igLesen_(offen[i].url, null, ende); } catch (e) { res = { cand: null, note: 'Fehler: ' + String(e && e.message || e).slice(0, 160) }; }
    const id = igId_(offen[i].url);
    const jetzt = inboxZeilen_(sh).find(function (r) { return igId_(r.url) === id; });     // Zeile neu suchen: die Tabelle kann sich geändert haben
    if (jetzt) igSchreiben_(sh, jetzt.row, res);
  }
}

function igEintrag_(url) {
  const id = igId_(url); if (!id) return null;
  const sh = inboxBlatt_();
  const r = inboxZeilen_(sh).find(function (x) { return igId_(x.url) === id; });
  return r ? { sh: sh, r: r } : null;
}
function igAntwort_(r) { return { url: r.url, date: r.date, status: r.status || 'offen', title: r.title, cand: r.cand, read: r.read }; }

/** App: einen Beitrag jetzt (noch einmal) auslesen. */
function apiInboxLesen(key, url) {
  check_(key);
  const e = igEintrag_(url); if (!e) return null;
  let res;
  try { res = igLesen_(e.r.url, null, Date.now() + 4 * 60 * 1000); } catch (err) { res = { cand: null, note: 'Fehler: ' + String(err && err.message || err).slice(0, 160) }; }
  const f = igEintrag_(url); if (!f) return null;
  igSchreiben_(f.sh, f.r.row, res);
  return igAntwort_(igEintrag_(url).r);
}

/** Kurzbefehl (falls Instagram Googles Server abweist): das iPhone lädt die Einbettungs-Seite selbst und schickt sie mit. */
function apiInboxEinbettung(key, url, html) {
  check_(key);
  const msg = apiInboxNeu(key, url);
  const e = igEintrag_(url);
  if (e && html && !e.r.read) {
    let res;
    try { res = igLesen_(e.r.url, html, Date.now() + 4 * 60 * 1000); } catch (err) { res = { cand: null, note: 'Fehler: ' + String(err && err.message || err).slice(0, 160) }; }
    const f = igEintrag_(url); if (f) igSchreiben_(f.sh, f.r.row, res);
  }
  return msg;
}

/** App: einen Vorschlag hinzufügen ('add') oder ablehnen ('skip'). Sind alle entschieden, gilt der Beitrag als erledigt. */
function apiInboxWahl(key, url, i, was) {
  check_(key);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let neu = null;
  try {
    const e = igEintrag_(url); if (!e || !e.r.cand || !e.r.cand[i]) return null;
    const c = e.r.cand[i];
    if (was === 'add') {
      const n = titelNorm_(c.title);
      let it = alle_().find(function (x) { return titelNorm_(x.title) === n; });
      if (!it) {
        const o = { title: String(c.title).slice(0, 120), genres: [], note: 'Idee von Instagram: ' + e.r.url };
        if (c.latest) { o.latest = Math.floor(Number(c.latest)); o.latestSince = heute_(); }
        it = anlegen_(o);
      }
      neu = it || null;
      c.state = 'added'; c.inList = it ? it.title : c.title;
    } else if (was === 'undo') c.state = '';
    else c.state = 'skipped';
    const cand = e.r.cand, fertig = cand.every(function (x) { return x.state || x.inList; });
    const titel = cand.filter(function (x) { return x.state === 'added'; }).map(function (x) { return x.title; }).join(', ');
    e.sh.getRange(e.r.row, 3, 1, 3).setValues([[fertig ? (titel ? 'erledigt' : 'verworfen') : 'offen', txt_(titel), txt_(JSON.stringify(cand))]]);
  } finally { lock.releaseLock(); }
  return { entry: igAntwort_(igEintrag_(url).r), item: neu };
}

/* ---- Titel aus Texten herausfiltern (gleiche Regeln wie im Safari-Overlay) ---- */

const IG_NOISE = /^(manhwa|manga|manhua|webtoon|webtoons|murim|action|fantasy|romance|comedy|drama|isekai|anime|otaku|follow|like|comment|share|save|link in bio|read|reading|recommendation|recommendations|part \d+|new|top \d+)s?$/i;
// Words that describe a series (status, genre, chapter count …) – not its title
const IG_INFO = 'ongoing|completed?|finished|hiatus|on hiatus|dropped|cancell?ed|season \\d+|the end|end|new|hot|top|best|must read|' +
  'action|adventure|fantasy|dark fantasy|romance|comedy|drama|horror|thriller|mystery|psychological|tragedy|isekai|murim|martial arts?|wuxia|' +
  'regression|regressor|reincarnation|reincarnated|transmigration|revenge|system|leveling|level up|dungeons?|hunters?|harem|school life|school|slice of life|' +
  'cultivation|overpowered|op mc|op|villainess|historical|sports|sci-?fi|shounen|seinen|shoujo|josei|supernatural|magic|demons?|' +
  'manhwa|manhua|manga|webtoons?|comics?|genres?|status|chapters?|episodes?|rating|type|author|artist|art|story|published|release|summary|synopsis|' +
  'recommendation|recommendations|part \\d+|vol\\.? ?\\d+|volume \\d+';
const IG_INFO_ONLY = new RegExp('^(?:(?:' + IG_INFO + ')(?:[\\s,/&|•·+\\-:]+|$))+$', 'i');
function igIsInfo_(t) {
  if (IG_INFO_ONLY.test(t)) return true;
  if (/^\d+\+?\s*(?:ch(?:apter)?s?|chaps?|eps?|episodes?|kapitel|kap|volumes?|vols?)\b/i.test(t)) return true;       // 262 Chapters
  if (/\b(?:ch(?:apter)?s?|chaps?|eps?|episodes?|kapitel|kap)\.?\s*#?\s*\d+/i.test(t)) return true;                     // Chapter 262, Ch. 120+
  if (/^(?:genres?|status|chapters?|episodes?|rating|type|author|artist|art|story|released?|year|score|tags?)\s*[:\-–]/i.test(t)) return true;
  if (/\d+(?:[.,]\d+)?\s*\/\s*(?:10|5)\b|★|⭐|☆/.test(t)) return true;                                               // 9.5/10, stars
  const letters = (t.match(/\p{L}/gu) || []).length;
  return letters < 3 || letters < t.replace(/\s/g, '').length * 0.6;                                                   // mostly numbers or symbols
}
// Remove chapter counts, status words and phrases like "Follow for more" from a line
const IG_STATUS = 'ongoing|completed?|finished|hiatus|on hiatus|dropped|cancell?ed|end|the end|new|hot|laufend|abgeschlossen|pausiert';
const IG_CH = 'ch(?:apter)?s?|chaps?|eps?|episodes?|kapitel|kap';
function igClean_(t) {
  // The picture reader often reads the separator "|" as "I", "l" or "1": "292 CHAPTERS I COMPLETED"
  t = String(t || '').replace(new RegExp('\\s[Il1|]\\s+(?=(?:' + IG_STATUS + ')\\b)', 'gi'), ' | ')
    .replace(new RegExp('(\\b(?:' + IG_CH + '))\\s+[Il1]\\s', 'gi'), '$1 | ');
  if (/\b(may be an image|could be an image|kann ein bild|könnte ein bild|image of|photo by|foto von|photo shared by|beitrag von|reel von|video von)\b/i.test(t) && !/[„"“]/.test(t)) return '';
  t = t.replace(/\b(?:follow|folge|folgt)\s+(?:me\s+|us\s+|mir\s+|uns\s+)?(?:for|für)\s+(?:more|mehr)\b[^\n]*/gi, ' ')
    .replace(/\b(?:follow|folge|folgt)\s+@?\S+/gi, ' ')
    .replace(/\b(?:beitrag|beiträge|post|posts|reel|reels)\b/gi, ' ')
    .replace(/\b(?:end\s+of\s+(?:the\s+)?season(?:\s*\d+)?|season\s*\d*\s*(?:end|finale|ended|break)|staffel\s*\d*\s*(?:ende|finale)|ende\s+der\s+staffel|season\s*\d+)\b/gi, ' ')
    .replace(new RegExp('\\b\\d+\\+?\\s*(?:' + IG_CH + ')\\b\\.?', 'gi'), ' ')                // 308 Chapters
    .replace(new RegExp('\\b(?:' + IG_CH + ')\\.?\\s*[:#]?\\s*\\d+(?:\\.\\d+)?\\+?', 'gi'), ' ') // Chapter 308, Ch. 120+
    .replace(/[(\[]\s*[)\]]/g, ' ');
  const tail = new RegExp('[\\s\\-–—|•·:,/(\\[]+(?:' + IG_STATUS + ')[\\s)\\].!]*$', 'i');
  const head = new RegExp('^[\\s(\\[]*(?:' + IG_STATUS + ')[\\s)\\]]*[\\-–—|•·:,/]+', 'i');
  for (let k = 0; k < 4; k++) t = t.replace(tail, '').replace(head, '').replace(/\s+[|Il1]\s*$/, '');
  return t.replace(/[\s\-–—|•·:,/]+$/g, '').replace(/^[\s\-–—|•·:,/]+/g, '').replace(/\s+/g, ' ').trim();
}
const IG_TAGNOISE = /manhwa|manga|manhua|webtoon|anime|otaku|recommend|reels?|fyp|foryou|explore|viral|trend|edit|amv|follow/i;
function igKandidaten_(list, ocr, alles) {
  const c = new Map();
  const add = (t, s) => {
    t = igClean_(t);
    if (!t) return;
    t = String(t || '').replace(/[\u{1F000}-\u{1FFFF}☀-➿️]/gu, '')
      .replace(/^[\s\d.\-–—:)•*#"“„'«»]+|[\s"“”'»«.,!?:;(\-–—]+$/g, '').replace(/\s+/g, ' ').trim()
      .replace(/^(?:name|title|titel|manhwa|manga|manhua|webtoon)\s*[:\-–]\s*/i, '');
    if (t.length < 3 || t.length > 90 || IG_NOISE.test(t) || /^\d+$/.test(t) || igIsInfo_(t)) return;
    if (/\b(likes?|comments?|gefällt|kommentare)\b/i.test(t) && /\d/.test(t)) return;
    if (/\b(need to read|must read|you should|top \d+|best \w+ (?:manhwa|manga)|recommend|empfehl|part \d+)\b/i.test(t)) return;
    const k = t.toLowerCase();
    const o = c.get(k); if (o) o.s += s; else c.set(k, { t: t, s: s });
  };
  list.forEach((raw) => {
    if (!raw) return;
    let x = String(raw);
    const q = x.match(/:\s*["“]([\s\S]*)["”]\s*\.?\s*$/); if (q) x = q[1];                  // '123 likes … : "caption"'
    (x.match(/[„"“]([^"”“„]{3,80})["”“]/g) || []).forEach((m) => add(m.slice(1, -1), 3));   // quoted text on pictures
    (x.match(/(?:name|title|titel|manhwa|manga|manhua|webtoon)\s*[:\-–]\s*([^\n#|"“”„]{3,70})/ig) || []).forEach((m) => add(m.replace(/^[^:\-–]+[:\-–]\s*/, ''), 5));
    x.split(/\n|\s[|•·]\s|(?:^|\s)\d{1,2}[.)]\s/).forEach((l) => {
      l = l.replace(/#\S+/g, '').replace(/@\S+/g, '').trim();
      if (l && l.split(' ').length <= 9) add(l, 1);
    });
    (x.match(/#[\p{L}\d_]{4,40}/gu) || []).forEach((h) => {
      if (IG_TAGNOISE.test(h)) return;
      add(h.slice(1).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'), 0.5);
    });
  });
  // Text read from the pictures: single lines, and titles spread over 2-3 lines
  (ocr || []).forEach((raw) => {
    // Numbered lists ("1. Title 2. Title") often come back as one long line: one line per entry
    const lines = String(raw || '').replace(/(?:^|\s)\d{1,2}[.)]\s+(?=\p{L})/gu, '\n').replace(/\s[|•·]\s/g, '\n').split(/\n+/).map((l) => l.trim()).filter(Boolean)
      .map((l) => {
        if (!/[A-Za-z]{2}/.test(l) || /@|https?:|www\.|\.com\b/i.test(l) || /^(read|swipe|save|link in bio|read now|swipe left)\b/i.test(l)) return null;
        const c2 = igClean_(l);
        if (!c2 || igIsInfo_(c2.replace(/[^\p{L}\d\s\/.:+★⭐-]/gu, '').trim())) return null;
        // A line that had a chapter count or status removed is a complete title on its own: never join it with neighbours
        const whole = c2.replace(/\s+/g, ' ').toLowerCase() !== l.replace(/\s+/g, ' ').trim().toLowerCase();
        return whole ? { t: c2, whole: true } : c2;
      });
    const joinable = (x) => typeof x === 'string';
    lines.forEach((l, i) => {
      if (!l) return;
      if (typeof l === 'object') { add(l.t, 2.5); return; }
      const words = l.split(' ').length;
      if (words <= 9 && !(words === 1 && l.length < 5)) add(l, 1.5);
      const two = lines.slice(i, i + 2), three = lines.slice(i, i + 3);
      if (two.length === 2 && two.every((x) => joinable(x) && x.split(' ').length <= 4)) add(two.join(' '), 2);
      if (three.length === 3 && three.every((x) => joinable(x) && x.split(' ').length <= 3)) add(three.join(' '), 2.5);
    });
  });
  // Drop pieces of a title that is already suggested in full ("MOUNT HUA" next to "Return of the Mount Hua Sect")
  const all = [...c.values()].sort((a, b) => b.s - a.s || b.t.length - a.t.length);
  // Skript: alle Varianten zurückgeben – welche davon ein echter Titel ist, entscheidet der Abgleich mit MangaUpdates/AniList
  if (alles) return all.slice(0, 30).map((o) => o.t);
  const kept = [];
  all.forEach((o) => {
    const k = o.t.toLowerCase();
    if (kept.some((x) => x.t.length > o.t.length && x.t.toLowerCase().indexOf(k) >= 0)) return;
    kept.push(o);
  });
  return kept.slice(0, 14).map((o) => o.t);
}

