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
