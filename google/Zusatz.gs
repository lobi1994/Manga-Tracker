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
