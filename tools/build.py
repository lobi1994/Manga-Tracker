#!/usr/bin/env python3
"""Build the GitHub version of Manga Tracker.

Usage: python3 tools/build.py <folder with the Apps Script files>

* Copies the Apps Script files into google/ with the personal key removed.
* Writes google/MangaTracker-Vorlage.gs: all server files in one file for friends.
* Writes index.html: the app page for GitHub Pages. Instead of google.script.run it
  sends every call as POST to the user's own web app (link + key stay on the device).
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'google')
GS = ['Code.gs', 'Api.gs', 'KapitelAktualisieren.gs', 'LinkEintragen.gs', 'SeitenStatus.gs', 'Zusatz.gs', 'Lesestand.gs', 'Inbox.gs', 'BildText.gs', 'Schnell.gs']
KEY_RE = re.compile(r"const KEY = '([^']*)';[^\n]*")

secret = ''
files = {}
for name in GS:
    text = (SRC / name).read_text(encoding='utf-8')
    m = KEY_RE.search(text)
    if m:
        secret = secret or m.group(1)
        text = KEY_RE.sub("const KEY = '';  // eigener Schlüssel: Menü „Manga Tracker → Einrichten“ legt ihn an", text)
        text = text.replace('// Geheimer Schlüssel – steht auch in deinem Kurzbefehl. Nicht weitergeben.\n',
                            '// Alter fester Schlüssel (nur für ältere Installationen). Neue Installationen nutzen die Skripteigenschaft „appKey“.\n')
    files[name] = text

out_google = ROOT / 'google'
out_google.mkdir(exist_ok=True)
for name, text in files.items():
    (out_google / name).write_text(text, encoding='utf-8')
html_src = (SRC / 'Index.html').read_text(encoding='utf-8')
(out_google / 'Index.html').write_text(html_src, encoding='utf-8')

bundle = ['/**\n * Manga Tracker – alles in einer Datei (Vorlage)\n'
          ' * In einer neuen Google-Tabelle: Erweiterungen → Apps Script → den Inhalt von Code.gs\n'
          ' * durch diese Datei ersetzen, speichern, Tabelle neu laden → Menü „Manga Tracker → Einrichten“.\n'
          ' * Anleitung: https://github.com/lobi1994/Manga-Tracker/blob/main/ANLEITUNG.md\n */\n']
for name in GS:
    bundle.append('\n/* ==================================================================== */\n/* ' + name + ' */\n/* ==================================================================== */\n\n')
    bundle.append(files[name])
(out_google / 'MangaTracker-Vorlage.gs').write_text(''.join(bundle), encoding='utf-8')

# ---------------------------------------------------------------- index.html
h = html_src
def rep(a, b, count=1):
    global h
    assert h.count(a) == count, (a, h.count(a))
    h = h.replace(a, b)

rep('<base target="_top">\n', '')
rep('<meta name="apple-mobile-web-app-title" content="Manga Tracker">',
    '<meta name="apple-mobile-web-app-title" content="Manga Tracker">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    '<title>Manga Tracker</title>\n'
    '<link rel="apple-touch-icon" href="icons/icon-180.png">\n'
    '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">\n'
    '<link rel="icon" type="image/png" sizes="32x32" href="icons/icon-32.png">')
FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">'
# Fonts must not hold up the first picture; connect to Google early
rep(FONT, '<link rel="preconnect" href="https://script.google.com">\n'
    '<link rel="preconnect" href="https://script.googleusercontent.com">\n'
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    + FONT.replace('">', '" media="print" onload="this.media=\'all\'">'))
rep('<a href="<?= sheetUrl ?>" target="_blank"', '<a id="mtSheetLink" href="#" target="_blank"')
rep('const KEY=<?!= JSON.stringify(key) ?>;', 'const KEY=window.MT_CFG?MT_CFG.k:"";')
rep('const run=(fn,...a)=>new Promise((res,rej)=>google.script.run.withSuccessHandler(res).withFailureHandler(rej)[fn](KEY,...a));',
    'const run=(fn,...a)=>window.mtCall(fn,a);')
# Show the page only when all add-ons (new layout, style, header) have run - no flash of the old design
# Old versions: the page asks GitHub for the current version number (version.json, tiny, not cached).
# The page is shown as soon as it is built - it does not wait for that answer (v2.10.4: on the iPad the wait
# took seconds, because timers hardly run while iOS still shows the start picture of a home-screen app).
# If a newer version is out, the new page is put into the device cache at once and loaded if the answer
# comes early (before you touch anything, within 4 s); otherwise it is simply there at the next start.
VERSION = re.search(r"APP_VERSION = '([^']+)'", html_src).group(1)
(ROOT / 'version.json').write_text('{"v":"%s"}\n' % VERSION, encoding='utf-8')
rep('<title>Manga Tracker</title>\n', '<title>Manga Tracker</title>\n'
    '<style>html:not(.mt-ready) body{visibility:hidden}</style>\n'
    '<script>window.mtMarks=[];window.mtMark=function(n){window.mtMarks.push([n,performance.now()])};(function(){var V="' + VERSION + '",d=document.documentElement,hold=false,want=false,touched=false;\n'
    'var D=window.mtDiag={vis0:document.visibilityState,visAt:null,chkAt:null,gap:0,gapAt:0},hb=performance.now();\n'
    'var iv=setInterval(function(){var n=performance.now();if(n>20000){clearInterval(iv);return}if(n-hb>D.gap){D.gap=n-hb;D.gapAt=hb}hb=n},100);\n'
    'document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"&&D.visAt==null)D.visAt=performance.now()});\n'
    '["pointerdown","keydown","touchstart"].forEach(function(e){addEventListener(e,function(){touched=true},{capture:true,passive:true})});\n'
    'function reveal(){d.classList.add("mt-ready");if(!window.mtShownAt)window.mtShownAt=performance.now()}\n'
    '/* called at the end of the page, when everything is built */\n'
    'window.mtShow=function(){want=true;if(!hold)reveal()};\n'
    'fetch("version.json?t="+Date.now(),{cache:"no-store"}).then(function(r){return r.ok?r.json():null}).then(function(j){\n'
    '  D.chkAt=performance.now();\n'
    '  if(!j||!j.v||j.v===V||!window.caches)return;\n'
    '  try{if(sessionStorage.getItem("mt-upd")===j.v)return;sessionStorage.setItem("mt-upd",j.v)}catch(e){return}\n'
    '  var early=!window.mtShownAt;hold=early;\n'
    '  return fetch("index.html?v="+encodeURIComponent(j.v),{cache:"reload"}).then(function(r){\n'
    '    if(!r.ok)throw 0;\n'
    '    return caches.keys().then(function(ks){ks=ks.filter(function(k){return k.indexOf("mt-shell")===0});if(!ks.length)ks=["mt-shell-v2"];\n'
    '      return Promise.all(ks.map(function(k){return caches.open(k).then(function(c){return c.put("index.html",r.clone())})}))});\n'
    '  }).then(function(){if(early||(!touched&&performance.now()-window.mtShownAt<4000))location.reload()});\n'
    '}).catch(function(){hold=false;if(want)reveal()});\n'
    'setTimeout(function(){hold=false;reveal()},6000);})()</script>\n')
rep('</body>', '<script>window.mtShow()</script>\n</body>')
sw = (ROOT / 'sw.js').read_text(encoding='utf-8')
sw = re.sub(r"var VERSION = '[^']*';", "var VERSION = '%s';" % VERSION, sw)
assert VERSION in sw
(ROOT / 'sw.js').write_text(sw, encoding='utf-8')
assert '<?' not in h, 'template tag left'
# Number every script block of the page body, so the app can show which block is slow at the start
_head, _body = h.split('<body>', 1)
_parts = _body.split('<script>\n')
h = _head + '<body>' + _parts[0] + ''.join('<script>\nwindow.mtMark&&mtMark(%d);\n' % (i + 1) + part for i, part in enumerate(_parts[1:]))

setup = (ROOT / 'tools' / 'setup.html').read_text(encoding='utf-8')
rep('<body>\n', '<body>\n' + setup, 1)
h = '<!-- Generated by tools/build.py from google/Index.html - edit the source, not this file -->\n' + h
(ROOT / 'index.html').write_text(h, encoding='utf-8')

for p in list(out_google.glob('*')) + [ROOT / 'index.html']:
    if secret:
        assert secret not in p.read_text(encoding='utf-8'), 'key leaked into ' + str(p)
print('ok', len(h), 'bytes')
