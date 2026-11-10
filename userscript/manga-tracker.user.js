// ==UserScript==
// @name         Manga Tracker – Lesestand
// @namespace    https://github.com/lobi1994/Manga-Tracker
// @version      1.10.0
// @description  Zeigt auf der Kapitelübersicht, wo du aufgehört hast, speichert gelesene Kapitel automatisch und hilft, Manga-Ideen von Instagram in deinen Manga Tracker zu übernehmen.
// @author       lobi1994
// @match        *://*/*
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @run-at       document-idle
// @noframes
// @updateURL    https://raw.githubusercontent.com/lobi1994/Manga-Tracker/main/userscript/manga-tracker.user.js
// @downloadURL  https://raw.githubusercontent.com/lobi1994/Manga-Tracker/main/userscript/manga-tracker.user.js
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
 *
 * On instagram.com (Safari, logged in): shows your saved manga ideas (shortcut "Manga merken"),
 * suggests titles from the caption and picture texts, shows the chapter count and adds a series with one tap.
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
  // On the Manga Tracker page in Safari: take app link + key and check the connection.
  // Keeps looking for 3 minutes, so pasting the setup link after the page opened works too.
  if (host === 'lobi1994.github.io' && /^\/manga-tracker/i.test(location.pathname)) {
    const until = Date.now() + 180000;
    let lastTried = '';
    pill(T('Overlay is running – checking connection …', 'Overlay läuft – prüfe Verbindung …'), [], 0);
    const look = async () => {
     try {
      let c = null;
      try { c = JSON.parse(localStorage.getItem('mt-cfg') || 'null'); } catch (e) {}
      if (c && /\/exec$/.test(c.u || '') && c.k && c.u + c.k !== lastTried) {
        lastTried = c.u + c.k;
        const cfg0 = { u: c.u, k: c.k };
        await GM.setValue('cfg', cfg0);
        await GM.setValue('hosts', null);
        callWith(cfg0, 'apiLesestandHosts').then(async (h) => {
          await GM.setValue('hosts', { t: Date.now(), h: h || [] });
          pill(T('Reading overlay connected ✓ · ', 'Lesestand-Overlay verbunden ✓ · ') + (h || []).length + T(' reading sites', ' Leseseiten'), [], 6000);
        }, (e) => {
          const m = String(e && e.message || e);
          pill(/Unbekannte Funktion/.test(m)
            ? T('Connected, but the server file is missing: add Lesestand.gs in Apps Script and deploy a new version.', 'Verbunden, aber die Server-Datei fehlt: Lesestand.gs in Apps Script anlegen und eine neue Version bereitstellen.')
            : T('Connection failed: ', 'Verbindung fehlgeschlagen: ') + esc(m), [], 0);
        });
        return;
      }
      if (!lastTried) pill(T('No setup found on this page yet. Paste your setup link here.', 'Noch keine Einrichtung auf dieser Seite. Bitte deinen Einrichtungs-Link hier einfügen.'), [], 0);
      if (Date.now() < until) setTimeout(look, 2000);
     } catch (err) { pill(T('Overlay error: ', 'Overlay-Fehler: ') + esc(err && err.message || err), [], 0); }
    };
    setTimeout(look, 1500);
    return;
  }

  const cfg = await GM.getValue('cfg', null);
  if (!cfg) return;
  if (/(^|\.)(google\.com|googleusercontent\.com|github\.com|youtube\.com)$/.test(host)) return;

  function call(fn, args) { return callWith(cfg, fn, args); }
  function callWith(cfg, fn, args) {
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

  if (host === 'instagram.com' || host.endsWith('.instagram.com')) { instagram(); return; }

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
      '.p.big{max-height:62vh;overflow:auto;align-items:flex-start}.w{width:100%}.hd{flex:1;font-weight:700;cursor:pointer}' +
      '.p.min{max-height:none;overflow:visible;align-items:center;max-width:max-content}.p.min>*:not(.keep){display:none}' +
      '.chips{display:flex;flex-wrap:wrap;gap:6px;width:100%;margin:4px 0}.chips button{background:rgba(255,255,255,.14);font-weight:500;padding:6px 10px}' +
      '.q{display:flex;gap:6px;width:100%}input{flex:1;min-width:0;font:15px -apple-system,system-ui,sans-serif;padding:8px 10px;border-radius:10px;border:0;background:#fff;color:#111}' +
      '.r{display:flex;gap:10px;align-items:center;width:100%;padding:8px 0;border-top:1px solid rgba(255,255,255,.12)}' +
      '.r img{width:44px;height:62px;object-fit:cover;border-radius:6px;background:#333;flex:none}.r .i{flex:1;min-width:0}.m{opacity:.75;font-size:13px}.ok{color:#8fe3a1;font-size:13px}' +
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
    b.el.classList.remove('big', 'min');
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
  /** Larger panel: build(el) fills it. */
  function card(build) {
    const b = root();
    clearTimeout(b.timer);
    b.el.innerHTML = '';
    b.el.classList.add('big');
    build(b.el);
    requestAnimationFrame(() => b.el.classList.remove('h'));
  }
  function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(label, cls, onClick) { const e = mk('button', cls, label); e.onclick = (ev) => { ev.stopPropagation(); onClick(e); }; return e; }
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


  /* =============================================================== Instagram */
  function instagram() {
    const igId = (u) => { const m = String(u || '').match(/instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/i); return m ? m[1] : null; };
    let inbox = [], lastKey = '-', open = false, searched = false, chipBox = null;
    let ocrTexts = [], ocrDone = {}, ocrBusy = 0, ocrOff = false, ocrInfo = null;
    let blocked = [];                                        // suggestions you hid on this post (long press / swipe); back when the post is opened again
    let refreshHidden = () => {};
    GM.setValue('igBlock', []);                              // older versions hid suggestions on every post: clear that list
    const loadInbox = () => call('apiInbox').then((l) => { inbox = l || []; return inbox; }, () => inbox);
    const nextOf = (id) => inbox.find((x) => x.id !== id);

    // Texts on the page: preview text, caption, picture descriptions (Instagram often puts the text on the picture there)
    // Only the post on screen: an opened post window, otherwise the first post of the page (not "More posts" below)
    const firstId = igId(location.href);
    function postScope() {
      const dlg = document.querySelector('div[role="dialog"] article') || document.querySelector('div[role="dialog"]');
      if (dlg) return dlg;
      const main = document.querySelector('main') || document.body;
      return main.querySelector('article') || main;
    }
    // Account that posted it (e.g. manhwa.flow.official): never a manga title
    function authors() {
      const out = new Set();
      postScope().querySelectorAll('a[href^="/"]').forEach((a) => {
        const m = (a.getAttribute('href') || '').match(/^\/([A-Za-z0-9_.]{2,30})\/?$/);
        if (m && (a.textContent || '').trim().toLowerCase() === m[1].toLowerCase()) out.add(m[1]);
      });
      if (igId(location.href) === firstId) {
        const d = document.querySelector('meta[property="og:description"]');
        const m = d && d.content && d.content.match(/[-–]\s*([A-Za-z0-9_.]{2,30})\s+(?:on|am)\s/);
        if (m) out.add(m[1]);
      }
      return [...out].map((x) => x.toLowerCase().replace(/[^a-z0-9]/g, '')).filter((x) => x.length >= 3);
    }
    const isAuthor = (t, list) => {
      const n = t.toLowerCase().replace(/[^a-z0-9]/g, '');
      return n.length >= 3 && list.some((a) => n === a || (n.length >= 5 && a.indexOf(n) >= 0) || (a.length >= 5 && n.indexOf(a) >= 0));
    };
    function texts() {
      const out = [];
      // The preview text in the page head belongs to the post the page was loaded with
      if (igId(location.href) === firstId) ['og:description', 'og:title'].forEach((p) => { const m = document.querySelector('meta[property="' + p + '"]'); if (m && m.content) out.push(m.content); });
      const scope = postScope();
      scope.querySelectorAll('h1').forEach((h) => out.push(h.innerText || ''));
      scope.querySelectorAll('img[alt]').forEach((i) => { if (i.getBoundingClientRect().width > 150 && i.alt.length > 12) out.push(i.alt); });
      return out;
    }
    const NOISE = /^(manhwa|manga|manhua|webtoon|webtoons|murim|action|fantasy|romance|comedy|drama|isekai|anime|otaku|follow|like|comment|share|save|link in bio|read|reading|recommendation|recommendations|part \d+|new|top \d+)s?$/i;
    // Words that describe a series (status, genre, chapter count …) – not its title
    const INFO = 'ongoing|completed?|finished|hiatus|on hiatus|dropped|cancell?ed|season \\d+|the end|end|new|hot|top|best|must read|' +
      'action|adventure|fantasy|dark fantasy|romance|comedy|drama|horror|thriller|mystery|psychological|tragedy|isekai|murim|martial arts?|wuxia|' +
      'regression|regressor|reincarnation|reincarnated|transmigration|revenge|system|leveling|level up|dungeons?|hunters?|harem|school life|school|slice of life|' +
      'cultivation|overpowered|op mc|op|villainess|historical|sports|sci-?fi|shounen|seinen|shoujo|josei|supernatural|magic|demons?|' +
      'manhwa|manhua|manga|webtoons?|comics?|genres?|status|chapters?|episodes?|rating|type|author|artist|art|story|published|release|summary|synopsis|' +
      'recommendation|recommendations|part \\d+|vol\\.? ?\\d+|volume \\d+';
    const INFO_ONLY = new RegExp('^(?:(?:' + INFO + ')(?:[\\s,/&|•·+\\-:]+|$))+$', 'i');
    function isInfo(t) {
      if (INFO_ONLY.test(t)) return true;
      if (/^\d+\+?\s*(?:ch(?:apter)?s?|chaps?|eps?|episodes?|kapitel|kap|volumes?|vols?)\b/i.test(t)) return true;       // 262 Chapters
      if (/\b(?:ch(?:apter)?s?|chaps?|eps?|episodes?|kapitel|kap)\.?\s*#?\s*\d+/i.test(t)) return true;                     // Chapter 262, Ch. 120+
      if (/^(?:genres?|status|chapters?|episodes?|rating|type|author|artist|art|story|released?|year|score|tags?)\s*[:\-–]/i.test(t)) return true;
      if (/\d+(?:[.,]\d+)?\s*\/\s*(?:10|5)\b|★|⭐|☆/.test(t)) return true;                                               // 9.5/10, stars
      const letters = (t.match(/\p{L}/gu) || []).length;
      return letters < 3 || letters < t.replace(/\s/g, '').length * 0.6;                                                   // mostly numbers or symbols
    }
    // Remove chapter counts, status words and phrases like "Follow for more" from a line
    const STATUS = 'ongoing|completed?|finished|hiatus|on hiatus|dropped|cancell?ed|end|the end|new|hot|laufend|abgeschlossen|pausiert';
    const CH = 'ch(?:apter)?s?|chaps?|eps?|episodes?|kapitel|kap';
    function clean(t) {
      // The picture reader often reads the separator "|" as "I", "l" or "1": "292 CHAPTERS I COMPLETED"
      t = String(t || '').replace(new RegExp('\\s[Il1|]\\s+(?=(?:' + STATUS + ')\\b)', 'gi'), ' | ')
        .replace(new RegExp('(\\b(?:' + CH + '))\\s+[Il1]\\s', 'gi'), '$1 | ');
      if (/\b(may be an image|could be an image|kann ein bild|könnte ein bild|image of|photo by|foto von|photo shared by|beitrag von|reel von|video von)\b/i.test(t) && !/[„"“]/.test(t)) return '';
      t = t.replace(/\b(?:follow|folge|folgt)\s+(?:me\s+|us\s+|mir\s+|uns\s+)?(?:for|für)\s+(?:more|mehr)\b[^\n]*/gi, ' ')
        .replace(/\b(?:follow|folge|folgt)\s+@?\S+/gi, ' ')
        .replace(/\b(?:beitrag|beiträge|post|posts|reel|reels)\b/gi, ' ')
        .replace(/\b(?:end\s+of\s+(?:the\s+)?season(?:\s*\d+)?|season\s*\d*\s*(?:end|finale|ended|break)|staffel\s*\d*\s*(?:ende|finale)|ende\s+der\s+staffel|season\s*\d+)\b/gi, ' ')
        .replace(new RegExp('\\b\\d+\\+?\\s*(?:' + CH + ')\\b\\.?', 'gi'), ' ')                // 308 Chapters
        .replace(new RegExp('\\b(?:' + CH + ')\\.?\\s*[:#]?\\s*\\d+(?:\\.\\d+)?\\+?', 'gi'), ' ') // Chapter 308, Ch. 120+
        .replace(/[(\[]\s*[)\]]/g, ' ');
      const tail = new RegExp('[\\s\\-–—|•·:,/(\\[]+(?:' + STATUS + ')[\\s)\\].!]*$', 'i');
      const head = new RegExp('^[\\s(\\[]*(?:' + STATUS + ')[\\s)\\]]*[\\-–—|•·:,/]+', 'i');
      for (let k = 0; k < 4; k++) t = t.replace(tail, '').replace(head, '').replace(/\s+[|Il1]\s*$/, '');
      return t.replace(/[\s\-–—|•·:,/]+$/g, '').replace(/^[\s\-–—|•·:,/]+/g, '').replace(/\s+/g, ' ').trim();
    }
    const TAGNOISE = /manhwa|manga|manhua|webtoon|anime|otaku|recommend|reels?|fyp|foryou|explore|viral|trend|edit|amv|follow/i;
    function candidates(list, ocr) {
      const c = new Map();
      const add = (t, s) => {
        t = clean(t);
        if (!t) return;
        t = String(t || '').replace(/[\u{1F000}-\u{1FFFF}☀-➿️]/gu, '')
          .replace(/^[\s\d.\-–—:)•*#"“„'«»]+|[\s"“”'»«.,!?:;(\-–—]+$/g, '').replace(/\s+/g, ' ').trim()
          .replace(/^(?:name|title|titel|manhwa|manga|manhua|webtoon)\s*[:\-–]\s*/i, '');
        if (t.length < 3 || t.length > 90 || NOISE.test(t) || /^\d+$/.test(t) || isInfo(t)) return;
        if (/\b(likes?|comments?|gefällt|kommentare)\b/i.test(t) && /\d/.test(t)) return;
        if (/\b(need to read|must read|you should|top \d+|best \w+ (?:manhwa|manga)|recommend|empfehl|part \d+)\b/i.test(t)) return;
        const k = t.toLowerCase();
        const o = c.get(k); if (o) o.s += s; else c.set(k, { t: t, s: s });
      };
      list.forEach((raw) => {
        if (!raw) return;
        let x = String(raw);
        const q = x.match(/:\s*["“]([\s\S]*)["”]\s*\.?\s*$/); if (q) x = q[1];                  // '123 likes … : "caption"'
        (x.match(/[„"“]([^"”“„]{3,80})["”“]/g) || []).forEach((m) => add(m.slice(1, -1), 3));   // quoted text on pictures
        (x.match(/(?:name|title|titel|manhwa|manga|manhua|webtoon)\s*[:\-–]\s*([^\n#|"“”„]{3,70})/ig) || []).forEach((m) => add(m.replace(/^[^:\-–]+[:\-–]\s*/, ''), 5));
        x.split(/\n|\s[|•·]\s|(?:^|\s)\d{1,2}[.)]\s/).forEach((l) => {
          l = l.replace(/#\S+/g, '').replace(/@\S+/g, '').trim();
          if (l && l.split(' ').length <= 9) add(l, 1);
        });
        (x.match(/#[\p{L}\d_]{4,40}/gu) || []).forEach((h) => {
          if (TAGNOISE.test(h)) return;
          add(h.slice(1).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'), 0.5);
        });
      });
      // Text read from the pictures: single lines, and titles spread over 2-3 lines
      (ocr || []).forEach((raw) => {
        // Numbered lists ("1. Title 2. Title") often come back as one long line: one line per entry
        const lines = String(raw || '').replace(/(?:^|\s)\d{1,2}[.)]\s+(?=\p{L})/gu, '\n').replace(/\s[|•·]\s/g, '\n').split(/\n+/).map((l) => l.trim()).filter(Boolean)
          .map((l) => {
            if (!/[A-Za-z]{2}/.test(l) || /@|https?:|www\.|\.com\b/i.test(l) || /^(read|swipe|save|link in bio|read now|swipe left)\b/i.test(l)) return null;
            const c2 = clean(l);
            if (!c2 || isInfo(c2.replace(/[^\p{L}\d\s\/.:+★⭐-]/gu, '').trim())) return null;
            // A line that had a chapter count or status removed is a complete title on its own: never join it with neighbours
            const whole = c2.replace(/\s+/g, ' ').toLowerCase() !== l.replace(/\s+/g, ' ').trim().toLowerCase();
            return whole ? { t: c2, whole: true } : c2;
          });
        const joinable = (x) => typeof x === 'string';
        lines.forEach((l, i) => {
          if (!l) return;
          if (typeof l === 'object') { add(l.t, 2.5); return; }
          const words = l.split(' ').length;
          if (words <= 9 && !(words === 1 && l.length < 5)) add(l, 1.5);
          const two = lines.slice(i, i + 2), three = lines.slice(i, i + 3);
          if (two.length === 2 && two.every((x) => joinable(x) && x.split(' ').length <= 4)) add(two.join(' '), 2);
          if (three.length === 3 && three.every((x) => joinable(x) && x.split(' ').length <= 3)) add(three.join(' '), 2.5);
        });
      });
      // Drop pieces of a title that is already suggested in full ("MOUNT HUA" next to "Return of the Mount Hua Sect")
      const all = [...c.values()].sort((a, b) => b.s - a.s || b.t.length - a.t.length);
      const kept = [];
      all.forEach((o) => {
        const k = o.t.toLowerCase();
        if (kept.some((x) => x.t.length > o.t.length && x.t.toLowerCase().indexOf(k) >= 0)) return;
        kept.push(o);
      });
      return kept.slice(0, 10).map((o) => o.t);
    }

    // Pictures on screen right now (in a picture series: the one you swiped to)
    function visibleImages() {
      const scope = postScope();
      return Array.prototype.filter.call(scope.querySelectorAll('img'), (i) => {
        const r = i.getBoundingClientRect();
        const src = i.currentSrc || i.src || '';
        return r.width > 200 && r.height > 150 && r.left > -20 && r.right < innerWidth + 20 && r.bottom > 0 && r.top < innerHeight
          && /^https:\/\/[^\/]*(cdninstagram\.com|fbcdn\.net)\//i.test(src);
      }).map((i) => i.currentSrc || i.src);
    }
    // Load the picture bytes (no CORS limits here) and turn them into a JPEG the Google text reader understands
    function gmBlob(url) {
      return new Promise((resolve, reject) => GM.xmlHttpRequest({
        method: 'GET', url: url, responseType: 'blob',
        onload: (r) => {
          if (r.status !== 200 || !r.response) return reject(new Error('fetch ' + r.status));
          resolve(r.response instanceof Blob ? r.response : new Blob([r.response]));
        },
        onerror: () => reject(new Error('net'))
      }));
    }
    async function jpegB64(src) {
      const bmp = await createImageBitmap(await gmBlob(src));
      const sc = Math.max(0.3, Math.min(2, 1600 / Math.max(bmp.width, bmp.height)));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(bmp, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.88).split(',')[1];
    }
    function bildText(src) {
      return jpegB64(src).then((b64) => call('apiBildTextDaten', [b64, src]), () => call('apiBildText', [src]));
    }
    function readPictures(onNew) {
      if (ocrOff) return;
      visibleImages().forEach((src) => {
        const k = src.replace(/[?#].*$/, '');
        if (ocrDone[k] || Object.keys(ocrDone).length >= 12) return;
        ocrDone[k] = 1; ocrBusy++;
        if (ocrInfo) ocrInfo.textContent = T('🔍 Reading picture …', '🔍 Bild wird gelesen …');
        bildText(src).then((r) => {
          ocrBusy--;
          if (r && r.error === 'drive') { ocrOff = true; if (ocrInfo) ocrInfo.textContent = T('Picture reading is not set up (Drive API).', 'Bilderkennung nicht eingerichtet (Drive API).'); return; }
          let note;
          if (r && r.text) {
            ocrTexts.push(r.text); onNew();
            const first = r.text.replace(/\s+/g, ' ').slice(0, 90);
            note = T('Picture read ✓: ', 'Bild gelesen ✓: ') + '„' + first + (r.text.length > 90 ? ' …' : '') + '“';
          } else if (r && r.error) note = T('Picture not readable: ', 'Bild nicht lesbar: ') + r.error;
          else note = T('No text found on this picture', 'Kein Text auf diesem Bild erkannt') + (r && r.type ? ' (' + r.type + ', ' + Math.round((r.bytes || 0) / 1024) + ' KB)' : '');
          if (ocrInfo) ocrInfo.textContent = note + T(' · Swipe for the next picture.', ' · Wisch weiter für das nächste Bild.');
        }, () => { ocrBusy--; if (ocrInfo && !ocrBusy) ocrInfo.textContent = ''; });
      });
    }

    function fillChips(onPick) {
      if (!chipBox) return;
      const who = authors();
      const list = candidates(texts(), ocrTexts).filter((t) => blocked.indexOf(t.toLowerCase()) < 0 && !isAuthor(t, who));
      chipBox.innerHTML = '';
      if (!list.length) chipBox.appendChild(mk('div', 'm', T('No title found in the text – type it in, or swipe to the next picture.', 'Kein Titel im Text gefunden – tipp ihn ein oder wisch zum nächsten Bild.')));
      list.forEach((t) => chipBox.appendChild(chip(t, onPick)));
    }

    // Remove a suggestion for good: hold it, or swipe it sideways
    function removeChip(t, b, onPick) {
      const k = t.toLowerCase();
      if (blocked.indexOf(k) < 0) { blocked.push(k); }
      b.remove();
      refreshHidden();
      if (!ocrInfo) return;
      ocrInfo.textContent = '„' + t + '“ ' + T('hidden', 'ausgeblendet') + ' ';
      ocrInfo.appendChild(btn(T('Undo', 'Rückgängig'), 's', () => {
        blocked = blocked.filter((x) => x !== k);
        ocrInfo.textContent = ''; fillChips(onPick);
      }));
    }
    function chip(t, onPick) {
      const b = mk('button', '', t);
      b.style.cssText = '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:pan-y;transition:opacity .15s';
      let timer = 0, x0 = 0, y0 = 0, dx = 0, swiping = false, used = false;
      b.addEventListener('touchstart', (e) => {
        const q = e.touches[0]; x0 = q.clientX; y0 = q.clientY; dx = 0; swiping = false; used = false;
        timer = setTimeout(() => { used = true; removeChip(t, b, onPick); }, 800);
      }, { passive: true });
      b.addEventListener('touchmove', (e) => {
        const q = e.touches[0]; dx = q.clientX - x0;
        if (Math.abs(q.clientY - y0) > 12 || Math.abs(dx) > 8) clearTimeout(timer);
        if (Math.abs(dx) > 8) { swiping = true; b.style.transform = 'translateX(' + dx + 'px)'; b.style.opacity = String(Math.max(0.15, 1 - Math.abs(dx) / 120)); }
      }, { passive: true });
      const end = () => {
        clearTimeout(timer);
        if (swiping && Math.abs(dx) > 60) { used = true; removeChip(t, b, onPick); return; }
        if (swiping) used = true;
        b.style.transform = ''; b.style.opacity = '';
      };
      b.addEventListener('touchend', end);
      b.addEventListener('touchcancel', end);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      b.onclick = (ev) => { ev.stopPropagation(); if (used) { used = false; return; } onPick(t); };
      return b;
    }

    function showPanel(id) {
      open = true; searched = false;
      ocrTexts = []; ocrDone = {}; ocrBusy = 0;
      const fromInbox = inbox.some((x) => x.id === id);
      card((el) => {
        const head = mk('div', 'hd keep', '');
        const full = '📚 ' + T('Which manga is it? Tap the title:', 'Welcher Manga? Tipp auf den Titel:');
        const small = '📚 ' + T('Manga search', 'Manga-Suche');
        head.textContent = full;
        // Minimise: shrink to a small button so you can look at the post again; tap to open it again
        const minBtn = btn('▾', 'x keep', () => toggle());
        const toggle = () => {
          const m = el.classList.toggle('min');
          head.textContent = m ? small : full;
          minBtn.textContent = m ? '▴' : '▾';
        };
        head.onclick = () => { if (el.classList.contains('min')) toggle(); };
        el.classList.remove('min');
        el.appendChild(head);
        el.appendChild(minBtn);
        el.appendChild(btn('✕', 'x keep', () => { open = false; hide(); }));
        const ver = (typeof GM !== 'undefined' && GM.info && GM.info.script && GM.info.script.version) || '';
        el.appendChild(mk('div', 'm w', T('Hold or swipe a suggestion sideways to hide it for this post.', 'Vorschlag gedrückt halten oder zur Seite wischen, um ihn für diesen Beitrag auszublenden.') + (ver ? ' · v' + ver : '')));
        chipBox = mk('div', 'chips');
        el.appendChild(chipBox);
        ocrInfo = mk('div', 'm w', '');
        el.appendChild(ocrInfo);
        const q = mk('div', 'q');
        const inp = mk('input'); inp.placeholder = T('Type a title …', 'Titel eintippen …'); inp.type = 'search';
        const res = mk('div', 'w');
        const search = (t) => {
          t = String(t || '').trim(); if (!t) return;
          searched = true; inp.value = t;
          res.innerHTML = ''; res.appendChild(mk('div', 'm', T('Searching …', 'Suche …')));
          call('apiMangaSuche', [t]).then((list) => {
            res.innerHTML = '';
            if (!list || !list.length) { res.appendChild(mk('div', 'm', T('Nothing found. Try another spelling.', 'Nichts gefunden. Versuch eine andere Schreibweise.'))); return; }
            list.forEach((r) => {
              const row = mk('div', 'r');
              const im = mk('img'); if (r.image) im.src = r.image; im.referrerPolicy = 'no-referrer'; row.appendChild(im);
              const info = mk('div', 'i');
              info.appendChild(mk('div', '', r.title));
              const ch = r.latest ? (Math.floor(r.latest) + T(' chapters', ' Kapitel')) : T('chapters unknown', 'Kapitel unbekannt');
              info.appendChild(mk('div', 'm', [r.type, r.year, ch, r.completed ? T('completed', 'abgeschlossen') : ''].filter(Boolean).join(' · ')));
              row.appendChild(info);
              if (r.inList) row.appendChild(mk('div', 'ok', T('✓ in your list', '✓ in deiner Liste')));
              else row.appendChild(btn(T('Add', 'Hinzufügen'), '', (b) => {
                b.disabled = true; b.textContent = '…';
                call('apiInboxHinzufuegen', [r, location.href]).then((out) => {
                  inbox = inbox.filter((x) => x.id !== id);
                  b.replaceWith(mk('div', 'ok', T('✓ added', '✓ hinzugefügt')));
                  addNext();
                }, () => { b.disabled = false; b.textContent = T('Add', 'Hinzufügen'); });
              }));
              res.appendChild(row);
            });
          }, () => { res.innerHTML = ''; res.appendChild(mk('div', 'm', T('Search failed.', 'Suche fehlgeschlagen.'))); });
        };
        inp.onkeydown = (ev) => { if (ev.key === 'Enter') search(inp.value); };
        q.appendChild(inp); q.appendChild(btn(T('Search', 'Suchen'), '', () => search(inp.value)));
        el.appendChild(q);
        el.appendChild(res);
        const foot = mk('div', 'chips');
        const addNext = () => {
          foot.innerHTML = '';
          const nx = nextOf(id);
          if (nx) foot.appendChild(btn(T('Next idea › (', 'Nächste Idee › (') + (inbox.filter((x) => x.id !== id).length) + ')', '', () => { location.href = nx.url; }));
        };
        if (fromInbox) foot.appendChild(btn(T('Not interested', 'Kein Interesse'), 's', () => {
          call('apiInboxStatus', [location.href, 'verworfen', '']).then((l) => { inbox = l || []; const nx = inbox[0]; if (nx) location.href = nx.url; else pill(T('Inbox empty ✓', 'Inbox leer ✓'), [], 3000); });
        }));
        if (fromInbox) { const nx = nextOf(id); if (nx) foot.appendChild(btn(T('Skip ›', 'Später ›'), 's', () => { location.href = nx.url; })); }
        el.appendChild(foot);
        // Hidden suggestions: show them again (one by one or all)
        const hid = mk('div', 'chips');
        const showHidden = () => {
          hid.innerHTML = '';
          if (!blocked.length) return;
          const open2 = hid.dataset.open === '1';
          hid.appendChild(btn((open2 ? '▾ ' : '▸ ') + T('Hidden suggestions', 'Ausgeblendete Vorschläge') + ' (' + blocked.length + ')', 's', () => { hid.dataset.open = open2 ? '0' : '1'; showHidden(); }));
          if (!open2) return;
          blocked.slice().reverse().forEach((k) => hid.appendChild(btn('↺ ' + k, '', () => {
            blocked = blocked.filter((x) => x !== k); showHidden(); fillChips(search);
          })));
          hid.appendChild(btn(T('Show all again', 'Alle wieder anzeigen'), 's', () => {
            blocked = []; showHidden(); fillChips(search);
          }));
        };
        el.appendChild(hid);
        showHidden();
        refreshHidden = showHidden;
        fillChips(search);
        readPictures(() => { if (!searched) fillChips(search); });
        // Swiping through a picture series loads new pictures: update the suggestions and read the new picture
        let t = 0;
        const mo = new MutationObserver(() => { if (!open) return; clearTimeout(t); t = setTimeout(() => { if (!searched) fillChips(search); readPictures(() => { if (!searched) fillChips(search); }); }, 1200); });
        mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['alt'] });
        setTimeout(() => mo.disconnect(), 10 * 60 * 1000);
      });
    }

    async function check() {
      const id = igId(location.href);
      const key = id || location.pathname;                 // feed, profile, after login … each counts as a new page
      if (key === lastKey) return;
      lastKey = key;
      open = false; searched = false; chipBox = null; ocrInfo = null; blocked = [];
      ocrTexts = []; ocrDone = {}; ocrBusy = 0;                // forget everything from the previous post
      hide();
      await loadInbox();
      if (!id) {
        if (inbox.length) pill('📥 <b>' + inbox.length + '</b> ' + T('manga ideas saved', 'Manga-Ideen gemerkt'), [{ label: T('Open ›', 'Öffnen ›'), onClick: () => { location.href = inbox[0].url; } }], 0);
        else pill('📥 ' + T('No open manga ideas', 'Keine offenen Manga-Ideen'), [], 4000);
        return;
      }
      if (inbox.some((x) => x.id === id)) setTimeout(() => showPanel(id), 2000);   // from the inbox: start right away
      else pill('📚', [{ label: T('Find manga', 'Manga suchen'), style: 's', onClick: () => showPanel(id) }], 0);
    }
    check();
    setInterval(check, 1000);
    // Back in Safari after sharing something new in the Instagram app: look again
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !open) { lastKey = '-'; check(); } });
  }

  run();
  // Sites that change chapters without reloading the page
  let last = location.href;
  setInterval(() => { if (location.href !== last) { last = location.href; hide(); run(); } }, 1000);
})();
