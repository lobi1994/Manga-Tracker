/**
 * Manga Tracker – alles in einer Datei (Vorlage)
 * In einer neuen Google-Tabelle: Erweiterungen → Apps Script → den Inhalt von Code.gs
 * durch diese Datei ersetzen, speichern, Tabelle neu laden → Menü „Manga Tracker → Einrichten“.
 * Anleitung: https://github.com/lobi1994/Manga-Tracker/blob/main/ANLEITUNG.md
 */

/* ==================================================================== */
/* Code.gs */
/* ==================================================================== */

/**
 * Manga Tracker – Google Apps Script
 * Gehört zur Tabelle „Manga Tracker“ (Erweiterungen → Apps Script).
 *
 * Einmalig: Funktion „einrichten“ auswählen und ▶ Ausführen klicken.
 * Danach: Bereitstellen → Neue Bereitstellung → Web-App
 *         (Ausführen als: Ich · Zugriff: Jeder).
 */

// Alter fester Schlüssel (nur für ältere Installationen). Neue Installationen nutzen die Skripteigenschaft „appKey“.
const KEY = '';  // eigener Schlüssel: Menü „Manga Tracker → Einrichten“ legt ihn an

const SHEET = 'Mangas';
const HEAD = ['Kategorien', 'Titel', 'Letztes Kapitel', 'Status', 'Zuletzt gelesen', 'Link', 'Bewertung', 'Notiz', 'ID', 'Übersicht', 'Bild', 'Beschreibung', 'Beschreibung DE', 'Bildquelle',
  'Prüfung', 'Geprüft am', 'Erschienen am', 'Erschienenes Kapitel', 'Erscheinungstag', 'Benachrichtigen', 'Zurück aus Hiatus', 'Auto-Hiatus',
  'Neuestes Kapitel', 'Neuestes seit', 'Gesperrt bis', 'Quelle',
  'AniList-ID', 'AniList-Titel', 'Alternativtitel', 'Offiziell bei', 'AniList-Zuordnung', 'AniList-Link', 'Webtoon-Feed', 'Gelesen um'];
const C = { genres: 1, title: 2, chapter: 3, status: 4, lastRead: 5, url: 6, rating: 7, note: 8, id: 9, overview: 10, image: 11, desc: 12, descDe: 13, imageSrc: 14,
  check: 15, checkedAt: 16, relDate: 17, relCh: 18, relDay: 19, notify: 20, back: 21, autoHiatus: 22, latest: 23, latestSince: 24, lockedCh: 25, source: 26,
  dbId: 27, dbTitle: 28, alt: 29, official: 30, dbStatus: 31, dbUrl: 32, wtFeed: 33, readAt: 34 };
const SCHEMA = 9;
const AL = 'https://graphql.anilist.co';
const HIATUS_DAYS = 21;
const TZ = 'Europe/Berlin';
const CHECK_ST = ['Lese ich gerade', 'Hiatus', 'Marinate'];
const CAT_SHEET = 'Kategorien';
const IMG_FOLDER = 'Manga Tracker Bilder';
const UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const GENRES = ['Murim', 'Kultivation (Manhua)', 'Fantasy', 'Hunter / System / Game'];
const STATUS = ['Lese ich gerade', 'Hiatus', 'Marinate', 'Beendet', 'Abgebrochen'];
const RATINGS = ['10/10', '9/10', '8/10', '7/10', '6/10', '5/10', '4/10', '3/10', '2/10', '1/10'];
const BACKUP_FOLDER = 'Manga-Regal Sicherungen';
const KEEP_BACKUPS = 12;

/* ------------------------------------------------------------------ */
/* Einrichtung                                                         */
/* ------------------------------------------------------------------ */

function einrichten() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET) || ss.getSheets()[0];
  sh.setName(SHEET);
  const last = Math.max(sh.getLastRow(), 2);

  sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold')
    .setBackground('#1f3864').setFontColor('#ffffff');
  sh.setFrozenRows(1);

  // Bewertung als Text, damit „7/10“ nicht zu einem Datum wird
  sh.getRange(2, C.rating, 1000, 1).setNumberFormat('@');
  sh.getRange(2, C.lastRead, 1000, 1).setNumberFormat('dd.MM.yyyy');

  const list = (vals) => SpreadsheetApp.newDataValidation().requireValueInList(vals, true).setAllowInvalid(false).build();
  sh.getRange(2, C.genres, 1000, 1).clearDataValidations();      // mehrere Kategorien erlaubt
  sh.getRange(2, C.status, 1000, 1).setDataValidation(list(STATUS));
  sh.getRange(2, C.rating, 1000, 1).setDataValidation(list(RATINGS));

  // Bewertung aus den Lesezeichen übernehmen
  const ids = sh.getRange(2, C.id, last - 1, 1).getValues();
  ids.forEach((r, i) => { if (r[0] === 'dragon-devouring-mage') sh.getRange(i + 2, C.rating).setValue('7/10'); });

  [190, 380, 110, 140, 120, 320, 90, 300, 220].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  if (!sh.getFilter()) sh.getRange(1, 1, last, HEAD.length).createFilter();

  // Monatliche Sicherung: am 1. jedes Monats zwischen 8 und 9 Uhr
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'monatlicheSicherung') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('monatlicheSicherung').timeBased().onMonthDay(1).atHour(8).create();

  sicherungAnlegen_('Start');
  Logger.log('Fertig eingerichtet. Jetzt: Bereitstellen → Neue Bereitstellung → Web-App.');
}

/* ------------------------------------------------------------------ */
/* Web-App: Ansicht + Kurzbefehl                                       */
/* ------------------------------------------------------------------ */

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!schluessel_() || p.key !== schluessel_()) {
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:24px">' + msg_('noAccess') + '</p>');
  }
  if (p.add) {
    return ContentService.createTextOutput(linkEintragenNeu_(p.add)).setMimeType(ContentService.MimeType.TEXT);
  }
  if (p.latest) {
    return ContentService.createTextOutput(neuestesEintragen_(p.url || '', p.latest)).setMimeType(ContentService.MimeType.TEXT);
  }
  let t;
  try { t = HtmlService.createTemplateFromFile('Index'); } catch (err) {
    // Ohne Index-Datei (Vorlage für Freunde): zur App auf GitHub weiterleiten
    const s = setupLink_();
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:24px"><a href="' + (s ? s.page : APP_PAGE) + '" target="_top">Manga Tracker öffnen</a></p>');
  }
  t.key = schluessel_();
  t.sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  const out = t.evaluate()
    .setTitle('Manga Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  // App symbol from the GitHub page
  try { out.setFaviconUrl(APP_PAGE + 'icons/icon-192.png'); } catch (e) {}
  return out;
}

/** Wird vom Kurzbefehl aufgerufen: trägt Kapitel + heutiges Datum ein oder legt die Serie neu an. */
function linkEintragen_(url) {
  const info = urlInfo_(url);
  if (!info) return msg_('invalid');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const items = alle_();
    const m = besterTreffer_(info, items);
    if (m) {
      const patch = { lastRead: heute_(), url: info.url };
      if (info.ch != null) patch.chapter = info.ch;
      if (!m.status) patch.status = 'Lese ich gerade';
      schreiben_(m.id, patch);
      if (info.ch == null) return msg_('dateOnly', m.title);
      const lower = (m.chapter !== '' && m.chapter != null && info.ch < m.chapter) ? m.chapter : null;
      return msg_('saved', m.title, info.ch, lower);
    }
    const title = titelAusSlug_(info.slug);
    anlegen_({ title: title, chapter: info.ch, status: 'Lese ich gerade', lastRead: heute_(), url: info.url, genres: [] });
    return msg_('created', title, info.ch);
  } finally { lock.releaseLock(); }
}

/* ------------------------------------------------------------------ */
/* Schnittstelle für die Ansicht (google.script.run)                   */
/* ------------------------------------------------------------------ */

function check_(key) { const k = schluessel_(); if (!k || key !== k) throw new Error('Kein Zugriff'); }

function apiListe(key) { check_(key); return { items: alle_(), categories: kategorien_(), prefs: prefs_() }; }

function apiSpeichern(key, id, patch) {
  check_(key);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return schreiben_(id, patch); } finally { lock.releaseLock(); }
}

function apiAnlegen(key, obj) {
  check_(key);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return anlegen_(obj); } finally { lock.releaseLock(); }
}

function apiLoeschen(key, id) {
  check_(key);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = blatt_(); const r = zeile_(sh, id);
    if (r) sh.deleteRow(r);
    return true;
  } finally { lock.releaseLock(); }
}

function apiErkennen(key, url) {
  check_(key);
  const info = urlInfo_(url);
  if (!info) return null;
  const m = besterTreffer_(info, alle_());
  return { url: info.url, ch: info.ch, title: titelAusSlug_(info.slug), matchId: m ? m.id : null };
}

function apiSichern(key) { check_(key); return sicherungAnlegen_('manuell'); }

function apiSicherungen(key) {
  check_(key);
  const f = ordner_(false); if (!f) return [];
  const out = []; const it = f.getFiles();
  while (it.hasNext()) { const x = it.next(); out.push({ name: x.getName(), url: x.getUrl(), date: x.getDateCreated().getTime() }); }
  return out.sort((a, b) => b.date - a.date).slice(0, 24);
}

/* ------------------------------------------------------------------ */
/* Sicherung                                                           */
/* ------------------------------------------------------------------ */

function monatlicheSicherung() { sicherungAnlegen_('automatisch'); aufraeumen_(); }

function sicherungAnlegen_(art) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = 'Manga Tracker Sicherung ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + ' (' + art + ')';
  const copy = DriveApp.getFileById(ss.getId()).makeCopy(name, ordner_(true));
  return { name: name, url: copy.getUrl() };
}

function aufraeumen_() {
  const f = ordner_(false); if (!f) return;
  const auto = []; const it = f.getFiles();
  while (it.hasNext()) { const x = it.next(); if (/\(automatisch\)$/.test(x.getName())) auto.push(x); }
  auto.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  auto.slice(KEEP_BACKUPS).forEach(x => x.setTrashed(true));
}

function ordner_(create) {
  const it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  if (it.hasNext()) return it.next();
  return create ? DriveApp.createFolder(BACKUP_FOLDER) : null;
}

/* ------------------------------------------------------------------ */
/* Tabelle lesen / schreiben                                           */
/* ------------------------------------------------------------------ */

function blatt_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET) || ss.getSheets()[0];
  if (!blatt_.ok) {
    const props = PropertiesService.getScriptProperties();
    if (Number(props.getProperty('schema') || 0) < SCHEMA) {
      sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
      sh.getRange(2, C.genres, 1000, 1).clearDataValidations();
      sh.setColumnWidth(C.overview, 260); sh.setColumnWidth(C.image, 220); sh.setColumnWidth(C.imageSrc, 220);
      sh.setColumnWidth(C.desc, 360); sh.setColumnWidth(C.descDe, 360);
      try { sh.getRange(2, C.notify, 999, 1).insertCheckboxes(); } catch (e) {}
      sh.getRange(2, C.relDate, 999, 1).setNumberFormat('dd.MM.yyyy');
      sh.getRange(2, C.back, 999, 1).setNumberFormat('dd.MM.yyyy');
      sh.getRange(2, C.latestSince, 999, 1).setNumberFormat('dd.MM.yyyy');
      try { ss.setSpreadsheetTimeZone(TZ); } catch (e) {}
      sh.getRange(2, C.dbId, 999, 1).setNumberFormat('@');
      if (Number(props.getProperty('schema') || 0) < 8 && sh.getLastRow() > 1) {          // MangaUpdates-Reste entfernen (nicht erreichbar)
        sh.getRange(2, C.dbId, sh.getLastRow() - 1, 7).clearContent();
        const v8 = sh.getRange(2, C.source, sh.getLastRow() - 1, 1).getValues();
        v8.forEach((x, i) => { if (x[0] === 'mu') sh.getRange(i + 2, C.latest, 1, 4).setValues([['', '', '', '']]); });
      }
      if (Number(props.getProperty('schema') || 0) < 7 && sh.getLastRow() > 1) {          // „Neuestes Kapitel 1“ aus unvollständigen Übersichten verwerfen
        const v = sh.getRange(2, C.latest, sh.getLastRow() - 1, 4).getValues();
        v.forEach((x, i) => { if (x[3] === 'overview' && Number(x[0]) <= 3) sh.getRange(i + 2, C.latest, 1, 4).setValues([['', '', '', '']]); });
      }
      if (Number(props.getProperty('schema') || 0) < 6 && sh.getLastRow() > 1) sh.getRange(2, C.check, sh.getLastRow() - 1, 1).clearContent();   // Bedeutung geändert: jetzt „neuestes + 1“
      sh.getRange(2, C.checkedAt, 999, 1).setNumberFormat('dd.MM.yyyy HH:mm');
      try { const f = sh.getFilter(); if (f) f.remove(); sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), HEAD.length).createFilter(); } catch (e) {}
      props.setProperty('schema', String(SCHEMA));
    }
    blatt_.ok = true;
  }
  return sh;
}
function heute_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function wochentag_() { return Number(Utilities.formatDate(new Date(), TZ, 'u')); }   // 1 = Montag … 7 = Sonntag
function parseCheck_(v) { const m = String(v || '').match(/^(\d+)\|(\w+)(?:\|(\d{4}-\d{2}-\d{2}))?$/); return m ? { ch: Number(m[1]), st: m[2], since: m[3] || null } : null; }
function tage_(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }
function datum_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : (v ? String(v) : null); }

function alle_() {
  const sh = blatt_(); const n = sh.getLastRow() - 1; if (n < 1) return [];
  const tz = TZ;
  const d = v => v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : (v || null);
  return sh.getRange(2, 1, n, HEAD.length).getValues().filter(r => r[C.title - 1] !== '').map(r => ({
    id: String(r[C.id - 1]),
    genres: splitG_(r[C.genres - 1]),
    title: String(r[C.title - 1]),
    chapter: r[C.chapter - 1] === '' ? null : Number(r[C.chapter - 1]),
    status: r[C.status - 1] || null,
    lastRead: r[C.lastRead - 1] instanceof Date ? Utilities.formatDate(r[C.lastRead - 1], tz, 'yyyy-MM-dd') : (r[C.lastRead - 1] || null),
    url: r[C.url - 1] || null,
    rating: r[C.rating - 1] ? String(r[C.rating - 1]) : null,
    note: r[C.note - 1] || null,
    overview: r[C.overview - 1] || uebersicht_(r[C.url - 1]) || null,
    image: r[C.image - 1] || null,
    imageSrc: r[C.imageSrc - 1] || null,
    desc: r[C.desc - 1] || null,
    descDe: r[C.descDe - 1] || null,
    check: parseCheck_(r[C.check - 1]),
    checkedAt: r[C.checkedAt - 1] instanceof Date ? r[C.checkedAt - 1].getTime() : null,
    relDate: d(r[C.relDate - 1]),
    relCh: r[C.relCh - 1] === '' ? null : Number(r[C.relCh - 1]),
    relDay: r[C.relDay - 1] === '' ? null : Number(r[C.relDay - 1]),
    notify: r[C.notify - 1] === true,
    back: d(r[C.back - 1]),
    autoHiatus: r[C.autoHiatus - 1] ? String(r[C.autoHiatus - 1]).split('|')[0] : null,
    latest: r[C.latest - 1] === '' ? null : Number(r[C.latest - 1]),
    latestSince: d(r[C.latestSince - 1]),
    lockedCh: r[C.lockedCh - 1] === '' ? null : Number(r[C.lockedCh - 1]),
    source: r[C.source - 1] ? String(r[C.source - 1]) : null,
    dbId: r[C.dbId - 1] ? String(r[C.dbId - 1]) : null,
    dbTitle: r[C.dbTitle - 1] || null,
    alt: r[C.alt - 1] ? String(r[C.alt - 1]).split(' | ').filter(Boolean) : [],
    official: r[C.official - 1] || null,
    dbStatus: r[C.dbStatus - 1] || null,
    dbUrl: r[C.dbUrl - 1] || null,
    wtFeed: r[C.wtFeed - 1] || null,
    readAt: Number(r[C.readAt - 1]) || 0
  })).map(it => { it.next = naechstesKapitel_(it); return it; });
}

function zeile_(sh, id) {
  const n = sh.getLastRow() - 1; if (n < 1) return 0;
  const ids = sh.getRange(2, C.id, n, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return 0;
}

/** Text von außen (fremde Seiten, AniList, App) nie als Formel in die Tabelle schreiben:
 *  beginnt er mit = (oder + / - ohne reine Zahl zu sein), wird ein ' vorangestellt. Beim Lesen ist das ' unsichtbar. */
function txt_(v) {
  return typeof v === 'string' && /^(=|[+\-](?!\d+(?:[.,]\d+)?$)|@)/.test(v) ? "'" + v : v;
}

function zelle_(field, v) {
  if (v === null || v === undefined) return '';
  if (field === 'genres') return txt_(Array.isArray(v) ? v.join(', ') : String(v));
  if (field === 'notify') return v === true;
  if ((field === 'lastRead' || field === 'relDate' || field === 'back' || field === 'latestSince') && v) { const [y, m, d] = String(v).split('-').map(Number); return new Date(y, m - 1, d); }
  return txt_(v);
}

function schreiben_(id, patch) {
  const sh = blatt_(); const r = zeile_(sh, id);
  if (!r) throw new Error('Serie nicht gefunden – lade die Liste neu.');
  if (patch.url && !patch.overview && !sh.getRange(r, C.overview).getValue()) {
    const old = sh.getRange(r, C.url).getValue();
    const ov = (old && urlInfo_(old) && urlInfo_(old).ch == null) ? old : (uebersicht_(old) || uebersicht_(patch.url));
    if (ov) sh.getRange(r, C.overview).setValue(txt_(ov));
  }
  if ('image' in patch && !('imageSrc' in patch)) patch.imageSrc = '';
  if ('dbUrl' in patch) {
    const mid = dbIdAusLink_(patch.dbUrl);
    if (patch.dbUrl && !mid) throw new Error('allink');
    if (mid) { const det = alById_(mid); if (!det) throw new Error('allink'); Object.assign(patch, alFelder_(det, 'bestätigt')); if (sh.getRange(r, C.source).getValue() === 'none') { patch.source = ''; patch.latestSince = ''; planeLauf_('neuesteErmitteln'); } }
    else Object.assign(patch, { dbId: '', dbTitle: '', alt: '', official: '', dbStatus: 'keine', dbUrl: '', wtFeed: '' });
  }
  if ('chapter' in patch && patch.chapter != null && patch.chapter !== '') {
    const row = sh.getRange(r, 1, 1, HEAD.length).getValues()[0];
    const newCh = Math.floor(Number(patch.chapter));
    const L = row[C.latest - 1] === '' ? null : Number(row[C.latest - 1]);
    const pc = parseCheck_(row[C.check - 1]);
    const isWt = row[C.source - 1] === 'webtoon';                                   // Webtoon-Folgen sind anders nummeriert
    if (!isWt && L != null && newCh > L) {
      // Du hast ein Kapitel gelesen, das die Prüfung noch nicht kannte → es ist neu erschienen.
      if (pc && newCh >= pc.ch && (pc.st === 'no' || pc.st === 'locked')) { patch.relDate = heute_(); patch.relCh = newCh; patch.relDay = wochentag_(); }
      patch.latest = newCh; patch.latestSince = heute_(); patch.check = ''; patch.lockedCh = '';
    }
    if (Number(patch.chapter) !== Number(row[C.chapter - 1])) patch.back = '';   // gelesen → Markierung weg
    // Automatisch gesetzter Hiatus: wenn du weiterliest, zurück auf „Lese ich gerade“
    if (newCh > Number(row[C.chapter - 1] || 0) && row[C.status - 1] === 'Hiatus' && row[C.autoHiatus - 1] && !('status' in patch)) { patch.status = 'Lese ich gerade'; patch.autoHiatus = ''; }
  }
  if ('status' in patch && patch.status !== 'Hiatus') patch.back = '';
  // Uhrzeit des Lesens (nur für die Sortierung): wenn sich Kapitel oder Lesedatum ändern
  if (patch.lastRead || ('chapter' in patch)) {
    const old = sh.getRange(r, C.chapter, 1, 3).getValues()[0];
    const oldDate = old[2] instanceof Date ? Utilities.formatDate(old[2], TZ, 'yyyy-MM-dd') : String(old[2] || '');
    if (('chapter' in patch && String(patch.chapter ?? '') !== String(old[0])) || (patch.lastRead && patch.lastRead !== oldDate)) patch.readAt = Date.now();
  }
  Object.keys(patch).forEach(k => { if (C[k] && k !== 'id') sh.getRange(r, C[k]).setValue(zelle_(k, patch[k])); });
  return alle_().find(x => x.id === id);
}

function anlegen_(o) {
  const sh = blatt_(); const items = alle_();
  if (!o.overview && o.url) o.overview = uebersicht_(o.url);
  if (o.lastRead) o.readAt = Date.now();
  let id = slug_(o.title); if (items.some(x => x.id === id)) id += '-' + Date.now().toString(36);
  const row = HEAD.map((h, i) => {
    const k = Object.keys(C).find(key => C[key] === i + 1);
    return k === 'id' ? id : zelle_(k, o[k]);
  });
  sh.appendRow(row);
  if (!o.image && !o.desc && !o.descDe) planeImport_();
  planeLauf_('neuesteErmitteln');
  planeLauf_('anilistZuordnen');
  return alle_().find(x => x.id === id);
}

function slug_(t) {
  return String(t).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || ('m-' + Date.now());
}

/* ------------------------------------------------------------------ */
/* Link-Erkennung                                                      */
/* ------------------------------------------------------------------ */

const STOP = ['the', 'a', 'an', 'of', 'to', 'in', 'is', 'as', 'and', 's', 'manga', 'manhwa', 'manhua', 'online', 'read', 'eng', 'en', 'li', 'series', 'webtoon', 'comic', 'comics'];
const GENERIC = ['manga', 'manhua', 'manhwa', 'webtoon', 'comics', 'comic', 'series', 'read', 'reader', 'en', 'chapter', 'manga4'];

function norm_(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/['’`]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}
function toks_(s) { return norm_(s).split(' ').filter(w => w && STOP.indexOf(w) < 0); }

function urlInfo_(u) {
  u = String(u || '').trim();
  const m0 = u.match(/^https?:\/\/([^\/?#]+)([^?#]*)/i); if (!m0) return null;
  const host = m0[1].toLowerCase().replace(/^(www\d*|w\d+|m|read)\./, '');
  let path; try { path = decodeURIComponent(m0[2]); } catch (e) { path = m0[2]; }
  let ch = null;
  const m = path.match(/chapter[-_\/ ]?(\d+(?:[.-]\d+)?)/i) || path.match(/\/ch[-_]?(\d+)/i) || path.match(/episode[-_]?(\d+)/i) || path.match(/\/(\d{1,4})_[0-9]{6,}/);
  if (m) ch = parseFloat(m[1].replace('-', '.'));
  let segs = path.split('/').filter(Boolean).map(s => s.replace(/[-_]?chapter[-_]?\d.*$/i, '').replace(/-[0-9a-f]{6,8}$/i, '').replace(/-(manhwa|series)$/i, '').replace(/_\d+$/, ''));
  segs = segs.filter(s => s && GENERIC.indexOf(s.toLowerCase()) < 0 && !/^\d+$/.test(s) && !/^ch\d/i.test(s) && s.length > 2);
  let slug = segs.sort((a, b) => b.length - a.length)[0] || '';
  let fromHost = false;
  if (!slug) { slug = host.split('.')[0]; fromHost = true; }
  return { url: u, host: host, slug: slug, ch: ch, fromHost: fromHost };
}

function jacc_(a, b) {
  if (!a.length || !b.length) return 0;
  const B = {}; b.forEach(x => B[x] = 1);
  const A = {}; a.forEach(x => A[x] = 1);
  let i = 0; Object.keys(A).forEach(x => { if (B[x]) i++; });
  return i / Math.max(Object.keys(A).length, Object.keys(B).length);
}

function besterTreffer_(info, items) {
  const st = toks_(info.slug.replace(/-/g, ' '));
  const flat = norm_(info.slug).replace(/ /g, '');
  let best = null, bs = 0;
  items.forEach(it => {
    let s = jacc_(st, toks_(it.title));
    if (it.url) {
      const i2 = urlInfo_(it.url);
      if (i2) {
        if (i2.slug && norm_(i2.slug) === norm_(info.slug) && (!info.fromHost || i2.host === info.host)) s = Math.max(s, 1);
        else s = Math.max(s, jacc_(st, toks_(i2.slug.replace(/-/g, ' '))));
      }
    }
    const tf = norm_(it.title).replace(/ /g, '');
    if (flat.length > 6 && (tf.indexOf(flat) >= 0 || flat.indexOf(tf) >= 0)) s = Math.max(s, 0.9);
    if (s > bs) { bs = s; best = it; }
  });
  return bs >= 0.5 ? best : null;
}

function titelAusSlug_(slug) {
  return String(slug).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
}

/* ------------------------------------------------------------------ */
/* Nächstes Kapitel + Kapitelübersicht                                 */
/* ------------------------------------------------------------------ */

/** Einmal ausführen, damit Google den Zugriff auf externe Seiten erlaubt. */
function berechtigungen() { UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true }); Logger.log('Berechtigung erteilt.'); }

function teile_(u) {
  const m = String(u || '').trim().match(/^(https?:\/\/[^\/?#]+)([^?#]*)/i);
  return m ? { origin: m[1], host: m[1].replace(/^https?:\/\//i, '').toLowerCase(), path: m[2] || '/' } : null;
}

/** Kapitelübersicht aus einem Link ableiten (Link ohne Kapitel = schon die Übersicht). */
function uebersicht_(u) {
  const t = teile_(u); if (!t) return null;
  const info = urlInfo_(u);
  if (info && info.ch == null && !/\/ch\d/i.test(t.path)) return String(u).trim();
  let segs = t.path.split('/').filter(Boolean);
  let i = segs.findIndex(s => /^chapter$/i.test(s) || /^chapter[-_]?\d/i.test(s) || /^ch[-_]?\d/i.test(s) || /[-_]chapter[-_]?\d/i.test(s) || /^episode/i.test(s));
  if (i < 0) return t.origin + '/';
  const seg = segs[i];
  let keep = segs.slice(0, i);
  if (/[-_]chapter[-_]?\d/i.test(seg) && !/^chapter/i.test(seg)) {
    const slug = seg.replace(/[-_]chapter[-_]?\d.*$/i, '');
    if (keep[0] === 'reader') keep = ['manga', slug];            // mgeko
  }
  if (keep[0] === 'read' && t.host.indexOf('roliascan') >= 0) keep[0] = 'manga';
  if (keep[0] === 'reader') keep = [];
  const meaningful = keep.filter(s => GENERIC.indexOf(s.toLowerCase()) < 0 && s !== 'en');
  if (!meaningful.length) return t.origin + '/';
  const madara = /^(manga|webtoon|manhua)$/i.test(keep[0] || '');
  return t.origin + '/' + keep.join('/') + (madara || /\/$/.test(t.path) ? '/' : '');
}

/** Link zum nächsten Kapitel bauen – null, wenn das bei dieser Seite nicht geht. */
function naechstesKapitel_(it) {
  if (it.chapter == null || it.chapter === '') return null;
  return kapitelLink_(it, Math.floor(Number(it.chapter)) + 1);
}

/** Link zu Kapitel n bauen – null, wenn das bei dieser Seite nicht geht. */
function kapitelLink_(it, n) {
  if (n == null) return null;
  const u = String(it.url || '').trim();
  const info = urlInfo_(u);
  if (info && info.ch != null) {
    const re = /(chapter[-_\/ ]?)(\d+(?:[.-]\d+)?)/i;
    if (re.test(u)) return u.replace(re, (m, a) => a + n);
    return null;                                                  // z. B. roliascan /ch83-123456/ – Kapitel-ID unbekannt
  }
  const base = it.overview || u; const t = teile_(base); if (!t) return null;
  const segs = t.path.split('/').filter(Boolean);
  const clean = t.origin + '/' + segs.join('/');
  if (/asura/.test(t.host) && /^(comics|series)$/.test(segs[0] || '') && segs.length >= 2) return clean + '/chapter/' + n;
  if (/vortexscans/.test(t.host) && segs[0] === 'series' && segs.length >= 2) return clean + '/chapter-' + n;
  if (/^(manga|webtoon|manhua)$/i.test(segs[0] || '') && segs.length >= 2 && !/roliascan|mangadex/.test(t.host)) return clean + '/chapter-' + n + '/';
  return null;
}

/* ------------------------------------------------------------------ */
/* Kapitelprüfung (3× täglich + manuell) und E-Mail                    */
/* ------------------------------------------------------------------ */

/** Einmal ausführen: richtet Prüfung um 8, 12, 17 und 23:30 Uhr und die Mail um 18 Uhr ein und prüft sofort. */
function pruefungEinrichten() {
  ScriptApp.getProjectTriggers().forEach(t => { if (['kapitelPruefen', 'mailSenden'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  [[8, 0], [12, 0], [17, 0], [23, 30]].forEach(([h, m]) => ScriptApp.newTrigger('kapitelPruefen').timeBased().everyDays(1).atHour(h).nearMinute(m).inTimezone(TZ).create());
  ScriptApp.newTrigger('mailSenden').timeBased().everyDays(1).atHour(18).nearMinute(0).inTimezone(TZ).create();
  Logger.log('Prüfzeiten eingerichtet. Jetzt wird für jede Serie das neueste Kapitel ermittelt …');
  neuesteErmitteln();
}

function kapitelPruefen() { pruefe_(null); }

/** Manuell aus der App: alle (ids leer) oder einzelne Serien prüfen. */
function apiPruefen(key, ids) {
  check_(key);
  const res = pruefe_(ids && ids.length ? ids : null, { budget: 100 * 1000 });
  return { result: res, items: alle_() };
}

const LOCK_RE = /\b(early access|unlock (?:this|the) chapter|chapter (?:is )?(?:currently )?locked|locked chapter|premium chapter|coins? to (?:read|unlock)|purchase (?:this )?chapter|buy (?:this )?chapter|subscribe to (?:read|unlock)|vip (?:only|chapter)|only for (?:members|subscribers|premium))\b/i;

/** 'free' | 'locked' | 'no' | 'unknown' */
function klassifiziere_(r, n) {
  if (!r) return 'unknown';
  const code = r.getResponseCode();
  const hasN = s => new RegExp('chapter[\\s\\-_:#\\/]*0*' + n + '(?![0-9])', 'i').test(s || '');
  if (code === 404 || code === 410) return 'no';
  if (code >= 300 && code < 400) { const h = r.getHeaders(); const loc = h['Location'] || h['location'] || ''; return hasN(loc) ? 'free' : 'no'; }
  if (code !== 200) return 'unknown';
  const body = r.getContentText().slice(0, 400000);
  if (!hasN(body)) return 'no';
  return LOCK_RE.test(body) ? 'locked' : 'free';
}

function fopt_(u, ref) { return { url: u, muteHttpExceptions: true, followRedirects: false, validateHttpsCertificates: false, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.8', 'Referer': ref || u } }; }

/** Prüft eine Kapitelnummer per Link (mit Zwischenspeicher für diesen Lauf). */
function sonde_(it, cache) {
  return c => {
    const u = kapitelLink_(it, c); if (!u) return 'unknown';
    if (cache[u]) return cache[u];
    let r = null; try { r = UrlFetchApp.fetch(u, fopt_(u, it.overview)); } catch (e) {}
    return (cache[u] = klassifiziere_(r, c));
  };
}

/** Höchste Kapitelnummer aus der Kapitelübersicht (auch nachgeladene Listen). */
function maxAusUebersicht_(it) {
  const ov = String(it.overview || '').trim(); const t = teile_(ov); if (!t) return null;
  const segs = t.path.split('/').filter(Boolean); const slug = segs.length ? segs[segs.length - 1] : '';
  const get = (u, o) => { try { const r = UrlFetchApp.fetch(u, Object.assign({ muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: false, headers: { 'User-Agent': UA, 'Referer': ov, 'X-Requested-With': 'XMLHttpRequest' } }, o || {})); return r.getResponseCode() === 200 ? r.getContentText() : ''; } catch (e) { return ''; } };
  const html = get(ov);
  let m = maxKap_(html, slug);
  if (m == null && /^(manga|webtoon|manhua)$/i.test(segs[0] || '')) {                 // Madara-Seiten laden die Liste nach
    m = maxKap_(get(ov.replace(/\/?$/, '/') + 'ajax/chapters/', { method: 'post', payload: {} }), slug);
    if (m == null) {
      const id = (html.match(/(?:manga_id|data-id|"postid"|postid-)["'\s:=]*["']?(\d{2,})/) || [])[1];
      if (id) m = maxKap_(get(t.origin + '/wp-admin/admin-ajax.php', { method: 'post', payload: { action: 'manga_get_chapters', manga: id } }), slug);
    }
  }
  return m;
}
function maxKap_(html, slug) {
  if (!html) return null;
  let best = null; const re = /href\s*=\s*["']([^"']+)["']/gi; let a;
  while ((a = re.exec(html))) {
    const h = a[1]; if (slug && h.indexOf(slug) < 0) continue;
    const m = h.match(/(?:chapter[-_\/]?|\/ch[-_]?|episode[-_]?)(\d{1,5})(?:[-_.]\d+)?(?:[\/?#-]|$)/i); if (!m) continue;
    const n = Number(m[1]); if (n > 0 && n < 20000 && (best == null || n > best)) best = n;
  }
  return best;
}

/** Galopp + binäre Suche: höchstes vorhandenes Kapitel ab lo (lo existiert). */
function galopp_(lo, probe) {
  let step = 1, hi = null;
  for (let k = 0; k < 12; k++) { const s = probe(lo + step); if (s === 'unknown') return lo; if (s === 'no') { hi = lo + step; break; } lo += step; step *= 2; }
  if (hi == null) return lo;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); const s = probe(mid); if (s === 'unknown') return lo; if (s === 'no') hi = mid; else lo = mid; }
  return lo;
}

/** Erstmals das neueste Kapitel einer Serie bestimmen. */
function baseline_(it) {
  const cache = {}; const probe = sonde_(it, cache);
  const exists = s => s === 'free' || s === 'locked';
  let M = maxAusUebersicht_(it);
  const userCh = (it.chapter != null && it.chapter !== '') ? Math.floor(Number(it.chapter)) : null;
  if (M != null && (M <= 3 || (userCh != null && M < userCh))) M = null;        // unvollständige Übersicht (z. B. nur „Kapitel 1“)
  const muFb = () => { const W = it.wtFeed && dbOk_(it) ? wtNeueste_(it.wtFeed) : null; return W != null ? { latest: W, locked: null, nextSt: 'no', source: 'webtoon' } : { source: 'none' }; };
  const buildable = !!kapitelLink_(it, 1);
  if (!buildable) return M ? { latest: M, locked: null, nextSt: 'no', source: 'overview' } : muFb();
  let lo = null;
  if (M && exists(probe(M))) lo = M;
  if (lo == null && it.chapter != null && it.chapter !== '') { const c = Math.floor(Number(it.chapter)); if (c > 0 && exists(probe(c))) lo = c; }
  if (lo == null) return M ? { latest: M, locked: null, nextSt: 'no', source: 'overview' } : muFb();
  let top = galopp_(lo, probe);
  for (let g = 0; g < 2 && exists(probe(top + 2)); g++) top = galopp_(top + 2, probe);   // Lücken in der Nummerierung
  let c = top, k = 0;
  while (k < 8 && probe(c) === 'locked') { c--; k++; }                                    // gesperrte Vorab-Kapitel überspringen
  return { latest: c, locked: c < top ? top : null, nextSt: c < top ? 'locked' : 'no', source: 'link' };
}

function planeLauf_(fn) {
  try {
    if (ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === fn)) return;
    ScriptApp.newTrigger(fn).timeBased().after(60 * 1000).create();
  } catch (e) {}
}

/** Einmal (über pruefungEinrichten) – ermittelt für alle Serien das neueste Kapitel und macht bei Zeitablauf selbst weiter. */
function neuesteErmitteln() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'neuesteErmitteln') ScriptApp.deleteTrigger(t); });
  const props = PropertiesService.getScriptProperties();
  const running = Number(props.getProperty('baseRunning') || 0);
  if (running && Date.now() - running < 7 * 60 * 1000) { planeLauf_('neuesteErmitteln'); return; }
  props.setProperty('baseRunning', String(Date.now()));
  try {
    const r = baselineLauf_(Date.now(), 4.5 * 60 * 1000, null);
    if (!r.done) { planeLauf_('neuesteErmitteln'); Logger.log('Pause – geht in einer Minute automatisch weiter. Bisher ermittelt: ' + r.count + ', noch offen: ' + r.left); }
    else Logger.log('Fertig. Neuestes Kapitel ermittelt für ' + r.count + ' Serien in diesem Lauf. Ab jetzt läuft die Prüfung 4× täglich.');
  } finally { props.deleteProperty('baseRunning'); }
}

function baselineLauf_(start, budget, want) {
  const today = heute_();
  const todo = alle_().filter(it => it.latest == null && (!want || want[it.id]) &&
    !(it.source === 'none' && it.latestSince && tage_(it.latestSince, today) < 7));            // Fehlschläge nur wöchentlich neu versuchen
  let count = 0;
  for (let k = 0; k < todo.length; k++) {
    if (Date.now() - start > budget) return { done: false, count: count, left: todo.length - k };
    const it = todo[k]; const b = baseline_(it);
    const lock = LockService.getScriptLock(); lock.waitLock(30000);
    try {
      const sh = blatt_(); const r = zeile_(sh, it.id); if (!r) continue;
      const blk = sh.getRange(r, C.check, 1, C.source - C.check + 1).getValues()[0];
      const set = (f, v) => { blk[C[f] - C.check] = zelle_(f, v); };
      set('source', b.source); set('latestSince', today); set('checkedAt', new Date());
      if (b.latest != null) { set('latest', b.latest); set('lockedCh', b.locked || ''); set('check', (b.latest + 1) + '|' + b.nextSt + '|' + today); count++; }
      sh.getRange(r, C.check, 1, blk.length).setValues([blk]);
    } finally { lock.releaseLock(); }
  }
  return { done: true, count: count, left: 0 };
}

/** Regelmäßige Prüfung: gibt es ein Kapitel nach dem neuesten bekannten? */
function pruefe_(ids, opts) {
  opts = opts || {};
  const start = Date.now(), budget = opts.budget || 4.5 * 60 * 1000;
  const want = ids ? ids.reduce((o, id) => { o[id] = 1; return o; }, {}) : null;
  const all = alle_().filter(it => !want || want[it.id]);
  const today = heute_(), wd = wochentag_();
  const res = { checked: 0, free: 0, locked: 0, released: 0, hiatus: 0, back: 0, baselined: 0 };
  const out = {};                                                     // id → { st, top, lk }

  // 1) Serien mit baubarem Kapitel-Link: Kapitel „neuestes + 1“ abrufen
  const linkIt = all.filter(it => it.latest != null && it.source === 'link' && kapitelLink_(it, it.latest + 1));
  for (let k = 0; k < linkIt.length; k += 15) {
    if (Date.now() - start > budget * 0.6) break;
    const batch = linkIt.slice(k, k + 15);
    let resp;
    try { resp = UrlFetchApp.fetchAll(batch.map(it => fopt_(kapitelLink_(it, it.latest + 1), it.overview))); }
    catch (e) { resp = batch.map(it => { const u = kapitelLink_(it, it.latest + 1); try { return UrlFetchApp.fetch(u, fopt_(u, it.overview)); } catch (e2) { return null; } }); }
    batch.forEach((it, i) => { out[it.id] = { st: klassifiziere_(resp[i], it.latest + 1), it: it }; });
  }
  // Nachfassen: bei neuem Kapitel weiter hochzählen, bei „nicht da“ eine Nummer überspringen (Lücken)
  Object.keys(out).forEach(id => {
    const o = out[id], it = o.it; if (Date.now() - start > budget * 0.8) return;
    const probe = sonde_(it, {}); const L = it.latest;
    let first = o.st;
    if (first === 'no' && probe(L + 2) === 'free') { first = 'free'; o.gap = true; }
    if (first === 'free') {
      let top = o.gap ? L + 2 : L + 1, lk = null;
      for (let g = 0; g < 40; g++) { const s = probe(top + 1); if (s === 'free') top++; else { if (s === 'locked') lk = top + 1; break; } }
      o.st = 'free'; o.top = top; o.lk = lk;
    } else if (first === 'locked') o.lk = L + 1;
  });
  // 2) Serien ohne baubaren Link: Kapitelübersicht erneut lesen
  all.filter(it => it.latest != null && it.source === 'overview').forEach(it => {
    if (Date.now() - start > budget * 0.8) return;
    let M = maxAusUebersicht_(it); if (M != null && M < it.latest) M = null;
    out[it.id] = M == null ? { st: 'unknown', it: it } : (M > it.latest ? { st: 'free', top: M, it: it } : { st: 'no', it: it });
  });

  // 2b) Serien, deren Seite Google sperrt: neue Folgen über den offiziellen WEBTOON-Feed
  all.filter(it => it.latest != null && it.source === 'webtoon' && it.wtFeed).forEach(it => {
    if (Date.now() - start > budget * 0.8) return;
    const L = wtNeueste_(it.wtFeed);
    out[it.id] = L == null ? { st: 'unknown', it: it } : (L > it.latest ? { st: 'free', top: L, it: it } : { st: 'no', it: it });
  });

  // 3) Ergebnisse schreiben – Sperre nur kurz pro Serie, damit Speichern in der App nicht warten muss
  const sh = blatt_();
  Object.keys(out).forEach(id => {
    const lock = LockService.getScriptLock(); lock.waitLock(30000);
    try {
      const o = out[id], it = o.it;
      const r = zeile_(sh, id); if (!r) return;
      const row = sh.getRange(r, 1, 1, HEAD.length).getValues()[0];
      const L = row[C.latest - 1] === '' ? null : Number(row[C.latest - 1]);
      if (L == null || L !== it.latest) return;                                   // inzwischen geändert
      const prev = parseCheck_(row[C.check - 1]) || {};
      const blk = row.slice(C.check - 1, C.source);
      const set = (f, v) => { blk[C[f] - C.check] = zelle_(f, v); };
      const status = row[C.status - 1]; const rating = parseInt(row[C.rating - 1], 10) || 0;
      let newStatus = null; let st = o.st;
      set('checkedAt', new Date());
      if (st === 'free' && o.top > L) {
        if (prev.ch === L + 1 && (prev.st === 'no' || prev.st === 'locked')) {    // echte Neuerscheinung seit letzter Prüfung
          set('relDate', today); set('relCh', o.top); set('relDay', wd); res.released++;
          if (status === 'Hiatus' && rating >= 4) { set('back', today); res.back++; }   // S, A, B oder C
        }
        set('latest', o.top); set('latestSince', today); set('lockedCh', o.lk || '');
        set('check', (o.top + 1) + '|' + (o.lk ? 'locked' : 'no') + '|' + today);
        res.free++;
      } else if (st === 'locked' || st === 'no') {
        const since = (prev.ch === L + 1 && prev.st === st && prev.since) ? prev.since : today;
        set('check', (L + 1) + '|' + st + '|' + since); set('lockedCh', st === 'locked' ? (o.lk || L + 1) : '');
        if (st === 'locked') res.locked++;
        if (status === 'Lese ich gerade') {
          // Spätestes mögliches Datum des neuesten Kapitels
          const cands = [datum_(row[C.latestSince - 1])];
          if (datum_(row[C.relDate - 1]) && Number(row[C.relCh - 1]) === L) cands.push(datum_(row[C.relDate - 1]));
          if (row[C.chapter - 1] !== '' && Number(row[C.chapter - 1]) >= L) cands.push(datum_(row[C.lastRead - 1]));
          const ref = cands.filter(Boolean).sort()[0];
          const ahCh = Number(String(row[C.autoHiatus - 1] || '').split('|')[1] || 0);
          if (ref && tage_(ref, today) > HIATUS_DAYS && ahCh !== L + 1) { newStatus = 'Hiatus'; set('autoHiatus', today + '|' + (L + 1)); res.hiatus++; }
        }
      }
      sh.getRange(r, C.check, 1, blk.length).setValues([blk]);
      if (newStatus) sh.getRange(r, C.status).setValue(newStatus);
      res.checked++;
    } finally { lock.releaseLock(); }
  });

  // 4) Übrige Zeit: neue Serien erstmals erfassen
  if (Date.now() - start < budget * 0.85) res.baselined = baselineLauf_(start, budget, want).count;
  return res;
}

const MAIL = {
  en: { subject: n => 'Manga Tracker: ' + n + ' new chapter' + (n === 1 ? '' : 's'), intro: 'New chapters:', back: 'back from hiatus', yest: 'yesterday evening', wt: 'new episode on WEBTOON', ch: 'chapter', read: 'Read', ov: 'Overview', test: 'Test – this is what your daily email looks like.', none: 'No series has email notifications switched on yet.' },
  de: { subject: n => 'Manga Tracker: ' + n + ' neue' + (n === 1 ? 's Kapitel' : ' Kapitel'), intro: 'Neu erschienen:', back: 'zurück aus Hiatus', yest: 'gestern Abend', wt: 'neue Folge auf WEBTOON', ch: 'Kapitel', read: 'Lesen', ov: 'Übersicht', test: 'Test – so sieht deine tägliche Mail aus.', none: 'Bei noch keiner Serie ist die E-Mail-Benachrichtigung eingeschaltet.' }
};

/** Täglich 18 Uhr: alle Serien mit Häkchen, deren neues Kapitel heute erschienen ist. */
function mailSenden() {
  const today = heute_();
  const yest = Utilities.formatDate(new Date(Date.now() - 864e5), TZ, 'yyyy-MM-dd');
  const props = PropertiesService.getScriptProperties();
  const sent = JSON.parse(props.getProperty('mailed') || '{}');
  const list = alle_().filter(it => it.notify && (it.relDate === today || it.relDate === yest) && sent[it.id] !== it.relDate + '|' + it.relCh);
  if (!list.length) return;
  mailBauen_(list, false);
  list.forEach(it => sent[it.id] = it.relDate + '|' + it.relCh);
  props.setProperty('mailed', JSON.stringify(sent));
}

/** Zum Ausprobieren: schickt sofort eine Beispiel-Mail. */
function testMail() {
  const all = alle_().filter(it => it.notify);
  mailBauen_(all.slice(0, 3), true);
}

function mailBauen_(list, test) {
  const L = MAIL[prefs_().lang === 'de' ? 'de' : 'en'];
  const to = Session.getEffectiveUser().getEmail();
  const esc = x => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rows = list.map(it => {
    const wt = it.source === 'webtoon';
    const n = it.relCh || (Math.floor(Number(it.chapter || 0)) + 1);
    const link = wt ? String(it.wtFeed || '').replace('/rss?', '/list?') : (kapitelLink_(it, n) || it.overview || it.url);
    const extra = (it.back ? ' 🔥 ' + L.back : '') + (it.relDate && it.relDate !== heute_() ? ' (' + L.yest + ')' : '');
    const what = wt ? L.wt : L.ch + ' ' + n;
    return { html: '<li style="margin:0 0 10px"><b>' + esc(it.title) + '</b> – ' + esc(what) + esc(extra) + '<br>' +
        (link ? '<a href="' + esc(link) + '">' + L.read + '</a>' : '') + (it.overview && it.overview !== link ? ' · <a href="' + esc(it.overview) + '">' + L.ov + '</a>' : '') + '</li>',
      text: it.title + ' – ' + what + extra + (link ? '\n' + link : '') };
  });
  const head = test ? '<p><i>' + L.test + '</i></p>' : '';
  const body = rows.length ? '<p>' + L.intro + '</p><ul style="padding-left:18px">' + rows.map(r => r.html).join('') + '</ul>' : '<p>' + L.none + '</p>';
  MailApp.sendEmail({ to: to, subject: (test ? '[Test] ' : '') + L.subject(rows.length), htmlBody: '<div style="font-family:Arial,sans-serif;font-size:15px">' + head + body + '</div>',
    body: (test ? L.test + '\n\n' : '') + (rows.length ? L.intro + '\n\n' + rows.map(r => r.text).join('\n\n') : L.none), name: 'Manga Tracker' });
}

/* ------------------------------------------------------------------ */
/* Kategorien, Einstellungen, Sprache                                  */
/* ------------------------------------------------------------------ */

function splitG_(v) { return String(v || '').split(/\s*[,;]\s*/).map(x => x.trim()).filter(Boolean); }

function katBlatt_(create) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CAT_SHEET);
  if (!sh && create) { sh = ss.insertSheet(CAT_SHEET); sh.getRange(1, 1).setValue('Eigene Kategorien').setFontWeight('bold'); sh.setColumnWidth(1, 260); }
  return sh;
}

function kategorien_() {
  const out = GENRES.slice();
  const sh = katBlatt_(false);
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(r => {
    const v = String(r[0]).trim(); if (v && !out.some(x => x.toLowerCase() === v.toLowerCase())) out.push(v);
  });
  return out;
}

function apiKategorieNeu(key, name) {
  check_(key);
  name = String(name || '').replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) return kategorien_();
  if (!kategorien_().some(x => x.toLowerCase() === name.toLowerCase())) katBlatt_(true).appendRow([txt_(name)]);
  return kategorien_();
}

function prefs_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('prefs') || '{}'); } catch (e) { return {}; } }

function apiPrefs(key, p) {
  check_(key);
  const cur = prefs_();
  ['sort', 'lang', 'page', 'recMin', 'recCountry', 'recSort'].forEach(k => { if (p && typeof p[k] === 'string' && p[k].length < 20) cur[k] = p[k]; });
  PropertiesService.getScriptProperties().setProperty('prefs', JSON.stringify(cur));
  return cur;
}

const MSG = {
  en: {
    noAccess: 'No access. Open the page with your personal link.',
    invalid: 'That was not a valid link.',
    dateOnly: t => t + ': date updated. Chapter not recognised – please enter it in the app.',
    saved: (t, ch, low) => t + ': chapter ' + ch + ' saved' + (low != null ? ' (lower than before: ' + low + ')' : '') + '.',
    created: (t, ch) => 'Added: ' + t + (ch != null ? ', chapter ' + ch : '') + '. Please pick a category in the app.'
  },
  de: {
    noAccess: 'Kein Zugriff. Öffne die Seite mit deinem persönlichen Link.',
    invalid: 'Das war kein gültiger Link.',
    dateOnly: t => t + ': Datum gesetzt. Kapitel nicht erkannt – bitte in der App eintragen.',
    saved: (t, ch, low) => t + ': Kapitel ' + ch + ' gespeichert' + (low != null ? ' (niedriger als bisher ' + low + ')' : '') + '.',
    created: (t, ch) => 'Neu angelegt: ' + t + (ch != null ? ', Kapitel ' + ch : '') + '. Kategorie bitte in der App wählen.'
  }
};
function msg_(k) {
  const lang = prefs_().lang === 'de' ? 'de' : 'en';
  const v = MSG[lang][k]; const args = Array.prototype.slice.call(arguments, 1);
  return typeof v === 'function' ? v.apply(null, args) : v;
}

/* ------------------------------------------------------------------ */
/* Cover + Beschreibung von der Kapitelübersicht holen                 */
/* ------------------------------------------------------------------ */

/**
 * Einmal von Hand ausführen. Holt Cover und Beschreibung für alle Serien,
 * die noch keine haben, und macht bei Zeitablauf automatisch weiter.
 * Neue Serien werden danach automatisch nachgeladen.
 */
function bilderImportieren() {
  const start = Date.now();
  const props = PropertiesService.getScriptProperties();
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'bilderImportieren') ScriptApp.deleteTrigger(t); });
  const running = Number(props.getProperty('importRunning') || 0);
  if (running && Date.now() - running < 7 * 60 * 1000) { planeImport_(); return; }
  props.setProperty('importRunning', String(Date.now()));
  let done = 0, found = 0;
  try {
    const tried = JSON.parse(props.getProperty('metaTried') || '{}');
    const todo = alle_().filter(it => !tried[it.id] && !it.image && !it.desc && !it.descDe && (it.overview || it.url));
    for (let k = 0; k < todo.length; k += 6) {
      if (Date.now() - start > 4.5 * 60 * 1000) { planeImport_(); Logger.log('Pause – geht in einer Minute automatisch weiter. Bisher: ' + done); return; }
      const batch = todo.slice(k, k + 6);
      const pages = seitenLaden_(batch.map(it => it.overview || it.url));
      batch.forEach((it, i) => {
        const pageUrl = it.overview || it.url;
        const html = pages[i];
        let res = { img: '', desc: '' };
        if (html) res = meta_(html, pageUrl);
        let shown = '';
        if (res.img) shown = bildSpeichern_(res.img, pageUrl, it.id) || res.img;
        const descEn = res.desc ? uebersetzen_(res.desc, 'en') || res.desc : '';
        const descDe = res.desc ? uebersetzen_(res.desc, 'de') : '';
        if (shown || descEn) {
          found++;
          const lock = LockService.getScriptLock(); lock.waitLock(20000);
          try {
            const sh = blatt_(); const r = zeile_(sh, it.id);
            if (r) {
              const cur = sh.getRange(r, C.image, 1, 4).getValues()[0];
              sh.getRange(r, C.image, 1, 4).setValues([[cur[0] || txt_(shown), cur[1] || txt_(descEn), cur[2] || txt_(descDe), cur[3] || txt_(res.img)]]);
            }
          } finally { lock.releaseLock(); }
        }
        tried[it.id] = 1; done++;
      });
      props.setProperty('metaTried', JSON.stringify(tried));
    }
    Logger.log('Fertig. ' + done + ' Serien geprüft, bei ' + found + ' Cover oder Beschreibung gefunden.');
  } finally { props.deleteProperty('importRunning'); }
}

/** Plant einen Import-Lauf in etwa einer Minute (für neue Serien oder zum Weitermachen). */
function planeImport_() {
  try {
    if (ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'bilderImportieren')) return;
    ScriptApp.newTrigger('bilderImportieren').timeBased().after(60 * 1000).create();
  } catch (e) {}
}

/** Nochmal versuchen: vergisst, welche Serien schon ohne Erfolg geprüft wurden. */
function bilderNeuVersuchen() { PropertiesService.getScriptProperties().deleteProperty('metaTried'); bilderImportieren(); }

function seitenLaden_(urls) {
  const req = urls.map(u => ({ url: u, muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: false, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.8' } }));
  const body = r => (r && r.getResponseCode() === 200) ? r.getContentText().slice(0, 600000) : '';
  try { return UrlFetchApp.fetchAll(req).map(body); }
  catch (e) { return req.map(q => { try { return body(UrlFetchApp.fetch(q.url, q)); } catch (e2) { return ''; } }); }
}

function decode_(s) {
  return String(s || '').replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&hellip;/g, '…').replace(/&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&amp;/g, '&');
}
function text_(html) { return decode_(String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<br\s*\/?>|<\/p>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function kurz_(s, n) { s = String(s || '').trim(); if (s.length <= n) return s; const cut = s.slice(0, n); const sp = cut.lastIndexOf(' '); return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, '') + ' …'; }
function abs_(u, base) {
  u = String(u || '').trim(); if (!u || /^data:/i.test(u)) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (/^\/\//.test(u)) return 'https:' + u;
  const t = teile_(base); if (!t) return '';
  return u.charAt(0) === '/' ? t.origin + u : t.origin + '/' + u;
}
function imgAusTag_(tag) {
  const a = {}; tag.replace(/([a-zA-Z_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (x, k, v1, v2) => { a[k.toLowerCase()] = v1 != null ? v1 : v2; });
  const cands = [a['data-src'], a['data-lazy-src'], (a['data-srcset'] || a['srcset'] || '').split(/\s+/)[0], a['src']];
  return cands.find(v => v && !/^data:/i.test(v)) || '';
}

function meta_(html, pageUrl) {
  const m = {};
  (html.match(/<meta\b[^>]*>/gi) || []).forEach(tag => {
    const a = {}; tag.replace(/([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (x, k, v1, v2) => { a[k.toLowerCase()] = v1 != null ? v1 : v2; });
    const k = (a.property || a.name || a.itemprop || '').toLowerCase();
    if (k && a.content && !m[k]) m[k] = a.content;
  });
  let img = m['og:image'] || m['og:image:secure_url'] || m['twitter:image'] || m['twitter:image:src'] || '';
  const coverBlock = html.match(/class="[^"]*(?:summary_image|thumb|series-thumb|manga-cover|cover)[^"]*"[^>]*>[\s\S]{0,800}?(<img\b[^>]*>)/i);
  if (coverBlock) { const v = imgAusTag_(coverBlock[1]); if (v) img = v; }
  let desc = '';
  const block = html.match(/class="[^"]*(?:summary__content|description-summary|manga-excerpt|entry-content-single|series-synops|synopsis)[^"]*"[^>]*>([\s\S]{0,8000}?)<\/(?:div|p|section)>/i);
  if (block) desc = text_(block[1]);
  if (desc.length < 60) desc = decode_(m['og:description'] || m['description'] || m['twitter:description'] || '').replace(/\s+/g, ' ').trim();
  if (desc && desc.length < 220 && /\bread\b[\s\S]*\b(online|free)\b|latest chapters?|in high quality/i.test(desc)) desc = '';
  return { img: abs_(decode_(img), pageUrl), desc: kurz_(desc, 420) };
}

function bildOrdner_() {
  const it = DriveApp.getFoldersByName(IMG_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(IMG_FOLDER);
}

/** Kopiert das Cover in deinen Drive (umgeht Bildsperren der Seiten, liefert kleine Vorschaubilder). */
function bildSpeichern_(imgUrl, pageUrl, id) {
  try {
    const r = UrlFetchApp.fetch(imgUrl, { muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: false, headers: { 'User-Agent': UA, 'Referer': pageUrl, 'Accept': 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' } });
    if (r.getResponseCode() !== 200) return null;
    const blob = r.getBlob(); const ct = String(blob.getContentType() || '');
    if (ct.indexOf('image/') !== 0 || r.getContent().length < 3000) return null;
    return blobSpeichern_(blob, id);
  } catch (e) { return null; }
}

function blobSpeichern_(blob, id) {
  const ct = String(blob.getContentType() || 'image/jpeg');
  const f = bildOrdner_().createFile(blob.setName((id || 'cover') + '-' + Date.now().toString(36) + '.' + (ct.split('/')[1] || 'jpg').replace('jpeg', 'jpg')));
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w300';
}

/** Foto vom Gerät: kommt als Base64 (schon verkleinert) und wird im Drive gespeichert. */
function apiBildHochladen(key, b64, mime, id) {
  check_(key);
  const bytes = Utilities.base64Decode(String(b64 || ''));
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('upload');
  const blob = Utilities.newBlob(bytes, /^image\//.test(mime) ? mime : 'image/jpeg', 'cover');
  return { image: blobSpeichern_(blob, id), imageSrc: '' };
}

/** Beliebiger Link (Bild, Seite, share.google …): Cover finden und im Drive speichern. */
function apiBildVonLink(key, url, id) {
  check_(key);
  url = String(url || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('nocover');
  let cur = url, page = null, ct = '';
  for (let hop = 0; hop < 6; hop++) {
    const direct = bildAusGoogleLink_(cur); if (direct) { cur = direct; }
    let r;
    try { r = UrlFetchApp.fetch(cur, { muteHttpExceptions: true, followRedirects: false, validateHttpsCertificates: false, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.8' } }); }
    catch (e) { break; }
    const code = r.getResponseCode(); const h = r.getHeaders();
    if (code >= 300 && code < 400) { const loc = h['Location'] || h['location']; if (!loc) break; cur = abs_(loc, cur) || loc; continue; }
    if (code !== 200) break;
    ct = String(h['Content-Type'] || h['content-type'] || '');
    if (/^image\//i.test(ct)) {
      if (r.getContent().length < 1500) break;
      return { image: blobSpeichern_(r.getBlob(), id), imageSrc: cur };
    }
    page = r.getContentText().slice(0, 800000);
    break;
  }
  if (page) {
    const g = page.match(/imgurl=([^&"'\\]+)/i);
    let img = g ? decodeURIComponent(g[1]) : '';
    if (!img) img = meta_(page, cur).img;
    if (img && !/googlelogo|\/logos?\//i.test(img)) {
      const saved = bildSpeichern_(img, cur, id);
      return { image: saved || img, imageSrc: img };
    }
  }
  throw new Error('nocover');
}

function bildAusGoogleLink_(u) {
  const m = String(u).match(/[?&](?:imgurl|mediaurl)=([^&#]+)/i);
  try { return m ? decodeURIComponent(m[1]) : null; } catch (e) { return null; }
}

function uebersetzen_(t, to) {
  if (!t) return '';
  try { return decode_(LanguageApp.translate(t, '', to)); } catch (e) { return ''; }
}

/* ------------------------------------------------------------------ */
/* Tier List als PNG                                                   */
/* ------------------------------------------------------------------ */

/** Liefert Cover als data:-URLs, damit die App sie in das PNG zeichnen darf. */
function apiBilderDaten(key, ids) {
  check_(key);
  const want = {}; (ids || []).forEach(id => want[id] = 1);
  const out = {};
  alle_().filter(it => want[it.id]).forEach(it => {
    try {
      let blob = null;
      const m = String(it.image || '').match(/drive\.google\.com\/(?:thumbnail\?id=|uc\?(?:export=view&)?id=|file\/d\/)([\w-]+)/);
      if (m) { const f = DriveApp.getFileById(m[1]); blob = f.getThumbnail() || f.getBlob(); }
      else {
        const u = it.image || it.imageSrc;
        if (u) { const r = UrlFetchApp.fetch(u, { muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: false, headers: { 'User-Agent': UA, 'Referer': it.overview || u } });
          if (r.getResponseCode() === 200 && r.getContent().length < 1500000 && /^image\//.test(String(r.getBlob().getContentType()))) blob = r.getBlob(); }
      }
      if (blob) out[it.id] = 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes());
    } catch (e) {}
  });
  return out;
}

/** Speichert eine Datei (z. B. Excel-Export) im Drive-Ordner „Manga Tracker Exporte“. */
function apiDateiSpeichern(key, b64, name, mime) {
  check_(key);
  const it = DriveApp.getFoldersByName('Manga Tracker Exporte');
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder('Manga Tracker Exporte');
  const f = folder.createFile(Utilities.newBlob(Utilities.base64Decode(b64), mime || 'application/octet-stream', String(name || 'export').slice(0, 120)));
  return { name: f.getName(), url: f.getUrl() };
}

/** Speichert das PNG im Drive-Ordner „Manga Tracker Exporte“. */
function apiPngSpeichern(key, b64) {
  check_(key);
  const it = DriveApp.getFoldersByName('Manga Tracker Exporte');
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder('Manga Tracker Exporte');
  const name = 'Manga Tracker Tier List ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH-mm') + '.png';
  const f = folder.createFile(Utilities.newBlob(Utilities.base64Decode(b64), 'image/png', name));
  return { name: name, url: f.getUrl() };
}

/* ------------------------------------------------------------------ */
/* AniList: Zuordnung, Alternativtitel, offizielle Plattformen          */
/* ------------------------------------------------------------------ */

const AL_FIELDS = 'id siteUrl format countryOfOrigin status chapters title{romaji english native} synonyms coverImage{large} description(asHtml:false) externalLinks{site url type}';

function alFetch_(query, vars) {
  for (let k = 0; k < 3; k++) {
    Utilities.sleep(2200);                                             // AniList erlaubt etwa 30 Anfragen pro Minute
    try {
      const r = UrlFetchApp.fetch(AL, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { 'Accept': 'application/json', 'User-Agent': 'MangaTracker/1.0 (private reading list)' }, payload: JSON.stringify({ query: query, variables: vars || {} }) });
      const code = r.getResponseCode();
      if (code === 200) return JSON.parse(r.getContentText()).data;
      if (code === 429) { const h = r.getHeaders(); Utilities.sleep(1000 * Math.min(65, Number(h['Retry-After'] || h['retry-after'] || 30))); continue; }
      if (code === 404) return null;
      Logger.log('AniList antwortet mit HTTP ' + code + ': ' + r.getContentText().slice(0, 200));
      return null;
    } catch (e) { Logger.log('AniList-Fehler: ' + e.message); }
  }
  return null;
}
function alSuche_(title) {
  const d = alFetch_('query($s:String){Page(perPage:6){media(search:$s,type:MANGA,format_not:NOVEL){' + AL_FIELDS + '}}}', { s: title });
  return d && d.Page ? d.Page.media || [] : null;
}
function alById_(id) { const d = alFetch_('query($id:Int){Media(id:$id,type:MANGA){' + AL_FIELDS + '}}', { id: Number(id) }); return d ? d.Media : null; }
function dbOk_(it) { return it.dbId && (it.dbStatus === 'auto' || it.dbStatus === 'bestätigt'); }
function alIdAusLink_(u) {
  u = String(u || '').trim(); if (!u) return null;
  const m = u.match(/anilist\.co\/manga\/(\d+)/i); if (m) return m[1];
  return /^\d{2,9}$/.test(u) ? u : null;
}
const AL_SKIP = /^(twitter|x|instagram|facebook|youtube|tiktok|discord|official site|pixiv|weibo)$/i;
function alFelder_(m, status) {
  const t = m.title || {};
  const names = [t.english, t.romaji, t.native].concat(m.synonyms || []).filter(Boolean).map(decode_);
  const seen = {}; const alt = names.filter(n => { const k = norm_(n) || n; if (seen[k]) return false; seen[k] = 1; return true; });
  const links = (m.externalLinks || []).filter(l => l && l.url && l.site && l.type !== 'SOCIAL' && !AL_SKIP.test(l.site));
  const wt = links.map(l => String(l.url)).find(u => /webtoons\.com\/en\/.+\/list\?title_no=\d+/i.test(u));
  return { dbId: String(m.id), dbTitle: decode_(t.english || t.romaji || ''), alt: alt.slice(0, 15).join(' | '),
    official: links.slice(0, 6).map(l => l.site + '|' + l.url).join(' ; '), dbStatus: status, dbUrl: m.siteUrl || '',
    wtFeed: wt ? wt.replace(/^https?:\/\/(m\.)?webtoons/i, 'https://www.webtoons').replace('/list?', '/rss?') : '' };
}

/** Bewertet, wie gut ein AniList-Treffer zu einer Serie passt (0…1). */
function alScore_(it, m) {
  const t = m.title || {};
  const theirs = [t.english, t.romaji, t.native].concat(m.synonyms || []).filter(Boolean).map(decode_);
  let best = 0;
  [it.title].concat(it.alt || []).forEach(a => theirs.forEach(b => {
    const na = norm_(a).replace(/ /g, ''), nb = norm_(b).replace(/ /g, '');
    let sc = na && na === nb ? 1 : jacc_(toks_(a), toks_(b));
    if (sc < 1 && na.length > 8 && nb.length > 8 && (na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0)) sc = Math.max(sc, 0.85);
    best = Math.max(best, sc);
  }));
  const ch = (it.chapter != null && it.chapter !== '') ? Number(it.chapter) : null;
  if (ch != null && m.chapters && m.chapters + 5 < ch) best -= 0.25;
  if (m.format === 'NOVEL') return 0;
  return best;
}

/** Einmal ausführen – ordnet alle Serien AniList zu (macht bei Zeitablauf selbst weiter). */
function anilistZuordnen() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'anilistZuordnen') ScriptApp.deleteTrigger(t); });
  const props = PropertiesService.getScriptProperties();
  const running = Number(props.getProperty('alRunning') || 0);
  if (running && Date.now() - running < 7 * 60 * 1000) { planeLauf_('anilistZuordnen'); return; }
  props.setProperty('alRunning', String(Date.now()));
  const start = Date.now(); let auto = 0, unsure = 0, none = 0, wt = 0, done = true;
  try {
    const todo = alle_().filter(it => !it.dbStatus);
    for (let k = 0; k < todo.length; k++) {
      if (Date.now() - start > 4.3 * 60 * 1000) { done = false; break; }
      const it = todo[k];
      const res = alSuche_(it.title);
      if (res === null) { done = false; break; }                       // AniList gerade nicht erreichbar → später weiter
      let best = null, bs = 0;
      res.forEach(m => { const sc = alScore_(it, m); if (sc > bs) { bs = sc; best = m; } });
      let patch;
      if (best && bs >= 0.6) {
        const status = bs >= 0.9 ? 'auto' : 'unsicher';
        patch = alFelder_(best, status); if (status === 'auto') auto++; else unsure++;
        if (patch.wtFeed) wt++;
        coverAusAl_(it, best, patch);
      } else { patch = { dbStatus: 'keine' }; none++; }
      const lock = LockService.getScriptLock(); lock.waitLock(30000);
      try {
        const sh = blatt_(); const r = zeile_(sh, it.id); if (!r) continue;
        if (patch.dbStatus === 'auto' && patch.wtFeed && sh.getRange(r, C.source).getValue() === 'none') { patch.source = ''; patch.latestSince = ''; }   // jetzt über WEBTOON erfassbar
        Object.keys(patch).forEach(f => sh.getRange(r, C[f]).setValue(zelle_(f, patch[f])));
      } finally { lock.releaseLock(); }
    }
  } finally { props.deleteProperty('alRunning'); }
  if (!done) { planeLauf_('anilistZuordnen'); Logger.log('Pause – geht in einer Minute weiter. Bisher: ' + auto + ' sicher, ' + unsure + ' zum Bestätigen, ' + none + ' ohne Treffer.'); return; }
  Logger.log('Fertig: ' + auto + ' sicher zugeordnet, ' + unsure + ' zum Bestätigen in der App, ' + none + ' ohne Treffer. ' + wt + ' davon offiziell auf WEBTOON.');
  planeLauf_('neuesteErmitteln');
}

/** Setzt alle Serien „ohne Treffer“ zurück und startet die AniList-Zuordnung neu. */
function anilistNeuVersuchen() {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const sh = blatt_(); const n = sh.getLastRow() - 1;
    if (n > 0) { const rng = sh.getRange(2, C.dbStatus, n, 1); rng.setValues(rng.getValues().map(r => [r[0] === 'keine' ? '' : r[0]])); }
  } finally { lock.releaseLock(); }
  anilistZuordnen();
}

/** Fehlendes Cover / fehlende Beschreibung von AniList übernehmen. */
function coverAusAl_(it, m, patch) {
  try {
    if (!it.image && !it.imageSrc && m.coverImage && m.coverImage.large) {
      const src = m.coverImage.large;
      patch.image = bildSpeichern_(src, m.siteUrl || src, it.id) || src; patch.imageSrc = src;
    }
    if (!it.desc && !it.descDe && m.description) {
      const d = kurz_(text_(m.description), 420);
      if (d) { patch.desc = uebersetzen_(d, 'en') || d; patch.descDe = uebersetzen_(d, 'de'); }
    }
  } catch (e) {}
}

/** Aus der App: unsicheren Treffer bestätigen oder verwerfen. */
function apiAlBestaetigen(key, id, ok) {
  check_(key);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = blatt_(); const r = zeile_(sh, id); if (!r) throw new Error('Serie nicht gefunden');
    if (ok) {
      sh.getRange(r, C.dbStatus).setValue('bestätigt');
      if (sh.getRange(r, C.wtFeed).getValue() && sh.getRange(r, C.source).getValue() === 'none') { sh.getRange(r, C.source).setValue(''); sh.getRange(r, C.latestSince).setValue(''); planeLauf_('neuesteErmitteln'); }
    } else sh.getRange(r, C.dbId, 1, 7).setValues([['', '', '', '', 'keine', '', '']]);
  } finally { lock.releaseLock(); }
  return alle_().find(x => x.id === id);
}

/* ------------------------------------------------------------------ */
/* Offizieller WEBTOON-Feed                                            */
/* ------------------------------------------------------------------ */

/** Höchste Folgen-Nummer im WEBTOON-Feed (oder null). */
function wtNeueste_(feed) {
  try {
    const r = UrlFetchApp.fetch(feed, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': UA } });
    if (r.getResponseCode() !== 200) return null;
    let best = null; const re = /episode_no=(\d+)/g; let m; const x = r.getContentText();
    while ((m = re.exec(x))) { const n = Number(m[1]); if (best == null || n > best) best = n; }
    return best;
  } catch (e) { return null; }
}

/* ------------------------------------------------------------------ */
/* Empfehlungen (AniList)                                              */
/* ------------------------------------------------------------------ */

const REC_SHEET = 'Empfehlungen';
const REC_HEAD = ['Art', 'AniList-ID', 'Titel', 'Alternativtitel', 'Punkte', 'AniList-Wertung', 'Leser', 'Kapitel', 'Kapitel geschätzt', 'Herkunft', 'Status', 'Genres', 'Cover', 'Beschreibung', 'Beschreibung DE', 'AniList-Link', 'Offiziell bei', 'Weil', 'Aktualisiert'];
const REC_MIN_SCORE = 75, REC_MIN_POP = 500, REC_MAX = 60;
const REC_NODE = 'id type format countryOfOrigin isAdult averageScore popularity chapters status startDate{year month day} title{romaji english native} synonyms genres coverImage{large} siteUrl description(asHtml:false) externalLinks{site url type}';

/** Einmal ausführen: wöchentliche Aktualisierung (sonntags ca. 10 Uhr) einrichten und sofort erstellen. */
function empfehlungenEinrichten() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'empfehlungenAktualisieren') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('empfehlungenAktualisieren').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(10).nearMinute(0).inTimezone(TZ).create();
  empfehlungenAktualisieren();
}

/** Gewicht einer eigenen Serie für die Empfehlungen (−1 … 1). */
function recGewicht_(it) {
  const r = parseInt(it.rating, 10);
  if (r > 0) return (r - 5.5) / 4.5;
  return ({ 'Lese ich gerade': 0.4, 'Beendet': 0.5, 'Hiatus': 0.3, 'Marinate': 0.2, 'Abgebrochen': -0.5 })[it.status] || 0.1;
}

function kapitelSchaetzung_(m) {
  if (m.chapters) return { n: m.chapters, approx: false };
  const sd = m.startDate || {}; if (!sd.year) return { n: null, approx: true };
  const start = new Date(sd.year, (sd.month || 1) - 1, sd.day || 1).getTime();
  const end = (m.status === 'FINISHED' || m.status === 'CANCELLED') ? null : Date.now();
  if (!end) return { n: null, approx: true };
  return { n: Math.max(1, Math.round((end - start) / (7 * 864e5) * 0.85)), approx: true };   // ~1 Kapitel/Woche, Pausen abgezogen
}

function empfehlungenAktualisieren() {
  const start = Date.now();
  const items = alle_();
  const ownedIds = {}; const ownedNames = {};
  items.forEach(it => {
    if (it.dbId) ownedIds[String(it.dbId)] = 1;
    [it.title].concat(it.alt || []).forEach(n => { const k = norm_(n).replace(/ /g, ''); if (k.length > 3) ownedNames[k] = 1; });
  });
  const no = JSON.parse(PropertiesService.getScriptProperties().getProperty('recNo') || '{}');
  const seeds = items.filter(it => it.dbId && (it.dbStatus === 'auto' || it.dbStatus === 'bestätigt')).map(it => ({ it: it, w: recGewicht_(it) }))
    .filter(x => Math.abs(x.w) >= 0.05).sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, 70);
  const cand = {}; const related = {}; const sequels = {}; const profile = {};
  const q = 'query($id:Int){Media(id:$id){id genres relations{edges{relationType node{' + REC_NODE + '}}} recommendations(sort:RATING_DESC,perPage:12){nodes{rating mediaRecommendation{' + REC_NODE + '}}}}}';
  for (let k = 0; k < seeds.length; k++) {
    if (Date.now() - start > 4 * 60 * 1000) break;
    const sd = seeds[k]; const d = alFetch_(q, { id: Number(sd.it.dbId) });
    const m = d && d.Media; if (!m) continue;
    (m.genres || []).forEach(g => profile[g] = (profile[g] || 0) + sd.w);
    ((m.relations && m.relations.edges) || []).forEach(e => {
      if (!e || !e.node) return; related[String(e.node.id)] = 1;
      if (sd.w > 0 && ['SEQUEL', 'SIDE_STORY', 'SPIN_OFF', 'PREQUEL'].indexOf(e.relationType) >= 0 && e.node.type === 'MANGA')
        sequels[String(e.node.id)] = { m: e.node, why: sd.it.title, rel: e.relationType };
    });
    ((m.recommendations && m.recommendations.nodes) || []).forEach(nd => {
      const c = nd && nd.mediaRecommendation; if (!c || !(nd.rating > 0)) return;
      const id = String(c.id); const x = cand[id] || (cand[id] = { m: c, score: 0, why: [] });
      const add = sd.w * Math.log(1 + nd.rating) / Math.LN2;
      x.score += add; if (add > 0) x.why.push({ t: sd.it.title, v: add });
    });
  }
  const isOwned = (m, allowRelated) => {
    if (ownedIds[String(m.id)] || no[String(m.id)] || (!allowRelated && related[String(m.id)])) return true;
    const t = m.title || {};
    return [t.english, t.romaji, t.native].concat(m.synonyms || []).filter(Boolean).some(n => ownedNames[norm_(decode_(n)).replace(/ /g, '')]);
  };
  const ok = (m, allowRelated) => m && m.type === 'MANGA' && m.format !== 'NOVEL' && !m.isAdult && ['KR', 'CN', 'TW'].indexOf(m.countryOfOrigin) >= 0 && !isOwned(m, allowRelated);
  const pmax = Math.max.apply(null, Object.keys(profile).map(g => Math.abs(profile[g])).concat([1]));
  const recs = Object.keys(cand).map(id => cand[id]).filter(x => ok(x.m) && x.score > 0 && (x.m.averageScore || 0) >= REC_MIN_SCORE && (x.m.popularity || 0) >= REC_MIN_POP)
    .map(x => {
      const g = (x.m.genres || []).reduce((a, n) => a + (profile[n] || 0), 0) / pmax / Math.max(1, (x.m.genres || []).length);
      const country = x.m.countryOfOrigin === 'KR' ? 1.15 : 1;                                   // Manhwa bevorzugt
      const hype = 1 - 0.25 * Math.min(1, (x.m.popularity || 0) / 200000);                       // nicht nur die üblichen Hits
      x.final = x.score * (1 + 0.3 * g) * country * hype * (0.8 + (x.m.averageScore || 0) / 500);
      return x;
    }).sort((a, b) => b.final - a.final).slice(0, REC_MAX);
  const seq = Object.keys(sequels).map(id => sequels[id]).filter(x => ok(x.m, true)).slice(0, 20);
  const now = new Date();
  const row = (kind, m, pts, why) => {
    const t = m.title || {}; const ch = kapitelSchaetzung_(m);
    const names = [t.english, t.romaji, t.native].concat(m.synonyms || []).filter(Boolean).map(decode_);
    const title = decode_(t.english || t.romaji || t.native || '');
    const desc = kurz_(text_(m.description || ''), 380);
    const links = (m.externalLinks || []).filter(l => l && l.url && l.site && l.type !== 'SOCIAL' && !AL_SKIP.test(l.site)).slice(0, 5).map(l => l.site + '|' + l.url).join(' ; ');
    return [kind, String(m.id), title, names.filter(n => n !== title).slice(0, 10).join(' | '), Math.round(pts * 100) / 100, m.averageScore || '', m.popularity || '',
      ch.n == null ? '' : ch.n, ch.approx, m.countryOfOrigin || '', m.status || '', (m.genres || []).join(', '), (m.coverImage || {}).large || '',
      desc, desc ? uebersetzen_(desc, 'de') : '', m.siteUrl || '', links, why, now];
  };
  const rows = recs.map(x => row('rec', x.m, x.final, x.why.sort((a, b) => b.v - a.v).slice(0, 3).map(w => w.t).join(' | ')))
    .concat(seq.map(x => row('sequel', x.m, 0, x.why + '|' + x.rel)));
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(REC_SHEET) || ss.insertSheet(REC_SHEET);
  sh.clearContents();
  sh.getRange(1, 1, 1, REC_HEAD.length).setValues([REC_HEAD]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, REC_HEAD.length).setValues(rows.map(r => r.map(txt_)));
  Logger.log('Empfehlungen: ' + recs.length + ' neue Serien, ' + seq.length + ' Fortsetzungen (aus ' + seeds.length + ' deiner Serien).');
  return rows.length;
}

function apiEmpfehlungen(key) {
  check_(key);
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REC_SHEET);
  if (!sh || sh.getLastRow() < 2) return { items: [], updated: null };
  const no = JSON.parse(PropertiesService.getScriptProperties().getProperty('recNo') || '{}');
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, REC_HEAD.length).getValues();
  const items = v.filter(r => r[1] && !no[String(r[1])]).map(r => ({ kind: r[0], id: String(r[1]), title: r[2], alt: r[3] ? String(r[3]).split(' | ') : [], score: r[4], avg: r[5] || null,
    pop: r[6] || null, chapters: r[7] === '' ? null : Number(r[7]), approx: r[8] === true, country: r[9], status: r[10], genres: r[11] ? String(r[11]).split(', ') : [],
    cover: r[12] || null, desc: r[13] || null, descDe: r[14] || null, url: r[15] || null, official: r[16] || null, why: r[17] || '' }));
  const upd = v.length && v[0][18] instanceof Date ? v[0][18].getTime() : null;
  return { items: items, updated: upd };
}

function apiEmpfehlungenNeu(key) { check_(key); empfehlungenAktualisieren(); return apiEmpfehlungen(key); }

function apiEmpfehlungNein(key, id) {
  check_(key);
  const props = PropertiesService.getScriptProperties();
  const no = JSON.parse(props.getProperty('recNo') || '{}'); no[String(id)] = 1;
  props.setProperty('recNo', JSON.stringify(no));
  return true;
}

/** Empfehlung in die eigene Liste übernehmen (ohne Status, mit AniList-Daten). */
function apiEmpfehlungAufnehmen(key, id) {
  check_(key);
  const m = alById_(id); if (!m) throw new Error('AniList nicht erreichbar');
  const f = alFelder_(m, 'bestätigt');
  const cover = m.coverImage && m.coverImage.large;
  const desc = kurz_(text_(m.description || ''), 420);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let item;
  try {
    item = anlegen_(Object.assign({ title: f.dbTitle || 'Neue Serie', genres: [], status: null, chapter: null,
      image: cover ? (bildSpeichern_(cover, m.siteUrl || cover, 'al-' + id) || cover) : '', imageSrc: cover || '',
      desc: desc ? (uebersetzen_(desc, 'en') || desc) : '', descDe: desc ? uebersetzen_(desc, 'de') : '' }, f));
  } finally { lock.releaseLock(); }
  apiEmpfehlungNein(key, id);
  return item;
}

/* ==================================================================== */
/* Api.gs */
/* ==================================================================== */

/**
 * Manga Tracker – Schnittstelle für die App auf GitHub Pages + Einrichten-Menü
 *
 * Die App (https://lobi1994.github.io/Manga-Tracker/) schickt jede Anfrage als
 * POST {fn, key, args} hierher. Erlaubt sind nur Funktionen, deren Name mit
 * „api“ beginnt; jede davon prüft den Schlüssel selbst.
 */

const APP_PAGE = 'https://lobi1994.github.io/Manga-Tracker/';

/** Schlüssel dieser Tabelle: aus den Skripteigenschaften, sonst der alte feste Schlüssel. */
function schluessel_() {
  let k = '';
  try { k = PropertiesService.getScriptProperties().getProperty('appKey') || ''; } catch (e) {}
  if (!k && typeof KEY !== 'undefined') k = KEY;
  return k || '';
}

function doPost(e) {
  let out;
  // Kurzbefehle können als Formular senden (fn, key, url): Antwort dann als lesbarer Text
  const p = (e && e.parameter) || {};
  if (p.fn && p.key) {
    let txt;
    try {
      const k = schluessel_();
      if (!k || p.key !== k) throw new Error('Kein Zugriff');
      if (!/^api[A-Za-z]+$/.test(p.fn) || typeof globalThis[p.fn] !== 'function') throw new Error('Unbekannte Funktion: ' + p.fn);
      const r = globalThis[p.fn].apply(null, [p.key].concat(p.url != null ? [p.url] : []));
      txt = typeof r === 'string' ? r : JSON.stringify(r);
    } catch (err) { txt = String((err && err.message) || err); }
    return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.TEXT);
  }
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = String(body.fn || '');
    const k = schluessel_();
    if (!k || body.key !== k) throw new Error('Kein Zugriff');
    if (!/^api[A-Za-z]+$/.test(fn) || typeof globalThis[fn] !== 'function') throw new Error('Unbekannte Funktion: ' + fn);
    const args = Array.isArray(body.args) ? body.args : [];
    out = { result: globalThis[fn].apply(null, [body.key].concat(args)) };
    if (out.result === undefined) out.result = null;
  } catch (err) {
    out = { error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Zusatzinfos für die App (Link zur Tabelle). */
function apiInfo(key) {
  check_(key);
  return { sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl() };
}

/* ------------------------------------------------------------------ */
/* Menü in der Tabelle                                                 */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Manga Tracker')
    .addItem('Einrichten', 'mtEinrichten')
    .addItem('App-Link anzeigen', 'mtAppLink')
    .addItem('Web-App-Link ändern', 'mtLinkAendern')
    .addSeparator()
    .addItem('Neuen Schlüssel erzeugen', 'mtNeuerSchluessel')
    .addToUi();
}

function zufallsSchluessel_() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now());
  let s = '';
  for (let i = 0; i < 24; i++) s += abc.charAt(((bytes[i] % 256) + 256) % 256 % abc.length);
  return s;
}

/** Legt Tabelle, Zeitpläne und einen eigenen Schlüssel an. Mehrfaches Ausführen schadet nicht. */
function mtEinrichten() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  einrichten();
  try { pruefungEinrichten(); } catch (e) { Logger.log(e); }
  try { empfehlungenEinrichten(); } catch (e) { Logger.log(e); }
  if (!schluessel_()) props.setProperty('appKey', zufallsSchluessel_());
  ui.alert('Manga Tracker',
    'Fertig eingerichtet.\n\nNächster Schritt (nur einmal):\nErweiterungen → Apps Script → Bereitstellen → Neue Bereitstellung → Typ „Web-App“\n' +
    '• Ausführen als: Ich\n• Zugriff: Jeder\n→ Bereitstellen.\n\nDanach hier im Menü „Manga Tracker → App-Link anzeigen“ wählen.',
    ui.ButtonSet.OK);
}

/** Web-App-Link: gespeicherter Link, sonst der von Google gemeldete (nur wenn er auf /exec endet). */
function appUrl_() {
  const saved = PropertiesService.getScriptProperties().getProperty('appUrl') || '';
  if (saved) return saved;
  const url = ScriptApp.getService().getUrl() || '';
  return /\/exec$/.test(url) ? url : '';
}

/** Fragt nach dem Web-App-Link (Bereitstellen → Bereitstellungen verwalten → Web-App-URL) und speichert ihn. */
function mtAppLinkEintragen() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Web-App-Link eintragen',
    'In Apps Script: Bereitstellen → Bereitstellungen verwalten → bei der Web-App die URL kopieren (endet auf /exec) und hier einfügen:',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return false;
  const url = r.getResponseText().trim().replace(/\?.*$/, '');
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) {
    ui.alert('Manga Tracker', 'Das ist kein Web-App-Link. Er beginnt mit https://script.google.com/ und endet auf /exec.', ui.ButtonSet.OK);
    return false;
  }
  PropertiesService.getScriptProperties().setProperty('appUrl', url);
  return true;
}

function setupLink_() {
  const url = appUrl_();
  const k = schluessel_();
  if (!url || !k) return null;
  const data = Utilities.base64EncodeWebSafe(JSON.stringify({ u: url, k: k }), Utilities.Charset.UTF_8).replace(/=+$/, '');
  return { page: APP_PAGE + '#setup=' + data, url: url, key: k };
}

/** Zeigt den persönlichen Einrichtungs-Link (App-Link + Schlüssel). */
function mtAppLink() {
  const ui = SpreadsheetApp.getUi();
  if (!appUrl_() && schluessel_() && !mtAppLinkEintragen()) return;
  const s = setupLink_();
  if (!s) {
    ui.alert('Manga Tracker', 'Noch keine Web-App bereitgestellt oder kein Schlüssel vorhanden.\nBitte zuerst „Einrichten“ ausführen und die Web-App bereitstellen.', ui.ButtonSet.OK);
    return;
  }
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.45">' +
    '<p><b>1. Einrichtungs-Link</b> – auf iPhone/iPad in Safari öffnen, dann Teilen → „Zum Home-Bildschirm“:</p>' +
    '<textarea readonly style="width:100%;height:84px" onclick="this.select()">' + esc(s.page) + '</textarea>' +
    '<p><a href="' + esc(s.page) + '" target="_blank">Jetzt öffnen</a></p>' +
    '<p><b>2. Für die Kurzbefehle</b>:</p>' +
    '<p>App-Link:<br><textarea readonly style="width:100%;height:54px" onclick="this.select()">' + esc(s.url) + '</textarea></p>' +
    '<p>Schlüssel:<br><input readonly style="width:100%" value="' + esc(s.key) + '" onclick="this.select()"></p>' +
    '<p style="color:#a33">Diesen Link und Schlüssel nicht weitergeben – damit kann jeder deine Liste ändern.</p></div>'
  ).setWidth(520).setHeight(470);
  ui.showModalDialog(html, 'Manga Tracker – App-Link');
}

/** Erzeugt einen neuen Schlüssel (alte Links und Kurzbefehle funktionieren danach nicht mehr). */
function mtNeuerSchluessel() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.alert('Neuen Schlüssel erzeugen?', 'Danach musst du den Einrichtungs-Link neu öffnen und den Schlüssel in deinen Kurzbefehlen ersetzen.', ui.ButtonSet.OK_CANCEL);
  if (r !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().setProperty('appKey', zufallsSchluessel_());
  mtAppLink();
}

/** Gespeicherten Web-App-Link ersetzen (z. B. nach einer neuen Bereitstellung statt einer neuen Version). */
function mtLinkAendern() { if (mtAppLinkEintragen()) mtAppLink(); }

/* ==================================================================== */
/* KapitelAktualisieren.gs */
/* ==================================================================== */

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

/* ==================================================================== */
/* LinkEintragen.gs */
/* ==================================================================== */

/** Shortcut "Manga gelesen" from another site than the saved overview: switch the overview to the new site first,
 *  so "Continue" and "Overview" always point to the same site. Then the usual saving in Code.gs runs. */
function linkEintragenNeu_(url) {
  try {
    const info = urlInfo_(url);
    if (info) {
      const lock = LockService.getScriptLock(); lock.waitLock(20000);
      try {
        const m = besterTreffer_(info, alle_());
        if (m && m.overview) {
          const h = hostOhneWww_(info.url), ho = hostOhneWww_(m.overview);
          if (h && ho && h !== ho) {
            const sh = blatt_(); const r = zeile_(sh, m.id);
            if (r) sh.getRange(r, C.overview).setValue(txt_(uebersicht_(info.url) || info.url));
          }
        }
      } finally { lock.releaseLock(); }
    }
  } catch (e) {}
  return linkEintragen_(url);
}
function hostOhneWww_(u) { const t = teile_(u); return t ? t.host.replace(/^www\./, '') : ''; }

/* ==================================================================== */
/* SeitenStatus.gs */
/* ==================================================================== */

/** Marks for reading sites that are gone or unavailable. Stored in script properties, so Code.gs and the sheet stay unchanged. */
function seitenMap_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('siteGone') || '{}'); } catch (e) { return {}; }
}
function apiSeitenStatus(key) {
  check_(key);
  return seitenMap_();
}
function apiSeiteWeg(key, id, host) {
  check_(key);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const map = seitenMap_();
    if (host) map[id] = { host: String(host), date: heute_() }; else delete map[id];
    PropertiesService.getScriptProperties().setProperty('siteGone', JSON.stringify(map));
    return map;
  } finally { lock.releaseLock(); }
}

/* ==================================================================== */
/* Zusatz.gs */
/* ==================================================================== */

/** Additions for v2.0: filters shared across devices, smarter link recognition, switching a series to another site.
 *  Kept in its own file so Code.gs stays unchanged. */
function apiFilterLesen(key) {
  check_(key);
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('filters') || 'null'); } catch (e) { return null; }
}
function apiFilterSpeichern(key, f) {
  check_(key);
  const clean = {};
  ['g', 'gx', 's', 'sx'].forEach(function (k) {
    clean[k] = (f && Array.isArray(f[k]) ? f[k] : []).map(String).filter(function (v) { return v.length < 60; }).slice(0, 40);
  });
  PropertiesService.getScriptProperties().setProperty('filters', JSON.stringify(clean));
  return clean;
}
function titelNorm_(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
/** Like apiErkennen, but also finds the series by its title or alternative titles and says whether the link is from the same site. */
function apiErkennenPlus(key, url) {
  check_(key);
  const info = urlInfo_(url);
  if (!info) return null;
  const list = alle_();
  const title = titelAusSlug_(info.slug);
  let m = besterTreffer_(info, list), by = m ? 'link' : '';
  if (!m) {
    const n = titelNorm_(title);
    if (n.length >= 4) {
      m = list.find(function (it) {
        const names = [it.title].concat(it.alt || [], it.dbTitle ? [it.dbTitle] : []);
        return names.some(function (a) { return titelNorm_(a) === n; });
      }) || null;
      if (m) by = 'title';
    }
  }
  const h = hostOhneWww_(info.url);
  let sameSite = false;
  if (m) {
    const own = [m.url, m.overview].filter(Boolean);
    sameSite = !own.length || own.some(function (u) { return hostOhneWww_(u) === h; });
  }
  return { url: info.url, ch: info.ch, title: title, matchId: m ? m.id : null, by: by, sameSite: sameSite, host: h };
}
/** Read a chapter on another site: switch the overview to the new site, then save the chapter as usual. */
function apiSeiteWechseln(key, id, patch) {
  check_(key);
  const url = patch && patch.url;
  if (url) {
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      const sh = blatt_(); const r = zeile_(sh, id);
      if (r) sh.getRange(r, C.overview).setValue(txt_(uebersicht_(url) || url));
    } finally { lock.releaseLock(); }
  }
  return apiSpeichern(key, id, patch);
}

/* ---- Own background picture (v2.2): stored in the cover folder in Drive, the same on every device ---- */
function hintergrundInfo_(id) {
  return id ? { id: id, url: 'https://lh3.googleusercontent.com/d/' + id + '=w2000', alt: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w2000' } : null;
}
function apiHintergrund(key) {
  check_(key);
  return hintergrundInfo_(PropertiesService.getScriptProperties().getProperty('bgId'));
}
function apiHintergrundHochladen(key, b64, mime) {
  check_(key);
  const bytes = Utilities.base64Decode(String(b64 || ''));
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('upload');
  const blob = Utilities.newBlob(bytes, /^image\//.test(mime) ? mime : 'image/jpeg', 'hintergrund');
  const f = bildOrdner_().createFile(blob.setName('hintergrund-' + Date.now().toString(36) + '.jpg'));
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  const props = PropertiesService.getScriptProperties();
  const old = props.getProperty('bgId');
  props.setProperty('bgId', f.getId());
  if (old) { try { DriveApp.getFileById(old).setTrashed(true); } catch (e) {} }
  return hintergrundInfo_(f.getId());
}
function apiHintergrundEntfernen(key) {
  check_(key);
  const props = PropertiesService.getScriptProperties();
  const old = props.getProperty('bgId');
  props.deleteProperty('bgId');
  if (old) { try { DriveApp.getFileById(old).setTrashed(true); } catch (e) {} }
  return null;
}

/* ==================================================================== */
/* Lesestand.gs */
/* ==================================================================== */

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

/* ==================================================================== */
/* Inbox.gs */
/* ==================================================================== */

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

/* ==================================================================== */
/* BildText.gs */
/* ==================================================================== */

/** Texterkennung auf Instagram-Bildern (v2.7), kostenlos über Google Drive.
 *  Einmalig nötig: in Apps Script links „Dienste +“ → „Drive API“ hinzufügen,
 *  dann die Funktion „ocrBerechtigen“ einmal ausführen (Zugriff erlauben). */

const OCR_HOSTS = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

/** Einmal im Editor ausführen: fragt die nötigen Berechtigungen ab und testet die Texterkennung. */
function ocrBerechtigen() {
  if (typeof Drive === 'undefined') throw new Error('Bitte zuerst links „Dienste +“ → „Drive API“ hinzufügen.');
  DocumentApp.getActiveDocument;   // Berechtigung für Google Docs
  Logger.log('Texterkennung bereit.');
}

function apiBildText(key, imgUrl) {
  check_(key);
  const u = String(imgUrl || '');
  const m = u.match(/^https:\/\/([^\/?#]+)\//i);
  if (!m || !OCR_HOSTS.test(m[1])) return { text: '', error: 'host' };
  if (typeof Drive === 'undefined') return { text: '', error: 'drive' };
  const cache = CacheService.getScriptCache();
  const ck = 'ocr:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, u.replace(/[?#].*$/, '')));
  const hit = cache.get(ck);
  if (hit) return { text: hit };

  const r = UrlFetchApp.fetch(u, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': UA } });
  const type = String(r.getHeaders()['Content-Type'] || r.getHeaders()['content-type'] || '');
  if (r.getResponseCode() !== 200 || !/^image\//i.test(type)) return { text: '', error: 'fetch ' + r.getResponseCode() };
  let blob = r.getBlob().setName('mt-ocr.jpg');
  if (!/jpe?g|png|gif/i.test(type)) {                 // Drive reads JPG/PNG/GIF; Instagram may send WebP/HEIC
    try { blob = blob.getAs('image/jpeg').setName('mt-ocr.jpg'); } catch (e) { return { text: '', error: 'format ' + type }; }
  }
  if (blob.getBytes().length > 10 * 1024 * 1024) return { text: '', error: 'size' };

  const o = ocrBlob_(blob);
  if (o.error) return o;
  const text = o.text;
  if (text) { try { cache.put(ck, text, 6 * 3600); } catch (e) {} }
  return { text: text, type: type, bytes: blob.getBytes().length };
}

/** Texterkennung für ein Bild als JPEG-Daten (base64). Das Overlay wandelt WebP-Bilder vorher im Browser um. */
function apiBildTextDaten(key, b64, src) {
  check_(key);
  if (typeof Drive === 'undefined') return { text: '', error: 'drive' };
  const cache = CacheService.getScriptCache();
  const ck = src ? 'ocr:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(src).replace(/[?#].*$/, ''))) : null;
  if (ck) { const hit = cache.get(ck); if (hit) return { text: hit }; }
  const bytes = Utilities.base64Decode(String(b64 || ''));
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) return { text: '', error: 'size' };
  const o = ocrBlob_(Utilities.newBlob(bytes, 'image/jpeg', 'mt-ocr.jpg'));
  if (o.text && ck) { try { cache.put(ck, o.text, 6 * 3600); } catch (e) {} }
  return { text: o.text || '', error: o.error, type: 'image/jpeg', bytes: bytes.length };
}

function ocrBlob_(blob) {
  let id = null, text = '';
  try {
    if (Drive.Files.insert) {                        // Drive API v2
      id = Drive.Files.insert({ title: 'mt-ocr', mimeType: MimeType.GOOGLE_DOCS }, blob, { ocr: true, ocrLanguage: 'en' }).id;
    } else {                                         // Drive API v3
      id = Drive.Files.create({ name: 'mt-ocr', mimeType: MimeType.GOOGLE_DOCS }, blob, { ocrLanguage: 'en' }).id;
    }
    text = DocumentApp.openById(id).getBody().getText().replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000);
  } catch (e) {
    return { text: '', error: String(e && e.message || e).slice(0, 200) };
  } finally {
    if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }
  }
  return { text: text };
}
