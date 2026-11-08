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
