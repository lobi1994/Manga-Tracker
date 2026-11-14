/** Instagram-Ideen ohne Safari (v2.11).
 *  Nach dem Teilen (Kurzbefehl „Manga merken“) liest das Skript den Beitrag im Hintergrund selbst aus:
 *  die öffentliche Einbettungs-Seite des Beitrags liefert die Beschreibung und die Bilder; die Texterkennung
 *  (BildText.gs) liest die Bilder. Übrig bleiben nur Titel, die es bei MangaUpdates oder AniList wirklich gibt.
 *  Die App zeigt sie unter „Instagram-Ideen“ mit „Hinzufügen“ / „Nicht hinzufügen“. Angelegt wird nichts von selbst.
 *  Kostenlos: es werden nur Google-Dienste und die freien Schnittstellen von MangaUpdates und AniList benutzt. */

const IG_MAX_BILDER = 10;

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

/** Wie gut passt ein gelesener Text zu einem Titel (oder einem seiner anderen Namen)? 1 = gleich, ab 0,6 = ähnlich. */
function igPass_(q, namen) {
  const a = titelNorm_(q), ta = toks_(q);
  return (namen || []).filter(Boolean).reduce(function (best, t) {
    const b = titelNorm_(t);
    if (!a || !b) return best;
    if (a === b) return 1;
    const tb = toks_(t);
    const j = ta.length && tb.length ? jacc_(ta, tb) : 0;
    const teil = (a.length >= 8 && b.indexOf(a) >= 0) || (b.length >= 8 && a.indexOf(b) >= 0) ? 0.75 : 0;
    return Math.max(best, j, teil);
  }, 0);
}

/** Mehrere Titel in EINER Anfrage bei AniList suchen (v2.11.1). Vorher war es eine Anfrage pro Text mit Pause dazwischen –
 *  bei Beiträgen mit vielen Titeln reichte das nur für die ersten. Gibt pro Text den besten Treffer zurück (oder null). */
function igSucheViele_(qs) {
  const out = qs.map(function () { return null; });
  const F = 'id siteUrl countryOfOrigin status chapters title{romaji english} synonyms coverImage{medium}';
  for (let o = 0; o < qs.length; o += 10) {
    const teil = qs.slice(o, o + 10), vars = {};
    const kopf = teil.map(function (q, i) { vars['s' + i] = q; return '$s' + i + ':String'; }).join(',');
    const rumpf = teil.map(function (q, i) { return 'a' + i + ':Page(perPage:4){media(search:$s' + i + ',type:MANGA,format_not:NOVEL){' + F + '}}'; }).join(' ');
    const d = alFetch_('query(' + kopf + '){' + rumpf + '}', vars);
    if (!d) continue;
    teil.forEach(function (q, i) {
      let best = null, bp = 0;
      ((d['a' + i] && d['a' + i].media) || []).forEach(function (m) {
        const t = m.title || {};
        const p = igPass_(q, [t.english, t.romaji].concat(m.synonyms || []));
        if (p > bp) { bp = p; best = m; }
      });
      if (best && bp >= 0.6) {
        const t = best.title || {};
        out[o + i] = { p: bp, title: decode_(t.english || t.romaji || ''), type: best.countryOfOrigin === 'KR' ? 'Manhwa' : best.countryOfOrigin === 'CN' ? 'Manhua' : 'Manga',
          year: '', latest: best.chapters || null, completed: best.status === 'FINISHED', image: (best.coverImage && best.coverImage.medium) || '', link: best.siteUrl || '' };
      }
    });
  }
  return out;
}

/** „STELLAR SWORDMASTER“ → „Stellar Swordmaster“ (nur wenn der Text ganz in Großbuchstaben gelesen wurde). */
function igSchoen_(t) {
  t = String(t || '');
  if (/[a-z]/.test(t)) return t;
  const klein = /^(a|an|the|of|in|on|to|for|and|or|as|at|by|from|with|is)$/;
  return t.toLowerCase().split(' ').map(function (w, i) { return i && klein.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
}

/** Einen Beitrag auslesen: Beschreibung + Bildtexte → Titel. Gibt { cand, note, text } zurück.
 *  Reihenfolge: 1. Texte, die auf fast jedem Bild stehen (Kopfzeile, Account-Name), fliegen raus.
 *  2. Jede mögliche Titel-Variante wird zuerst mit deiner eigenen Liste verglichen (ohne Internet),
 *  3. der Rest gesammelt bei AniList gesucht. 4. Pro Bild gewinnt die längste Variante mit Treffer;
 *  was nach Titel aussieht, aber nirgends gefunden wurde, wird als „nicht gefunden“ trotzdem angeboten. */
function igLesen_(link, html, ende) {
  let seite = html ? { code: 200, html: String(html) } : igEinbettung_(link);
  if (seite.code !== 200) return { cand: null, note: 'Fehler: Instagram antwortet mit ' + seite.code };
  const a = igAuswerten_(seite.html);
  if (!a.ok) return { cand: null, note: 'Fehler: Beitrag nicht lesbar (Instagram zeigt ihn nur in der App oder nach Anmeldung)' };
  const ocr = []; let ocrFehler = '';
  for (let i = 0; i < a.bilder.length; i++) {
    if (ende && Date.now() > ende) break;
    const o = bildText_(a.bilder[i]);
    if (o.text) ocr.push(o.text); else if (o.error && !ocrFehler) ocrFehler = o.error;
  }
  // 1. Zeilen, die auf mindestens der Hälfte der Bilder stehen (ab 3 Bildern), sind kein Titel
  const zahl = {};
  ocr.forEach(function (t) { const s = {}; t.split(/\n+/).forEach(function (l) { const k = titelNorm_(l); if (k && !s[k]) { s[k] = 1; zahl[k] = (zahl[k] || 0) + 1; } }); });
  const grenze = Math.max(3, Math.ceil(ocr.length / 2));
  const oft = Object.keys(zahl).filter(function (k) { return ocr.length >= 3 && zahl[k] >= grenze; }).sort(function (x, y) { return y.length - x.length; });
  const nurKopf = function (q) {                    // besteht der Text nur aus solchen Zeilen (und Zahlen)?
    let r = ' ' + titelNorm_(q) + ' ';
    oft.forEach(function (k) { r = r.split(' ' + k + ' ').join(' '); });
    return !r.replace(/\d+/g, '').trim();
  };
  const texte = ocr;
  // Varianten je Quelle (Bild 1, Bild 2, …, Beschreibung)
  const quellen = texte.map(function (t) { return igKandidaten_([], [t], true).filter(function (q) { return !nurKopf(q); }); });
  if (a.caption) quellen.push(igKandidaten_([a.caption], [], true));
  // 2. eigene Liste
  const list = alle_(), eigen = {};
  list.forEach(function (it) { [it.title, it.dbTitle].concat(it.alt || []).filter(Boolean).forEach(function (n) { const k = titelNorm_(n); if (k && !eigen[k]) eigen[k] = it; }); });
  const fund = {}, offen = [];
  quellen.forEach(function (vs) { vs.forEach(function (q) {
    const k = titelNorm_(q); if (!k || k in fund) return;
    if (eigen[k]) fund[k] = { p: 1, mine: eigen[k] }; else { fund[k] = null; if (offen.length < 150) offen.push(q); }
  }); });
  // 3. AniList (gesammelt)
  let gesucht = 0;
  if (!(ende && Date.now() > ende)) {
    const r = igSucheViele_(offen); gesucht = offen.length;
    offen.forEach(function (q, i) { if (r[i]) fund[titelNorm_(q)] = r[i]; });
  }
  // 4. Auswahl je Quelle
  const cand = [], doppelt = {};
  const worte = function (q) { return titelNorm_(q).split(' ').filter(Boolean); };
  const ueberlappt = function (q, andere) {          // teilt mehr als die Hälfte seiner Wörter mit einem schon gewählten Text
    const n = ' ' + titelNorm_(q) + ' ', w = toks_(q);
    return andere.some(function (o) {
      const on = ' ' + titelNorm_(o) + ' ';
      if (n.indexOf(on) >= 0 || on.indexOf(n) >= 0) return true;                       // der eine steckt im anderen
      const ow = toks_(o), gem = w.filter(function (x) { return ow.indexOf(x) >= 0; }).length;
      return gem * 2 > Math.min(w.length, ow.length);                                  // oder mehr als die Hälfte der Wörter ist gleich
    });
  };
  quellen.forEach(function (vs, qi) {
    const src = qi < texte.length ? qi + 1 : 0;      // Bildnummer, 0 = Beschreibung
    const gewaehlt = [];
    vs.map(function (q) { return { q: q, f: fund[titelNorm_(q)] || null, w: worte(q).length }; })
      .filter(function (x) { return x.f && (x.f.p >= 0.9 || x.w >= 2); })
      .sort(function (x, y) { return (y.f.p >= 0.9 ? 1 : 0) - (x.f.p >= 0.9 ? 1 : 0) || y.w - x.w; })
      .forEach(function (x) {
        if (ueberlappt(x.q, gewaehlt)) return;
        gewaehlt.push(x.q);
        const f = x.f, title = f.mine ? f.mine.title : f.title, n = titelNorm_(title);
        if (doppelt[n]) return; doppelt[n] = 1;
        if (f.mine) cand.push({ q: x.q, title: title, type: '', year: '', latest: f.mine.latest, completed: false, image: f.mine.image || '', link: '', sure: true, inList: title, src: src, state: '' });
        else cand.push({ q: x.q, title: title, type: f.type, year: f.year, latest: f.latest, completed: f.completed, image: f.image, link: f.link, sure: f.p >= 0.9, inList: eigen[n] ? eigen[n].title : null, src: src, state: '' });
      });
    // nicht gefunden, sieht aber nach Titel aus: längste Varianten zuerst, höchstens 4 je Quelle (nur von Bildern)
    if (!src) return;
    let rest = 0;
    vs.filter(function (q) { return worte(q).length >= 2 && !fund[titelNorm_(q)]; })
      .sort(function (x, y) { return worte(y).length - worte(x).length; })
      .forEach(function (q) {
        if (rest >= 4 || ueberlappt(q, gewaehlt)) return;
        gewaehlt.push(q); rest++;
        const title = igSchoen_(q), n = titelNorm_(title);
        if (doppelt[n]) return; doppelt[n] = 1;
        cand.push({ q: q, title: title, type: '', year: '', latest: null, completed: false, image: '', link: '', sure: false, nohit: true, inList: null, src: src, state: '' });
      });
  });
  const note = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm') + ' · ' + a.bilder.length + ' Bilder, ' + ocr.length + ' mit Text · '
    + cand.filter(function (c) { return !c.nohit; }).length + ' Titel gefunden, ' + cand.filter(function (c) { return c.nohit; }).length + ' unklar, ' + gesucht + ' gesucht'
    + (a.video ? ' · Video' : '') + (ocrFehler && !ocr.length ? ' · Texterkennung: ' + ocrFehler : '');
  return { cand: cand.slice(0, 60), note: note, text: ocr.map(function (t, i) { return '[Bild ' + (i + 1) + ']\n' + t; }).join('\n\n').slice(0, 20000) };
}

function igSchreiben_(sh, row, res) {
  // Spalte G: der gelesene Text der Bilder – zum Nachsehen, wenn Titel fehlen
  sh.getRange(row, 5, 1, 3).setValues([[res.cand ? txt_(JSON.stringify(res.cand)) : '', txt_(res.note), txt_(res.text || '')]]);
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
  // „end“, „the end“, „new“, „hot“ nur nach einem Trennzeichen abschneiden – sonst wird aus „The Beginning After the End“ ein halber Titel
  const tail = new RegExp('(?:[\\s\\-–—|•·:,/(\\[]+(?:' + IG_STATUS.replace('|end|the end|new|hot', '') + ')|\\s*[\\-–—|•·:,/(\\[]+\\s*(?:end|the end|new|hot))[\\s)\\].!]*$', 'i');
  const head = new RegExp('^[\\s(\\[]*(?:' + IG_STATUS + ')[\\s)\\]]*[\\-–—|•·:,/]+', 'i');
  for (let k = 0; k < 4; k++) t = t.replace(tail, '').replace(head, '').replace(/\s+[|Il1]\s*$/, '');
  return t.replace(/[\s\-–—|•·:,/]+$/g, '').replace(/^[\s\-–—|•·:,/]+/g, '').replace(/\s+/g, ' ').trim();
}
const IG_TAGNOISE = /manhwa|manga|manhua|webtoon|anime|otaku|recommend|reels?|fyp|foryou|explore|viral|trend|edit|amv|follow/i;
const IG_KEIN_TEIL = /^(ongoing|completed?|finished|hiatus|dropped|cancell?ed|chapters?|episodes?|new|hot|top|best|status|rating|genres?|type|manhwa|manga|manhua|webtoons?|comics?|recommendations?|author|artist|story|art|summary|synopsis|release|published)$/i;
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
        if (!c2) return null;
        if (igIsInfo_(c2.replace(/[^\p{L}\d\s\/.:+★⭐-]/gu, '').trim())) {
          // Skript (v2.11.1): ein einzelnes Genre-Wort kann der Rest eines Titels sein („STANDARD OF“ + „REINCARNATION“).
          // Allein ist es kein Vorschlag, mit der Nachbarzeile zusammen aber schon.
          return alles && /^[A-Za-z][A-Za-z'-]{3,}$/.test(c2) && !IG_KEIN_TEIL.test(c2) ? { t: c2, weak: true } : null;
        }
        // A line that had a chapter count or status removed is a complete title on its own: never join it with neighbours
        const whole = c2.replace(/\s+/g, ' ').toLowerCase() !== l.replace(/\s+/g, ' ').trim().toLowerCase();
        return whole ? { t: c2, whole: true } : c2;
      });
    const joinable = (x) => typeof x === 'string' || !!(x && x.weak);
    const txt = (x) => typeof x === 'string' ? x : x.t;
    const fest = (g) => g.some((x) => typeof x === 'string');           // mindestens eine echte Titelzeile
    lines.forEach((l, i) => {
      if (!l) return;
      if (typeof l === 'object' && !l.weak) { add(l.t, 2.5); return; }
      if (typeof l === 'string') {
        const words = l.split(' ').length;
        if (words <= 9 && !(words === 1 && l.length < 5)) add(l, 1.5);
      }
      const two = lines.slice(i, i + 2), three = lines.slice(i, i + 3), max3 = alles ? 4 : 3;
      if (two.length === 2 && fest(two) && two.every((x) => joinable(x) && txt(x).split(' ').length <= 4)) add(two.map(txt).join(' '), 2);
      if (three.length === 3 && fest(three) && three.every((x) => joinable(x) && txt(x).split(' ').length <= max3)
        && three.map(txt).join(' ').split(' ').length <= 10) add(three.map(txt).join(' '), 2.5);
    });
  });
  // Drop pieces of a title that is already suggested in full ("MOUNT HUA" next to "Return of the Mount Hua Sect")
  const all = [...c.values()].sort((a, b) => b.s - a.s || b.t.length - a.t.length);
  // Skript: alle Varianten zurückgeben – welche davon ein echter Titel ist, entscheidet der Abgleich mit MangaUpdates/AniList
  if (alles) return all.slice(0, 60).map((o) => o.t);
  const kept = [];
  all.forEach((o) => {
    const k = o.t.toLowerCase();
    if (kept.some((x) => x.t.length > o.t.length && x.t.toLowerCase().indexOf(k) >= 0)) return;
    kept.push(o);
  });
  return kept.slice(0, 14).map((o) => o.t);
}

