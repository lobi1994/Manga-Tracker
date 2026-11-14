/** Schneller Start (v2.10): eine einzige Anfrage beim Öffnen statt fünf.
 *  apiStart liefert Liste, Kategorien, Einstellungen, Filter, Seiten-Markierungen, Hintergrund und Tabellen-Link.
 *  „rev“ ist ein Fingerabdruck der Liste. Schickt die App den Fingerabdruck mit, den sie schon hat,
 *  und hat sich nichts geändert, kommt nur „same: true“ zurück – die Liste wird dann nicht noch einmal übertragen. */
function apiStart(key, have) {
  check_(key);
  const t0 = Date.now();
  const items = alle_();
  const categories = kategorien_();
  const props = PropertiesService.getScriptProperties().getProperties();
  const lesen = function (k, leer) { try { return JSON.parse(props[k] || 'null') || leer; } catch (e) { return leer; } };
  const rev = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
    JSON.stringify([items, categories]), Utilities.Charset.UTF_8)).slice(0, 16);
  const out = {
    rev: rev, categories: categories, prefs: lesen('prefs', {}),
    filters: lesen('filters', null), siteGone: lesen('siteGone', {}),
    bg: hintergrundInfo_(props.bgId || ''),
    sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl()
  };
  if (have && have === rev) out.same = true; else out.items = items;
  out.ms = Date.now() - t0;
  return out;
}
