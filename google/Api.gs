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
