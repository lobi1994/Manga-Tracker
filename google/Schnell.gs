/** Schneller Start (v2.10): eine einzige Anfrage beim Öffnen statt fünf.
 *  apiStart liefert Liste, Kategorien, Einstellungen, Filter, Seiten-Markierungen, Hintergrund und Tabellen-Link.
 *  „rev“ ist ein Fingerabdruck der Liste. Schickt die App den Fingerabdruck mit, den sie schon hat,
 *  und hat sich nichts geändert, kommt nur „same: true“ zurück – die Liste wird dann nicht noch einmal übertragen. */
function apiStart(key, have) {
  check_(key);
  const t0 = Date.now();
  const items = alle_();
  const t1 = Date.now();
  const categories = kategorien_();
  const t2 = Date.now();
  const props = eig_();
  const lesen = function (k, leer) { try { return JSON.parse(props[k] || 'null') || leer; } catch (e) { return leer; } };
  const rev = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
    JSON.stringify([items, categories]), Utilities.Charset.UTF_8)).slice(0, 16);
  // Tabellen-Link: einmal merken, statt ihn bei jedem Start bei Google abzufragen
  let url = props.sheetUrl || '';
  if (!url) { url = SpreadsheetApp.getActiveSpreadsheet().getUrl(); try { PropertiesService.getScriptProperties().setProperty('sheetUrl', url); } catch (e) {} }
  const out = {
    rev: rev, categories: categories, prefs: lesen('prefs', {}),
    filters: lesen('filters', null), siteGone: lesen('siteGone', {}),
    bg: hintergrundInfo_(props.bgId || ''),
    sheetUrl: url
  };
  if (have && have === rev) out.same = true; else out.items = items;
  // Zeiten in Millisekunden (für die Detailzeile der App): Liste lesen, Kategorien lesen, Rest
  out.ms = Date.now() - t0;
  out.t = [t1 - t0, t2 - t1, Date.now() - t2].concat(alle_.zeit || []);
  return out;
}
