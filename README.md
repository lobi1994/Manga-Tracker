# Manga Tracker

Eine kleine App, um Manga, Manhwa und Manhua zu verfolgen: Lesestand, Bewertungen, neue Kapitel, Erscheinungstage, Tier List und Empfehlungen.

- **App:** https://lobi1994.github.io/manga-tracker/
- **Eigenen Tracker einrichten:** [ANLEITUNG.md](ANLEITUNG.md)

## So funktioniert es

- Die Daten liegen in einer **eigenen Google-Tabelle** jedes Nutzers. Ein Apps-Script in dieser Tabelle stellt eine kleine Web-App bereit.
- Die Oberfläche (`index.html`) liegt hier auf GitHub Pages und ist für alle gleich. Beim ersten Öffnen gibt man seinen persönlichen Einrichtungs-Link ein; App-Link und Schlüssel werden nur auf dem eigenen Gerät gespeichert.
- iOS-Kurzbefehle tragen gelesene Kapitel direkt aus Safari ein.

## Dateien

| Pfad | Inhalt |
|---|---|
| `index.html` | App-Seite für GitHub Pages (wird gebaut, nicht direkt bearbeiten) |
| `google/MangaTracker-Vorlage.gs` | Das komplette Skript in einer Datei – zum Einfügen in eine neue Tabelle |
| `google/*.gs`, `google/Index.html` | Die einzelnen Quelldateien |
| `kurzbefehle/kapitel-aktualisieren.js` | JavaScript für den Kurzbefehl „Kapitel aktualisieren“ |
| `icons/` | App-Symbole |
| `tools/build.py`, `tools/setup.html` | Baut `index.html` und die Vorlage aus den Quelldateien |

Bauen: `python3 tools/build.py <Ordner mit den Apps-Script-Dateien>`
