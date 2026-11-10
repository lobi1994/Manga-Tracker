// ==UserScript==
// @name         Manga Tracker – Lesestand
// @namespace    https://github.com/lobi1994/Manga-Tracker
// @version      1.0.0
// @description  Zeigt auf der Kapitelübersicht, wo du aufgehört hast, und speichert gelesene Kapitel automatisch in deinem Manga Tracker.
// @author       lobi1994
// @match        *://*/*
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @run-at       document-idle
// @noframes
// ==/UserScript==

/*
 * Setup (once): open https://lobi1994.github.io/Manga-Tracker/ in Safari (not the home screen app),
 * with your setup link if it asks for one. The script takes your app link and key from there.
 *
 * What it does, only on reading sites that are already in your list:
 *  - Chapter overview of a series: shows "read up to X", marks that chapter and offers "Continue".
 *  - Chapter page, newer than your saved chapter: saves it automatically once you reach the end
 *    of the chapter (or tap the next chapter). A message with "Undo" appears.
 *  - Chapter page, older or same chapter: nothing is changed.
 *  - Series not in your list: asks once whether to add it.
 */
(async function () {
  'use strict';

  const MIN_READ_MS = 15000;          // at least 15 s on a chapter before scrolling to the end counts as read
  const HOSTS_TTL = 6 * 3600 * 1000;  // refresh the list of reading sites every 6 hours
  const ACCENT = '#e0457b';
  const de = /^de\b/i.test(navigator.language || '');
  const T = (en, deTxt) => (de ? deTxt : en);
  const host = location.hostname.toLowerCase().replace(/^www\./, '');
  let box = null, undoUntil = 0;

  /* ------------------------------------------------------------ setup */
  if (host === 'lobi1994.github.io' && /^\/manga-tracker/i.test(location.pathname)) {
    setTimeout(async () => {
      let cfg = null;
      try { cfg = JSON.parse(localStorage.getItem('mt-cfg') || 'null'); } catch (e) {}
      if (!cfg || !/\/exec$/.test(cfg.u || '') || !cfg.k) return;
      const old = await GM.getValue('cfg', null);
      if (old && old.u === cfg.u && old.k === cfg.k) return;
      await GM.setValue('cfg', { u: cfg.u, k: cfg.k });
      await GM.setValue('hosts', null);
      pill(T('Reading overlay connected ✓', 'Lesestand-Overlay verbunden ✓'), [], 4000);
    }, 2500);
    return;
  }

  const cfg = await GM.getValue('cfg', null);
  if (!cfg) return;
  if (/(^|\.)(google\.com|googleusercontent\.com|github\.com|instagram\.com|youtube\.com)$/.test(host)) return;

  function call(fn, args) {
    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: 'POST',
        url: cfg.u,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        data: JSON.stringify({ fn: fn, key: cfg.k, args: args || [] }),
        onload: (r) => {
          let j = null;
          try { j = JSON.parse(r.responseText); } catch (e) { return reject(new Error('net')); }
          if (j && j.error) return reject(new Error(j.error));
          resolve(j ? j.result : null);
        },
        onerror: () => reject(new Error('net'))
      });
    });
  }

  /* ------------------------------------------- only on known reading sites */
  let hc = await GM.getValue('hosts', null);
  const refreshHosts = () => call('apiLesestandHosts').then(async (h) => {
    hc = { t: Date.now(), h: h || [] };
    await GM.setValue('hosts', hc);
    return hc;
  });
  if (!hc) { try { await refreshHosts(); } catch (e) { return; } }
  else if (Date.now() - hc.t > HOSTS_TTL) refreshHosts().catch(() => {});
  const known = (hc.h || []).some((h) => h === host || host.endsWith('.' + h) || h.endsWith('.' + host));
  if (!known) return;

  /* ------------------------------------------------------------- overlay */
  function root() {
    if (box && document.documentElement.contains(box.host)) return box;
    const hostEl = document.createElement('div');
    hostEl.style.cssText = 'all:initial;position:fixed;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none';
    const sh = hostEl.attachShadow({ mode: 'open' });
    sh.innerHTML = '<style>' +
      '.p{pointer-events:auto;margin:0 auto calc(14px + env(safe-area-inset-bottom));max-width:min(560px,calc(100vw - 24px));' +
      'display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;border-radius:16px;' +
      'background:rgba(24,22,28,.94);color:#fff;font:500 15px/1.35 -apple-system,system-ui,sans-serif;' +
      'box-shadow:0 6px 24px rgba(0,0,0,.35);transition:opacity .25s,transform .25s}' +
      '.p.h{opacity:0;transform:translateY(12px)}' +
      '.t{flex:1 1 180px}.t b{font-weight:700}' +
      'button{font:600 14px -apple-system,system-ui,sans-serif;border:0;border-radius:10px;padding:8px 12px;' +
      'background:' + ACCENT + ';color:#fff;cursor:pointer}' +
      'button.s{background:rgba(255,255,255,.14)}button.x{background:none;padding:6px 8px;opacity:.7}' +
      '</style><div class="p h"></div>';
    document.documentElement.appendChild(hostEl);
    box = { host: hostEl, el: sh.querySelector('.p'), timer: 0 };
    return box;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  /** Shows one message; buttons: [{label, onClick, style}] ; ms = 0 keeps it until closed. */
  function pill(html, buttons, ms) {
    const b = root();
    clearTimeout(b.timer);
    b.el.innerHTML = '<div class="t">' + html + '</div>';
    (buttons || []).forEach((btn) => {
      const e = document.createElement('button');
      e.textContent = btn.label;
      if (btn.style) e.className = btn.style;
      e.onclick = (ev) => { ev.stopPropagation(); btn.onClick(); };
      b.el.appendChild(e);
    });
    const x = document.createElement('button');
    x.className = 'x'; x.textContent = '✕'; x.onclick = hide;
    b.el.appendChild(x);
    requestAnimationFrame(() => b.el.classList.remove('h'));
    if (ms) b.timer = setTimeout(hide, ms);
  }
  function hide() { if (box) box.el.classList.add('h'); }
  /** Like pill, but waits until an Undo message is gone. */
  function softPill(html, buttons, ms) {
    const wait = undoUntil - Date.now();
    if (wait > 0) { const g = gen; setTimeout(() => { if (g === gen) pill(html, buttons, ms); }, wait); }
    else pill(html, buttons, ms);
  }

  /* ------------------------------------------------------- page analysis */
  const NUM = /(?:^|[^a-z])(?:chapter|chap|ch|episode|ep|kapitel|kap)\.?\s*#?\s*(\d{1,4}(?:\.\d)?)(?![\d])/i;
  function chapterOf(u) {
    let p;
    try { p = decodeURIComponent(new URL(u, location.href).pathname); } catch (e) { return null; }
    const m = p.match(/chapter[-_\/ ]?(\d+(?:[.-]\d+)?)/i) || p.match(/\/ch[-_]?(\d+)/i) || p.match(/episode[-_]?(\d+)/i) || p.match(/\/(\d{1,4})_[0-9]{6,}/);
    return m ? parseFloat(m[1].replace('-', '.')) : null;
  }
  function sameHost(a) { try { return new URL(a.href).hostname.replace(/^www\./, '') === host; } catch (e) { return false; } }
  /** Chapter links on the page: number → first link. */
  function chapterLinks() {
    const map = {};
    document.querySelectorAll('a[href]').forEach((a) => {
      if (!sameHost(a)) return;
      let n = chapterOf(a.href);
      if (n == null) { const m = (a.textContent || '').replace(/\s+/g, ' ').slice(0, 80).match(NUM); if (m) n = parseFloat(m[1]); }
      if (n != null && n > 0 && n < 5000 && !map[n]) map[n] = a;
    });
    return map;
  }

  /* ---------------------------------------------- undo after navigation */
  function offerUndo(res) {
    undoUntil = Date.now() + 8000;
    const left = res.unread ? T(' · ' + res.unread + ' unread', ' · ' + res.unread + ' offen') : '';
    pill('✓ <b>' + esc(res.title) + '</b>: ' + T('chapter ', 'Kapitel ') + esc(res.ch) + T(' saved', ' gespeichert') + left,
      [{ label: T('Undo', 'Rückgängig'), style: 's', onClick: () => {
        call('apiRueckgaengig', [res.id, res.prev]).then(
          () => pill(T('Undone.', 'Rückgängig gemacht.'), [], 3000),
          () => pill(T('Undo failed – please fix it in the app.', 'Rückgängig ging nicht – bitte in der App korrigieren.'), [], 5000));
      } }], 8000);
  }
  const pending = await GM.getValue('pending', null);
  if (pending) {
    await GM.setValue('pending', null);
    if (Date.now() - pending.t < 30000) offerUndo(pending.res);
  }

  /* ------------------------------------------------------------ main run */
  let gen = 0, cleanup = [];
  async function run() {
    const my = ++gen;
    cleanup.forEach((f) => f()); cleanup = [];
    const url = location.href;
    const ch = chapterOf(url);
    if (ch == null) {
      // Overview page? Only ask the server if the page lists several chapters.
      await new Promise((r) => setTimeout(r, 800));
      if (my !== gen) return;
      if (Object.keys(chapterLinks()).length < 3) return;
    }
    let st;
    try { st = await call('apiLesestand', [url]); } catch (e) { return; }
    if (my !== gen || !st) return;
    if (ch == null) return overview(st);
    return chapterPage(st, ch, url, my);
  }

  /* ---------------- overview page: "Wo war ich?" */
  function overview(st) {
    if (!st.found) return;
    if (st.chapter == null) {
      softPill('<b>' + esc(st.title) + '</b>: ' + T('no chapter saved yet', 'noch kein Kapitel gespeichert'), [], 4000);
      return;
    }
    const saved = Math.floor(st.chapter);
    const links = chapterLinks();
    const cur = links[st.chapter] || links[saved];
    const next = links[saved + 1];
    [[cur, ACCENT], [next, '#7a8cff']].forEach(([a, col]) => {
      if (!a) return;
      const old = a.getAttribute('style') || '';
      a.style.outline = '2px solid ' + col; a.style.outlineOffset = '2px'; a.style.borderRadius = '6px';
      a.style.background = col + '22';
      cleanup.push(() => a.setAttribute('style', old));
    });
    const neu = st.latest != null && st.latest > saved ? T(' · ' + (Math.floor(st.latest) - saved) + ' new', ' · ' + (Math.floor(st.latest) - saved) + ' neu') : '';
    const btns = [];
    const nextHref = next ? next.href : st.next;
    if (nextHref) btns.push({ label: T('Continue: ', 'Weiter: ') + (saved + 1) + ' ›', onClick: () => { location.href = nextHref; } });
    if (cur) btns.push({ label: T('Show', 'Zeigen'), style: 's', onClick: () => cur.scrollIntoView({ behavior: 'smooth', block: 'center' }) });
    softPill('<b>' + esc(st.title) + '</b> · ' + T('read up to ', 'gelesen bis ') + esc(st.chapter) + neu, btns, 0);
  }

  /* ---------------- chapter page: save automatically at the end */
  async function chapterPage(st, ch, url, my) {
    if (!st.found) {
      const dis = (await GM.getValue('dismissed', [])) || [];
      const k = (st.title || '').toLowerCase();
      if (!k || dis.indexOf(k) >= 0) return;
      pill('<b>' + esc(st.title) + '</b> ' + T('is not in your list.', 'ist nicht in deiner Liste.'), [
        { label: T('Add', 'Hinzufügen'), onClick: () => {
          call('apiNeueSerie', [url]).then((m) => pill(esc(m), [], 5000), () => pill(T('Could not add it.', 'Hinzufügen ging nicht.'), [], 4000));
        } },
        { label: T('Not now', 'Nicht jetzt'), style: 's', onClick: async () => {
          dis.push(k); await GM.setValue('dismissed', dis.slice(-200)); hide();
        } }
      ], 0);
      return;
    }
    if (st.chapter != null && ch <= st.chapter) {
      softPill('<b>' + esc(st.title) + '</b> · ' + T('read up to ', 'gelesen bis ') + esc(st.chapter), [], 2500);
      return;
    }

    const start = Date.now();
    let done = false;
    if (Date.now() >= undoUntil) pill('<b>' + esc(st.title) + '</b> · ' + T('chapter ', 'Kapitel ') + esc(ch) + T(' is saved when you reach the end', ' wird am Ende gespeichert'), [], 3000);

    const save = () => {
      if (done || my !== gen) return Promise.resolve(null);
      done = true;
      return call('apiAutoGelesen', [url]).then((res) => {
        if (res && res.ok) offerUndo(res);
        return res;
      }, () => { done = false; return null; });
    };

    // End of the chapter: bottom of the last large picture is on screen (or 90 % of the page for text)
    const atEnd = () => {
      const imgs = Array.prototype.filter.call(document.images, (i) => i.getBoundingClientRect().width > innerWidth * 0.5 && i.getBoundingClientRect().height > 200);
      if (imgs.length >= 3) return imgs[imgs.length - 1].getBoundingClientRect().bottom <= innerHeight * 1.15;
      const de2 = document.documentElement;
      return scrollY + innerHeight >= de2.scrollHeight * 0.9;
    };
    let tick = 0;
    const onScroll = () => {
      if (tick) return;
      tick = setTimeout(() => { tick = 0; if (!done && Date.now() - start >= MIN_READ_MS && atEnd()) save(); }, 300);
    };
    addEventListener('scroll', onScroll, { passive: true });
    cleanup.push(() => removeEventListener('scroll', onScroll));

    // Tap on "next chapter": save first, then go on (the message with Undo appears on the next page)
    const onClick = (ev) => {
      const a = ev.target && ev.target.closest && ev.target.closest('a[href]');
      if (!a || done || !sameHost(a)) return;
      const n = chapterOf(a.href);
      const isNext = (n != null && n > ch && n <= ch + 2) || (n == null && /\b(next|nächst|weiter)\b|›|»|→/i.test(a.textContent || '') && a.href !== url);
      if (!isNext) return;
      ev.preventDefault(); ev.stopPropagation();
      const go = () => { location.href = a.href; };
      const timer = setTimeout(go, 2500);
      save().then(async (res) => {
        if (res && res.ok) await GM.setValue('pending', { t: Date.now(), res: res });
        clearTimeout(timer); go();
      });
    };
    document.addEventListener('click', onClick, true);
    cleanup.push(() => document.removeEventListener('click', onClick, true));
  }

  run();
  // Sites that change chapters without reloading the page
  let last = location.href;
  setInterval(() => { if (location.href !== last) { last = location.href; hide(); run(); } }, 1000);
})();
