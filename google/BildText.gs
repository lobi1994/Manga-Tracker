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
  if (hit != null) return { text: hit };

  const r = UrlFetchApp.fetch(u, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': UA } });
  const type = String(r.getHeaders()['Content-Type'] || r.getHeaders()['content-type'] || '');
  if (r.getResponseCode() !== 200 || !/^image\//i.test(type)) return { text: '', error: 'fetch ' + r.getResponseCode() };
  const blob = r.getBlob().setName('mt-ocr.jpg');
  if (blob.getBytes().length > 10 * 1024 * 1024) return { text: '', error: 'size' };

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
  try { cache.put(ck, text, 6 * 3600); } catch (e) {}
  return { text: text };
}
