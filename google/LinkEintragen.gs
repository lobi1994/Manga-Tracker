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
