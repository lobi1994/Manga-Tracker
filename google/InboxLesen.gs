/** Instagram-Ideen ohne Safari (v2.11).
 *  Nach dem Teilen (Kurzbefehl „Manga merken“) liest das Skript den Beitrag im Hintergrund selbst aus:
 *  die öffentliche Einbettungs-Seite des Beitrags liefert die Beschreibung und die Bilder; die Texterkennung
 *  (BildText.gs) liest die Bilder. Übrig bleiben nur Titel, die es bei MangaUpdates oder AniList wirklich gibt.
 *  Die App zeigt sie unter „Instagram-Ideen“ mit „Hinzufügen“ / „Nicht hinzufügen“. Angelegt wird nichts von selbst.
 *  Kostenlos: es werden nur Google-Dienste und die freien Schnittstellen von MangaUpdates und AniList benutzt. */

const IG_MAX_BILDER = 10;

function igJson_(v) { try { const a = JSON.parse(String(v || '') || 'null'); return Array.isArray(a) ? a : null; } catch (e) { return null; } }

/** Einbettungs-Seite eines Beitrags holen. */
function igEinbettung_(link) {
  const r = UrlFetchApp.fetch(link + 'embed/captioned/', { muteHttpExceptions: true, followRedirects: true,
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.8' } });
  return { code: r.getResponseCode(), html: r.getContentText() };
}

/** Aus der Einbettungs-Seite: Beschreibung und Bild-Adressen (bei Beiträgen zum Durchwischen alle Bilder). */
function igAuswerten_(html) {
  html = String(html || '');
  let caption = '';
  const m = html.match(/<div class="Caption">([\s\S]*?)<div class="CaptionComments"/) || html.match(/<div class="Caption">([\s\S]*?)<\/div>/);
  if (m) {
    caption = decode_(m[1].replace(/<a class="CaptionUsername"[\s\S]*?<\/a>/, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
      .replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  const entf = function (s) {
    return String(s).replace(/\\+u([0-9a-fA-F]{4})/g, function (x, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/\\+\//g, '/').replace(/&amp;/g, '&');
  };
  const seen = {}, bilder = [];
  const nimm = function (u) {
    u = entf(u);
    if (!/^https:\/\/[^\/]+\.(?:cdninstagram\.com|fbcdn\.net)\//.test(u)) return;
    const k = u.replace(/[?#].*$/, '').split('/').pop();
    if (!k || seen[k]) return;
    seen[k] = 1; bilder.push(u);
  };
  let x; const re = /display_url\\*"\s*:\s*\\*"(https:[^"]*?)\\*"/g;
  while ((x = re.exec(html))) nimm(x[1]);
  if (!bilder.length) { const e = html.match(/<img class="EmbeddedMediaImage"[^>]*\ssrc="([^"]+)"/); if (e) nimm(e[1]); }
  // Beim Durchwischen steht das erste Bild doppelt (einmal für den Beitrag, einmal als erstes Kind): nach Dateiname schon entfernt
  return { caption: caption, bilder: bilder.slice(0, IG_MAX_BILDER), video: /is_video\\*"\s*:\s*true/.test(html), ok: !!m || bilder.length > 0 };
}

/** Wie gut passt ein gelesener Text zu einem Titel (oder einem seiner anderen Namen)? 1 = gleich, ab 0,6 = ähnlich. */
function igPass_(q, namen) {
  const a = titelNorm_(q), ta = toks_(q);
  return (namen || []).filter(Boolean).reduce(function (best, t) {
    const b = titelNorm_(t);
    if (!a || !b) return best;
    if (a === b) return 1;
    const tb = toks_(t);
    const j = ta.length && tb.length ? jacc_(ta, tb) : 0;
    const teil = (a.length >= 8 && b.indexOf(a) >= 0) || (b.length >= 8 && a.indexOf(b) >= 0) ? 0.75 : 0;
    return Math.max(best, j, teil);
  }, 0);
}

/** Mehrere Titel in EINER Anfrage bei AniList suchen (v2.11.1). Vorher war es eine Anfrage pro Text mit Pause dazwischen –
 *  bei Beiträgen mit vielen Titeln reichte das nur für die ersten. Gibt pro Text den besten Treffer zurück (oder null). */
function igSucheViele_(qs) {
  const out = qs.map(function () { return null; });
  const F = 'id siteUrl countryOfOrigin status chapters title{romaji english} synonyms coverImage{medium}';
  for (let o = 0; o < qs.length; o += 10) {
    const teil = qs.slice(o, o + 10), vars = {};
    const kopf = teil.map(function (q, i) { vars['s' + i] = q; return '$s' + i + ':String'; }).join(',');
    const rumpf = teil.map(function (q, i) { return 'a' + i + ':Page(perPage:4){media(search:$s' + i + ',type:MANGA,format_not:NOVEL){' + F + '}}'; }).join(' ');
    const d = alFetch_('query(' + kopf + '){' + rumpf + '}', vars);
    if (!d) continue;
    teil.forEach(function (q, i) {
      let best = null, bp = 0;
      ((d['a' + i] && d['a' + i].media) || []).forEach(function (m) {
        const t = m.title || {};
        const p = igPass_(q, [t.english, t.romaji].concat(m.synonyms || []));
        if (p > bp) { bp = p; best = m; }
      });
      if (best && bp >= 0.6) {
        const t = best.title || {};
        out[o + i] = { p: bp, title: decode_(t.english || t.romaji || ''), type: best.countryOfOrigin === 'KR' ? 'Manhwa' : best.countryOfOrigin === 'CN' ? 'Manhua' : 'Manga',
          year: '', latest: best.chapters || null, completed: best.status === 'FINISHED', image: (best.coverImage && best.coverImage.medium) || '', link: best.siteUrl || '' };
      }
    });
  }
  return out;
}

/** Kapitelzahl, die im Beitrag bei diesem Titel steht (z. B. „144+“) – nur als Hinweis „laut Beitrag“, sie kann veraltet sein.
 *  Sucht den Titel im gelesenen Text und nimmt die erste Kapitelangabe in den Zeilen danach (bis zum nächsten Titel höchstens 6 Zeilen). */
function igKapitelLautBeitrag_(text, q) {
  const lines = String(text || '').split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
  const qn = titelNorm_(q); if (!qn) return '';
  for (let i = 0; i < lines.length; i++) {
    for (let k = 1; k <= 3 && i + k <= lines.length; k++) {
      const n = titelNorm_(lines.slice(i, i + k).join(' '));
      if (!n || (n !== qn && n.indexOf(qn) < 0)) continue;
      const mitWort = /(\d{1,4})\s*(\+?)\s*(?:chapters?|chaps?|chs?\.?|episodes?|eps?\.?|kapitel)\b/i, wortZahl = /(?:chapters?|chaps?|ch\.?|episodes?|kapitel)\s*[:#]?\s*(\d{1,4})(\+?)/i;
      let m = lines.slice(i, i + k).join(' ').match(mitWort) || lines.slice(i, i + k).join(' ').match(wortZahl);     // steht in der Titelzeile selbst
      for (let j = i + k; !m && j < Math.min(lines.length, i + k + 4); j++) {
        const l = lines[j], rest = igClean_(l);
        if ((rest.match(/[A-Za-z]{2,}/g) || []).length >= 2 && !igIsInfo_(rest)) break;                              // hier beginnt schon der nächste Titel
        m = l.match(mitWort) || l.match(wortZahl) || (/^0\d$/.test(l) ? null : l.match(/^(\d{1,4})(\+?)$/));       // „144+“ allein in der Zeile (nicht die laufende Nummer „02“)
      }
      return m ? m[1] + (m[2] || '') : '';
    }
  }
  return '';
}

/** „STELLAR SWORDMASTER“ → „Stellar Swordmaster“ (nur wenn der Text ganz in Großbuchstaben gelesen wurde). */
function igSchoen_(t) {
  t = String(t || '');
  if (/[a-z]/.test(t)) return t;
  const klein = /^(a|an|the|of|in|on|to|for|and|or|as|at|by|from|with|is)$/;
  return t.toLowerCase().split(' ').map(function (w, i) { return i && klein.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
}

/** Listen-Bilder (v2.11.2): viele Beiträge zeigen pro Bild mehrere Einträge – Genre-Schildchen, Titel, darunter Kapitelzahl und Status.
 *  Ein Titel ist dort der Text direkt ÜBER einer Kapitelzahl oder einem Status. Gibt die Einträge zurück:
 *  { vars: mögliche Titel (kürzester zuerst), std: Titel ohne vorangestellte Schildchen, zahl: Kapitelzahl laut Bild }.
 *  oftWort: Wörter aus Zeilen, die auf mehreren Bildern stehen (Schildchen wie „ACTION FANTASY“, Kopfzeile, Account-Name). */
function igListe_(text, oftWort) {
  const lines = String(text || '').split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
  const ST = /^[\s•·*\-–]*(?:ongoing|completed?|finished|hiatus|on hiatus|dropped|cancell?ed|laufend|abgeschlossen|pausiert)\s*$/i;
  const tagWort = function (x) { return !!oftWort[x] || /^\d+$/.test(x) || IG_NOISE.test(x) || igIsInfo_(x); };
  // v2.11.4: „A RETURNER'S MAGIC SHOULD BE SPECIAL 269 CHAPTERS COMPLETE“ – Titel und Kapitelangabe in EINER Zeile
  const IN = /^(.*?[A-Za-z].*?)[\s|•·:,\-–]+(\d{1,4}\+?)\s*(?:chapters?|chaps?|chs?\.?|episodes?|eps?\.?|kapitel)\b.*$/i;
  const art = lines.map(function (l) {
    if (/^\d{1,4}\+?$/.test(l)) return /^0\d$/.test(l) ? 'x' : 'num';
    if (IN.test(l) && /[A-Za-z]{3}/.test(igClean_(l.match(IN)[1]))) return 'ti';
    if (/^(?:[A-Za-z])*([A-Za-z])\1{3,}[A-Za-z]*$/.test(l)) return 'x';                                   // „MAAAAAAAM“: Zierschrift, falsch gelesen                                  // „144+“; „02“ ist die laufende Nummer
    if (ST.test(l)) return 'st';
    if (/^[\s•·]*(?:\d{1,4}\+?\s*)?(?:chapters?|chaps?|episodes?|kapitel)\s*$/i.test(l)) return 'ch';
    if (/^[\s•·]*\d{1,4}\+?\s*(?:chapters?|chaps?|episodes?|kapitel)\b/i.test(l)) return 'ch';                    // „225 CHAPTERS SEASON'S END“
    if (/\b(?:chapters?|chaps?|episodes?|kapitel)\b/i.test(l) && !/[A-Za-z]{3}/.test(igClean_(l))) return 'ch';       // „275 CHAPTERS | HIATUS“ in einer Zeile
    if (/\d\s*[-–\/]\s*\d|\bof\s+\d+\b/i.test(l) || /@|https?:|www\.|\.com\b|[|]/i.test(l)) return 'x';     // 01/07, PICKS 01-04 OF 28, Adressen
    const w = titelNorm_(l).split(' ').filter(Boolean);
    if (!w.length || !/[A-Za-z]{2}/.test(l) || (w.length === 1 && w[0].length <= 3)) return 'x';
    const lang = w.filter(function (x) { return x.length > 2; });
    if (lang.every(tagWort) && !/\s(?:of|the|a|an|as|to|in|on|and|with|is|for|from)\s*$/i.test(l)) return w.length === 1 ? 'w1' : 'tag';   // „REINCARNATION OF“ ist kein Schildchen, sondern ein Titelanfang
    return /[A-Za-z]\s+\d{1,4}\+?\s*$/.test(l) ? 'ti' : 't';                                            // „GENIUS DARK KNIGHT 170+“: Zahl in der Titelzeile
  });
  const ohneZahl = function (l) { const m = l.match(IN); return m ? m[1] : l.replace(/\s+\d{1,4}\+?\s*$/, ''); };
  const out = [];
  for (let e = 0; e < lines.length; e++) {
    if (art[e] !== 't' && art[e] !== 'ti' && art[e] !== 'w1') continue;
    const nach = art[e + 1];
    if (!(art[e] === 'ti' || nach === 'num' || nach === 'ch' || nach === 'st')) continue;               // darunter steht keine Kapitelzahl / kein Status
    const vars = []; let std = '', nurText = true;
    for (let s0 = e; s0 >= Math.max(0, e - 3); s0--) {
      if (art[s0] !== 't' && art[s0] !== 'w1' && !(s0 === e && art[s0] === 'ti')) break;
      const teil = lines.slice(s0, e + 1).map(function (l, i) { return s0 + i === e ? ohneZahl(l) : l; });
      const v = igClean_(teil.join(' ')) || teil.join(' ');
      if (v.split(' ').length > 12) break;
      const hatText = lines.slice(s0, e + 1).some(function (l, i) { return art[s0 + i] !== 'w1'; });
      if (hatText) vars.push(v);
      // Für den Titel ohne Datenbank-Treffer: Zeilen davor zählen nur, solange sie kein Schildchen sind –
      // also nicht überwiegend aus Genre-Wörtern bestehen („ACADEMY FANTASY“) und kein einzelnes Wort direkt unter einem Schildchen sind („KINGDOM“ / „GAME“)
      if (s0 !== e) {
        const w0 = titelNorm_(lines[s0]).split(' ').filter(function (x) { return x.length > 2; });      // „DRAGONSLAYER'S“ → ohne das „s“
        const offenesEnde = /\s(?:of|the|a|an|as|to|in|on|and|with|is|for|from|by)\s*$/i.test(lines[s0]);            // „REINCARNATION OF“ geht in der nächsten Zeile weiter
        const halbTag = !offenesEnde && w0.length > 0 && w0.filter(function (x) { return !!oftWort[x]; }).length * 2 >= w0.length;   // nur Wörter, die in DIESEM Beitrag als Schildchen vorkommen
        const unterTag = w0.length === 1 && art[s0 - 1] === 'w1' && !/:\s*$/.test(lines[s0]);
        if (art[s0] !== 't' || halbTag || unterTag) nurText = false;
      }
      if (hatText && nurText) std = v;
    }
    if (!vars.length) continue;
    let zahl = '';
    const inl = art[e] === 'ti' ? (lines[e].match(IN) || []).slice(1) : null;
    if (inl && inl[1]) zahl = inl[1]; else if (inl) { const z = lines[e].match(/(\d{1,4}\+?)\s*$/); if (z) zahl = z[1]; }
    for (let j = e + 1; !zahl && j <= e + 3 && j < lines.length; j++) {
      const inCh = art[j] === 'ch' ? lines[j].match(/(\d{1,4}\+?)\s*(?:chapters?|chaps?|episodes?|kapitel)/i) : null;
      if (art[j] === 'num') zahl = lines[j]; else if (inCh) zahl = inCh[1]; else if (art[j] !== 'st' && art[j] !== 'ch') break;
    }
    out.push({ vars: vars, std: std || vars[0], zahl: zahl });
  }
  return out;
}

/** Einen Beitrag auslesen: Beschreibung + Bildtexte → Titel. Gibt { cand, note, text } zurück.
 *  1. Listen-Bilder: Titel = Text über einer Kapitelzahl / einem Status (igListe_). Andere Bilder und die Beschreibung:
 *     alle Zeilen-Varianten (igKandidaten_).  2. Jede Variante zuerst mit deiner eigenen Liste vergleichen (ohne Internet),
 *  3. den Rest gesammelt bei AniList suchen.  4. Pro Eintrag gewinnt die beste Variante; Listen-Einträge ohne Treffer
 *     werden als „nicht gefunden“ trotzdem angeboten (das Bild sagt ja, dass es ein Titel ist). */
function igLesen_(link, html, ende) {
  let seite = html ? { code: 200, html: String(html) } : igEinbettung_(link);
  if (seite.code !== 200) return { cand: null, note: 'Fehler: Instagram antwortet mit ' + seite.code };
  const a = igAuswerten_(seite.html);
  if (!a.ok) return { cand: null, note: 'Fehler: Beitrag nicht lesbar (Instagram zeigt ihn nur in der App oder nach Anmeldung)' };
  const ocr = []; let ocrFehler = '';
  for (let i = 0; i < a.bilder.length; i++) {
    if (ende && Date.now() > ende) break;
    const o = bildText_(a.bilder[i]);
    if (o.text) ocr.push(o.text); else if (o.error && !ocrFehler) ocrFehler = o.error;
  }
  return igTitel_(ocr, a.caption, ende, a.bilder.length, a.video, ocrFehler);
}

/** Der Teil ohne Instagram und Texterkennung: aus den gelesenen Texten die Titel machen. */
/** Wörter eines Titels für den ungefähren Vergleich mit der eigenen Liste: Tausenderpunkte und „'s“ fallen weg. */
function igWorte_(s) {
  return titelNorm_(String(s || '').replace(/(\d)[.,](?=\d{3}(?!\d))/g, '$1').replace(/['’`´]s(?![a-z])/gi, '')).split(' ').filter(Boolean);
}
/** Zwei Wörter, die sich nur um einen Buchstaben unterscheiden (ab 5 Buchstaben, keine Zahlen). */
function igFastGleich_(a, b) {
  if (a === b) return true;
  if (/\d/.test(a + b) || Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  if (a.length < b.length) { const t = a; a = b; b = t; }
  let i = 0; while (i < b.length && a[i] === b[i]) i++;
  return a.length === b.length ? a.slice(i + 1) === b.slice(i + 1) : a.slice(i + 1) === b.slice(i);
}
function igTitel_(ocr, caption, ende, bilder, video, ocrFehler) {
  // Zeilen, die auf mehreren Bildern stehen, sind kein Titel; ihre Wörter kennzeichnen Schildchen
  const zahl = {};
  ocr.forEach(function (t) { const s = {}; t.split(/\n+/).forEach(function (l) { const k = titelNorm_(l); if (k && !s[k]) { s[k] = 1; zahl[k] = (zahl[k] || 0) + 1; } }); });
  const oft = Object.keys(zahl).filter(function (k) { return ocr.length >= 3 && zahl[k] >= 2 && !/^\d+$/.test(k); }).sort(function (x, y) { return y.length - x.length; });
  const oftWort = {}; oft.forEach(function (k) { k.split(' ').forEach(function (w) { oftWort[w] = 1; }); });
  const nurKopf = function (q) { return titelNorm_(q).split(' ').filter(Boolean).every(function (w) { return oftWort[w] || /^\d+$/.test(w); }); };
  // 1. Quellen
  const quellen = ocr.map(function (t, i) {
    const liste = igListe_(t, oftWort);
    return liste.length >= 2 ? { src: i + 1, text: t, liste: liste } : { src: i + 1, text: t, vs: igKandidaten_([], [t], true).filter(function (q) { return !nurKopf(q); }) };
  });
  const hatListe = quellen.some(function (q) { return q.liste; });
  if (caption) quellen.push({ src: 0, text: caption, vs: igKandidaten_([caption], [], true) });
  // 2. eigene Liste
  const list = alle_(), eigen = {};
  list.forEach(function (it) { [it.title, it.dbTitle].concat(it.alt || []).filter(Boolean).forEach(function (n) { const k = titelNorm_(n); if (k && !eigen[k]) eigen[k] = it; }); });
  // v2.11.5: auch fast gleiche Schreibweisen zählen als „schon in deiner Liste“ – „66,666“ = „66666“, „Academy's“ = „Academy“,
  // „Honours“ = „Honors“, ein falsch gelesener Buchstabe („Swordmasterx“). Gleich viele Wörter, jedes Wort gleich oder um einen Buchstaben verschieden.
  const eigenUngefaehr = [], schon = {};
  list.forEach(function (it) { [it.title, it.dbTitle].concat(it.alt || []).filter(Boolean).forEach(function (n) { const w = igWorte_(n), k = w.join(' '); if (w.length >= 2 && !schon[k]) { schon[k] = 1; eigenUngefaehr.push({ w: w, it: it }); } }); });
  const ungefaehr = function (q) {
    const w = igWorte_(q); if (w.length < 2) return null;
    for (let i = 0; i < eigenUngefaehr.length; i++) {
      const o = eigenUngefaehr[i].w; if (o.length !== w.length) continue;
      let fehler = 0, ok = true;
      for (let j = 0; j < w.length && ok; j++) { if (w[j] === o[j]) continue; if (igFastGleich_(w[j], o[j]) && ++fehler <= 2) continue; ok = false; }
      if (ok) return eigenUngefaehr[i].it;
    }
    return null;
  };
  const fund = {}, offen = [];
  const merke = function (q) {
    const k = titelNorm_(q); if (!k || k in fund) return;
    const m = eigen[k] || ungefaehr(q);
    if (m) fund[k] = { p: 1, mine: m }; else { fund[k] = null; if (offen.length < 200) offen.push(q); }
  };
  quellen.forEach(function (q) { if (q.liste) q.liste.forEach(function (e) { e.vars.forEach(merke); }); else q.vs.forEach(merke); });
  // 3. AniList (gesammelt)
  let gesucht = 0;
  if (!(ende && Date.now() > ende)) {
    const r = igSucheViele_(offen); gesucht = offen.length;
    offen.forEach(function (q, i) { if (r[i]) fund[titelNorm_(q)] = r[i]; });
  }
  // 4. Auswahl
  const cand = [], doppelt = {};
  const worte = function (q) { return titelNorm_(q).split(' ').filter(Boolean); };
  const nimm = function (q, f, src, post) {
    const title = f ? (f.mine ? f.mine.title : f.title) : igSchoen_(q), n = titelNorm_(title);
    if (!n || doppelt[n]) return; doppelt[n] = 1;
    if (!f) cand.push({ q: q, title: title, type: '', year: '', latest: null, completed: false, image: '', link: '', sure: false, nohit: true, inList: null, src: src, post: post, state: '' });
    else if (f.mine) cand.push({ q: q, title: title, type: '', year: '', latest: f.mine.latest, completed: false, image: f.mine.image || '', link: '', sure: true, inList: title, src: src, post: post, state: '' });
    else cand.push({ q: q, title: title, type: f.type, year: f.year, latest: f.latest, completed: f.completed, image: f.image, link: f.link, sure: f.p >= 0.9, inList: eigen[n] ? eigen[n].title : null, src: src, post: post, state: '' });
  };
  const ueberlappt = function (q, andere) {          // der eine steckt im anderen, oder mehr als die Hälfte der Wörter ist gleich
    const n = ' ' + titelNorm_(q) + ' ', w = toks_(q);
    return andere.some(function (o) {
      const on = ' ' + titelNorm_(o) + ' ';
      if (n.indexOf(on) >= 0 || on.indexOf(n) >= 0) return true;
      const ow = toks_(o), gem = w.filter(function (x) { return ow.indexOf(x) >= 0; }).length;
      return gem * 2 > Math.min(w.length, ow.length);
    });
  };
  quellen.forEach(function (qu) {
    if (qu.liste) {
      qu.liste.forEach(function (e) {
        let best = null;
        e.vars.forEach(function (v) {
          const f = fund[titelNorm_(v)], w = worte(v).length;
          if (!f || (w < 2 && e.vars.length > 1) || (f.p < 0.9 && w < 2)) return;
          if (w * 2 < worte(e.std).length) return;                                                    // Treffer nur für ein Stück des Titels („BLOOD HOUND“ aus „REVENGE OF THE BASKERVILLE BLOOD HOUND“)                      // ein einzelnes Wort zählt nur, wenn der Eintrag nichts anderes hat
          const rang = (f.p >= 0.9 ? 100 : 0) + f.p * 10 + w / 100;
          if (!best || rang > best.rang) best = { v: v, f: f, rang: rang };
        });
        if (best) nimm(best.v, best.f, qu.src, e.zahl);
        else if (worte(e.std).length >= 2 && !nurKopf(e.std)) nimm(e.std, null, qu.src, e.zahl);
      });
      return;
    }
    const gewaehlt = [];
    qu.vs.map(function (q) { return { q: q, f: fund[titelNorm_(q)] || null, w: worte(q).length }; })
      .filter(function (x) { return x.f && (hatListe && qu.src ? x.f.p >= 0.9 && x.w >= 2 : (x.f.p >= 0.9 || x.w >= 2)); })   // neben Listen-Bildern (z. B. die Werbeseite am Ende) nur sichere Treffer
      .sort(function (x, y) { return (y.f.p >= 0.9 ? 1 : 0) - (x.f.p >= 0.9 ? 1 : 0) || y.w - x.w; })
      .forEach(function (x) {
        if (ueberlappt(x.q, gewaehlt)) return;
        gewaehlt.push(x.q);
        nimm(x.q, x.f, qu.src, igKapitelLautBeitrag_(qu.text, x.q));
      });
    if (!qu.src || hatListe) return;
    // Bild ohne Listen-Aufbau: was nach Titel aussieht, aber nicht gefunden wurde – höchstens 4, längste zuerst
    let rest = 0;
    qu.vs.filter(function (q) { return worte(q).length >= 2 && !fund[titelNorm_(q)]; })
      .sort(function (x, y) { return worte(y).length - worte(x).length; })
      .forEach(function (q) {
        if (rest >= 4 || ueberlappt(q, gewaehlt)) return;
        gewaehlt.push(q); rest++;
        nimm(q, null, qu.src, igKapitelLautBeitrag_(qu.text, q));
      });
  });
  const note = Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm') + ' · ' + bilder + ' Bilder, ' + ocr.length + ' mit Text · '
    + cand.filter(function (c) { return !c.nohit; }).length + ' Titel gefunden, ' + cand.filter(function (c) { return c.nohit; }).length + ' nicht in AniList, ' + gesucht + ' gesucht'
    + (video ? ' · Video' : '') + (ocrFehler && !ocr.length ? ' · Texterkennung: ' + ocrFehler : '');
  return { cand: cand.slice(0, 80), note: note, text: ocr.map(function (t, i) { return '[Bild ' + (i + 1) + ']\n' + t; }).join('\n\n').slice(0, 20000) };
}

function igSchreiben_(sh, row, res) {
  // Spalte G: der gelesene Text der Bilder – zum Nachsehen, wenn Titel fehlen
  sh.getRange(row, 5, 1, 3).setValues([[res.cand ? txt_(JSON.stringify(res.cand)) : '', txt_(res.note), txt_(res.text || '')]]);
}

/** Läuft im Hintergrund (eine Minute nach dem Teilen): liest alle offenen, noch nicht ausgelesenen Beiträge. */
function inboxAuslesen() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'inboxAuslesen') ScriptApp.deleteTrigger(t); });
  const ende = Date.now() + 4 * 60 * 1000;
  const sh = inboxBlatt_();
  const offen = inboxZeilen_(sh).filter(function (r) { return r.url && (!r.status || r.status === 'offen') && !r.read; });
  for (let i = 0; i < offen.length; i++) {
    if (Date.now() > ende - 60 * 1000) { planeLauf_('inboxAuslesen'); return; }
    let res;
    try { res = igLesen_(offen[i].url, null, ende); } catch (e) { res = { cand: null, note: 'Fehler: ' + String(e && e.message || e).slice(0, 160) }; }
    const id = igId_(offen[i].url);
    const jetzt = inboxZeilen_(sh).find(function (r) { return igId_(r.url) === id; });     // Zeile neu suchen: die Tabelle kann sich geändert haben
    if (jetzt) igSchreiben_(sh, jetzt.row, res);
  }
}

function igEintrag_(url) {
  const id = igId_(url); if (!id) return null;
  const sh = inboxBlatt_();
  const r = inboxZeilen_(sh).find(function (x) { return igId_(x.url) === id; });
  return r ? { sh: sh, r: r } : null;
}
function igAntwort_(r) { return { url: r.url, date: r.date, status: r.status || 'offen', title: r.title, cand: r.cand, read: r.read }; }

/** App: einen Beitrag jetzt (noch einmal) auslesen. */
function apiInboxLesen(key, url) {
  check_(key);
  const e = igEintrag_(url); if (!e) return null;
  let res;
  try { res = igLesen_(e.r.url, null, Date.now() + 4 * 60 * 1000); } catch (err) { res = { cand: null, note: 'Fehler: ' + String(err && err.message || err).slice(0, 160) }; }
  const f = igEintrag_(url); if (!f) return null;
  igSchreiben_(f.sh, f.r.row, res);
  return igAntwort_(igEintrag_(url).r);
}

/** Safari-Overlay (ab 1.13): die Titel eines Beitrags – dieselbe Erkennung wie in der App.
 *  Steht der Beitrag schon ausgelesen in der Inbox, kommt das Ergebnis sofort; sonst wird er jetzt gelesen. */
function apiIgBeitrag(key, url) {
  check_(key);
  const link = igLink_(url); if (!link) return null;
  const e = igEintrag_(link);
  if (e && e.r.cand) return { cand: e.r.cand, read: e.r.read };
  let res;
  try { res = igLesen_(link, null, Date.now() + 3 * 60 * 1000); } catch (err) { return { cand: null, read: 'Fehler: ' + String(err && err.message || err).slice(0, 160) }; }
  if (e && res.cand) { const f = igEintrag_(link); if (f) igSchreiben_(f.sh, f.r.row, res); }
  return { cand: res.cand, read: res.note };
}

/** Kurzbefehl (falls Instagram Googles Server abweist): das iPhone lädt die Einbettungs-Seite selbst und schickt sie mit. */
function apiInboxEinbettung(key, url, html) {
  check_(key);
  const msg = apiInboxNeu(key, url);
  const e = igEintrag_(url);
  if (e && html && !e.r.read) {
    let res;
    try { res = igLesen_(e.r.url, html, Date.now() + 4 * 60 * 1000); } catch (err) { res = { cand: null, note: 'Fehler: ' + String(err && err.message || err).slice(0, 160) }; }
    const f = igEintrag_(url); if (f) igSchreiben_(f.sh, f.r.row, res);
  }
  return msg;
}

/** App: einen Vorschlag hinzufügen ('add') oder ablehnen ('skip'). Sind alle entschieden, gilt der Beitrag als erledigt. */
function apiInboxWahl(key, url, i, was) {
  check_(key);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let neu = null;
  try {
    const e = igEintrag_(url); if (!e || !e.r.cand || !e.r.cand[i]) return null;
    const c = e.r.cand[i];
    if (was === 'add') {
      const n = titelNorm_(c.title);
      let it = alle_().find(function (x) { return titelNorm_(x.title) === n; });
      if (!it) {
        const o = { title: String(c.title).slice(0, 120), genres: [], note: 'Idee von Instagram: ' + e.r.url };
        if (c.latest) { o.latest = Math.floor(Number(c.latest)); o.latestSince = heute_(); }
        it = anlegen_(o);
      }
      neu = it || null;
      c.state = 'added'; c.inList = it ? it.title : c.title;
    } else if (was === 'undo') c.state = '';
    else c.state = 'skipped';
    const cand = e.r.cand, fertig = cand.every(function (x) { return x.state || x.inList; });
    const titel = cand.filter(function (x) { return x.state === 'added'; }).map(function (x) { return x.title; }).join(', ');
    e.sh.getRange(e.r.row, 3, 1, 3).setValues([[fertig ? (titel ? 'erledigt' : 'verworfen') : 'offen', txt_(titel), txt_(JSON.stringify(cand))]]);
  } finally { lock.releaseLock(); }
  return { entry: igAntwort_(igEintrag_(url).r), item: neu };
}

/* ---- Titel aus Texten herausfiltern (gleiche Regeln wie im Safari-Overlay) ---- */

const IG_NOISE = /^(manhwa|manga|manhua|webtoon|webtoons|murim|action|fantasy|romance|comedy|drama|isekai|anime|otaku|follow|like|comment|share|save|link in bio|read|reading|recommendation|recommendations|part \d+|new|top \d+)s?$/i;
// Words that describe a series (status, genre, chapter count …) – not its title
const IG_INFO = 'ongoing|completed?|finished|hiatus|on hiatus|dropped|cancell?ed|season \\d+|the end|end|new|hot|top|best|must read|' +
  'action|adventure|fantasy|dark fantasy|romance|comedy|drama|horror|thriller|mystery|psychological|tragedy|isekai|murim|martial arts?|wuxia|' +
  'regression|regressor|reincarnation|reincarnated|transmigration|revenge|system|leveling|level up|dungeons?|hunters?|harem|school life|school|slice of life|' +
  'cultivation|overpowered|op mc|op|villainess|historical|sports|sci-?fi|shounen|seinen|shoujo|josei|supernatural|magic|demons?|' +
  'manhwa|manhua|manga|webtoons?|comics?|genres?|status|chapters?|episodes?|rating|type|author|artist|art|story|published|release|summary|synopsis|' +
  'recommendation|recommendations|part \\d+|vol\\.? ?\\d+|volume \\d+';
const IG_INFO_ONLY = new RegExp('^(?:(?:' + IG_INFO + ')(?:[\\s,/&|•·+\\-:]+|$))+$', 'i');
function igIsInfo_(t) {
  if (IG_INFO_ONLY.test(t)) return true;
  if (/^\d+\+?\s*(?:ch(?:apter)?s?|chaps?|eps?|episodes?|kapitel|kap|volumes?|vols?)\b/i.test(t)) return true;       // 262 Chapters
  if (/\b(?:ch(?:apter)?s?|chaps?|eps?|episodes?|kapitel|kap)\.?\s*#?\s*\d+/i.test(t)) return true;                     // Chapter 262, Ch. 120+
  if (/^(?:genres?|status|chapters?|episodes?|rating|type|author|artist|art|story|released?|year|score|tags?)\s*[:\-–]/i.test(t)) return true;
  if (/\d+(?:[.,]\d+)?\s*\/\s*(?:10|5)\b|★|⭐|☆/.test(t)) return true;                                               // 9.5/10, stars
  const letters = (t.match(/\p{L}/gu) || []).length;
  return letters < 3 || letters < t.replace(/\s/g, '').length * 0.6;                                                   // mostly numbers or symbols
}
// Remove chapter counts, status words and phrases like "Follow for more" from a line
const IG_STATUS = 'ongoing|completed?|finished|hiatus|on hiatus|dropped|cancell?ed|end|the end|new|hot|laufend|abgeschlossen|pausiert';
const IG_CH = 'ch(?:apter)?s?|chaps?|eps?|episodes?|kapitel|kap';
function igClean_(t) {
  // The picture reader often reads the separator "|" as "I", "l" or "1": "292 CHAPTERS I COMPLETED"
  t = String(t || '').replace(new RegExp('\\s[Il1|]\\s+(?=(?:' + IG_STATUS + ')\\b)', 'gi'), ' | ')
    .replace(new RegExp('(\\b(?:' + IG_CH + '))\\s+[Il1]\\s', 'gi'), '$1 | ');
  if (/\b(may be an image|could be an image|kann ein bild|könnte ein bild|image of|photo by|foto von|photo shared by|beitrag von|reel von|video von)\b/i.test(t) && !/[„"“]/.test(t)) return '';
  t = t.replace(/\b(?:follow|folge|folgt)\s+(?:me\s+|us\s+|mir\s+|uns\s+)?(?:for|für)\s+(?:more|mehr)\b[^\n]*/gi, ' ')
    .replace(/\b(?:follow|folge|folgt)\s+@?\S+/gi, ' ')
    .replace(/\b(?:beitrag|beiträge|post|posts|reel|reels)\b/gi, ' ')
    .replace(/\b(?:end\s+of\s+(?:the\s+)?season(?:\s*\d+)?|season\s*\d*\s*(?:end|finale|ended|break)|staffel\s*\d*\s*(?:ende|finale)|ende\s+der\s+staffel|season\s*\d+)\b/gi, ' ')
    .replace(new RegExp('\\b\\d+\\+?\\s*(?:' + IG_CH + ')\\b\\.?', 'gi'), ' ')                // 308 Chapters
    .replace(new RegExp('\\b(?:' + IG_CH + ')\\.?\\s*[:#]?\\s*\\d+(?:\\.\\d+)?\\+?', 'gi'), ' ') // Chapter 308, Ch. 120+
    .replace(/[(\[]\s*[)\]]/g, ' ');
  // „end“, „the end“, „new“, „hot“ nur nach einem Trennzeichen abschneiden – sonst wird aus „The Beginning After the End“ ein halber Titel
  const tail = new RegExp('(?:[\\s\\-–—|•·:,/(\\[]+(?:' + IG_STATUS.replace('|end|the end|new|hot', '') + ')|\\s*[\\-–—|•·:,/(\\[]+\\s*(?:end|the end|new|hot))[\\s)\\].!]*$', 'i');
  const head = new RegExp('^[\\s(\\[]*(?:' + IG_STATUS + ')[\\s)\\]]*[\\-–—|•·:,/]+', 'i');
  for (let k = 0; k < 4; k++) t = t.replace(tail, '').replace(head, '').replace(/\s+[|Il1]\s*$/, '');
  return t.replace(/[\s\-–—|•·:,/]+$/g, '').replace(/^[\s\-–—|•·:,/]+/g, '').replace(/\s+/g, ' ').trim();
}
const IG_TAGNOISE = /manhwa|manga|manhua|webtoon|anime|otaku|recommend|reels?|fyp|foryou|explore|viral|trend|edit|amv|follow/i;
const IG_KEIN_TEIL = /^(ongoing|completed?|finished|hiatus|dropped|cancell?ed|chapters?|episodes?|new|hot|top|best|status|rating|genres?|type|manhwa|manga|manhua|webtoons?|comics?|recommendations?|author|artist|story|art|summary|synopsis|release|published)$/i;
function igKandidaten_(list, ocr, alles) {
  const c = new Map();
  const add = (t, s) => {
    t = igClean_(t);
    if (!t) return;
    t = String(t || '').replace(/[\u{1F000}-\u{1FFFF}☀-➿️]/gu, '')
      .replace(/^[\s\d.\-–—:)•*#"“„'«»]+|[\s"“”'»«.,!?:;(\-–—]+$/g, '').replace(/\s+/g, ' ').trim()
      .replace(/^(?:name|title|titel|manhwa|manga|manhua|webtoon)\s*[:\-–]\s*/i, '');
    if (t.length < 3 || t.length > 90 || IG_NOISE.test(t) || /^\d+$/.test(t) || igIsInfo_(t)) return;
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
      if (IG_TAGNOISE.test(h)) return;
      add(h.slice(1).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'), 0.5);
    });
  });
  // Text read from the pictures: single lines, and titles spread over 2-3 lines
  (ocr || []).forEach((raw) => {
    // Numbered lists ("1. Title 2. Title") often come back as one long line: one line per entry
    const lines = String(raw || '').replace(/(?:^|\s)\d{1,2}[.)]\s+(?=\p{L})/gu, '\n').replace(/\s[|•·]\s/g, '\n').split(/\n+/).map((l) => l.trim()).filter(Boolean)
      .map((l) => {
        if (!/[A-Za-z]{2}/.test(l) || /@|https?:|www\.|\.com\b/i.test(l) || /^(read|swipe|save|link in bio|read now|swipe left)\b/i.test(l)) return null;
        const c2 = igClean_(l);
        if (!c2) return null;
        if (igIsInfo_(c2.replace(/[^\p{L}\d\s\/.:+★⭐-]/gu, '').trim())) {
          // Skript (v2.11.1): ein einzelnes Genre-Wort kann der Rest eines Titels sein („STANDARD OF“ + „REINCARNATION“).
          // Allein ist es kein Vorschlag, mit der Nachbarzeile zusammen aber schon.
          return alles && /^[A-Za-z][A-Za-z'-]{3,}$/.test(c2) && !IG_KEIN_TEIL.test(c2) ? { t: c2, weak: true } : null;
        }
        // A line that had a chapter count or status removed is a complete title on its own: never join it with neighbours
        const whole = c2.replace(/\s+/g, ' ').toLowerCase() !== l.replace(/\s+/g, ' ').trim().toLowerCase();
        return whole ? { t: c2, whole: true } : c2;
      });
    const joinable = (x) => typeof x === 'string' || !!(x && x.weak);
    const txt = (x) => typeof x === 'string' ? x : x.t;
    const fest = (g) => g.some((x) => typeof x === 'string');           // mindestens eine echte Titelzeile
    lines.forEach((l, i) => {
      if (!l) return;
      if (typeof l === 'object' && !l.weak) { add(l.t, 2.5); return; }
      if (typeof l === 'string') {
        const words = l.split(' ').length;
        if (words <= 9 && !(words === 1 && l.length < 5)) add(l, 1.5);
      }
      const two = lines.slice(i, i + 2), three = lines.slice(i, i + 3), max3 = alles ? 4 : 3;
      if (two.length === 2 && fest(two) && two.every((x) => joinable(x) && txt(x).split(' ').length <= 4)) add(two.map(txt).join(' '), 2);
      if (three.length === 3 && fest(three) && three.every((x) => joinable(x) && txt(x).split(' ').length <= max3)
        && three.map(txt).join(' ').split(' ').length <= 10) add(three.map(txt).join(' '), 2.5);
    });
  });
  // Drop pieces of a title that is already suggested in full ("MOUNT HUA" next to "Return of the Mount Hua Sect")
  const all = [...c.values()].sort((a, b) => b.s - a.s || b.t.length - a.t.length);
  // Skript: alle Varianten zurückgeben – welche davon ein echter Titel ist, entscheidet der Abgleich mit MangaUpdates/AniList
  if (alles) return all.slice(0, 60).map((o) => o.t);
  const kept = [];
  all.forEach((o) => {
    const k = o.t.toLowerCase();
    if (kept.some((x) => x.t.length > o.t.length && x.t.toLowerCase().indexOf(k) >= 0)) return;
    kept.push(o);
  });
  return kept.slice(0, 14).map((o) => o.t);
}

