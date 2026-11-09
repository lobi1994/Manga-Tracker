# Manga Tracker einrichten – Anleitung

**Deutsch** | [English](SETUP.md)

Mit dieser Anleitung bekommst du deinen eigenen Manga Tracker. Deine Liste liegt in **deiner eigenen Google-Tabelle** in deinem Google Drive – niemand sonst sieht sie. Die App-Oberfläche kommt von dieser GitHub-Seite und ist für alle gleich; sie verbindet sich mit deiner Tabelle über einen persönlichen Link mit Schlüssel.

Du brauchst: ein Google-Konto, etwa 15 Minuten und am besten einen Computer für die Schritte 1 bis 4 (auf dem iPad geht es auch, im Browser in der Desktop-Ansicht).

---

## 1. Google-Tabelle anlegen

1. Öffne [sheets.new](https://sheets.new) – das legt eine neue, leere Google-Tabelle an.
2. Gib ihr oben links den Namen **Manga Tracker**.

## 2. Das Skript einfügen

1. In der Tabelle: **Erweiterungen → Apps Script**. Es öffnet sich ein neuer Tab mit einer Datei `Code.gs`.
2. Öffne die Datei [google/MangaTracker-Vorlage.gs](google/MangaTracker-Vorlage.gs) und tippe dort oben rechts auf **Copy raw file** (das Symbol mit den zwei Rechtecken).
3. Zurück in Apps Script: den gesamten Inhalt von `Code.gs` markieren, löschen und den kopierten Text einfügen.
4. Auf das **Diskettensymbol** (Speichern) klicken. Oben links kannst du dem Projekt den Namen „Manga Tracker“ geben.

## 3. Einrichten

1. Zurück zum Tab mit der Tabelle und die Seite **neu laden**. Nach ein paar Sekunden erscheint oben ein neues Menü **Manga Tracker**.
2. **Manga Tracker → Einrichten** wählen.
3. Google fragt nach der Erlaubnis. Weil das Skript von dir selbst stammt und nicht von Google geprüft wurde, kommt eine Warnung:
   **Konto auswählen → Erweitert → „Zu Manga Tracker wechseln (unsicher)“ → Zulassen.**
   Das Skript bekommt damit Zugriff auf deine Tabelle, einen Ordner für Cover-Bilder und Sicherungen in deinem Drive, Zeitpläne für die Kapitelprüfung und das Senden von Benachrichtigungen an dich selbst.
4. Falls die Meldung „Fertig eingerichtet“ nicht direkt kommt: **Einrichten** einfach noch einmal wählen.

Dabei wird auch dein **eigener, zufälliger Schlüssel** angelegt.

## 4. Als Web-App bereitstellen (einmalig)

1. Im Apps-Script-Tab oben rechts: **Bereitstellen → Neue Bereitstellung**.
2. Beim Zahnrad neben „Typ auswählen“ **Web-App** wählen.
3. Einstellen:
   - **Ausführen als:** Ich
   - **Zugriff:** Jeder
4. **Bereitstellen** klicken (eventuell noch einmal „Zugriff autorisieren“ bestätigen).

„Jeder“ ist nötig, damit die App und die Kurzbefehle deine Tabelle erreichen. Ohne deinen Schlüssel kann trotzdem niemand etwas lesen oder ändern.

## 5. App aufs iPhone / iPad holen

1. In der Tabelle: **Manga Tracker → App-Link anzeigen**. Beim ersten Mal fragt die Tabelle nach dem **Web-App-Link**: in Apps Script unter **Bereitstellen → Bereitstellungen verwalten** bei der Web-App die URL kopieren (endet auf `/exec`) und einfügen.
2. Den **Einrichtungs-Link** (beginnt mit `https://lobi1994.github.io/Manga-Tracker/#setup=`) kopieren und auf dein iPhone/iPad bringen – zum Beispiel per Notizen, AirDrop oder Mail an dich selbst.
3. Den Link auf dem iPhone/iPad in **Safari** öffnen. Deine (noch leere) Liste erscheint.
4. **Teilen → Zum Home-Bildschirm**. Jetzt hast du den Manga Tracker als App mit eigenem Symbol.

Auf dem Mac oder PC: den Link im Browser öffnen und als Lesezeichen speichern.

> **Wichtig:** Einrichtungs-Link, App-Link und Schlüssel nicht weitergeben – wer sie hat, kann deine Liste ändern. Falls das doch passiert ist: **Manga Tracker → Neuen Schlüssel erzeugen** und danach den neuen Einrichtungs-Link öffnen.

## 6. Kurzbefehle anlegen (iPhone / iPad)

Mit zwei Kurzbefehlen trägst du Kapitel direkt aus Safari ein, ohne die App zu öffnen. Unter **Manga Tracker → App-Link anzeigen** stehen auch dein **App-Link** (endet auf `/exec`) und dein **Schlüssel** – die brauchst du hier.

### Variante A: Kurzbefehle per iCloud-Link bekommen

Wenn dir jemand die Kurzbefehle als iCloud-Link schickt, fragt das iPhone beim Hinzufügen nach **App-Link** und **Schlüssel** – einfach deine eigenen Werte einfügen. Fertig.

### Variante B: Selbst bauen

Öffne die App **Kurzbefehle** → **+**.

**Kurzbefehl „Manga gelesen“** – trägt das gelesene Kapitel ein:

1. Oben auf den Namen tippen → **Umbenennen** → `Manga gelesen`. Über ⓘ **Im Share-Sheet anzeigen** einschalten und als Eingabe nur **URLs** und **Safari-Webseiten** zulassen.
2. Aktion **Text** → deinen App-Link einfügen. Danach Aktion **Variable festlegen** → Name `AppLink`.
3. Aktion **Text** → deinen Schlüssel einfügen. Danach **Variable festlegen** → Name `Schluessel`.
4. Aktion **URL codieren** → Eingabe: **Kurzbefehleingabe**.
5. Aktion **Inhalte von URL abrufen** → als URL eintippen und die Variablen einsetzen:
   `AppLink` `?key=` `Schluessel` `&add=` `Codierte URL`
6. Aktion **Ergebnis anzeigen** (oder **Mitteilung zeigen**) → **Inhalte von URL**.

Benutzen: Kapitel in Safari lesen → **Teilen → Manga gelesen**.

**Kurzbefehl „Kapitel aktualisieren“** – liest auf der Übersichtsseite einer Serie das neueste Kapitel und den Erscheinungstag aus:

1. Vorher einmal: **Einstellungen → Apps → Kurzbefehle → Erweitert → „Ausführen von Skripts erlauben“** einschalten.
2. Neuer Kurzbefehl `Kapitel aktualisieren`, im Share-Sheet anzeigen, Eingabe: **Safari-Webseiten**.
3. Wie oben: **Text** (App-Link) → **Variable festlegen** `AppLink`, **Text** (Schlüssel) → **Variable festlegen** `Schluessel`.
4. Aktion **JavaScript auf Webseite ausführen** → Eingabe **Kurzbefehleingabe**. Den vorhandenen Beispielcode komplett löschen und den Inhalt von [kurzbefehle/kapitel-aktualisieren.js](kurzbefehle/kapitel-aktualisieren.js) einfügen (dort **Copy raw file**).
5. Aktion **Inhalte von URL abrufen** → URL:
   `AppLink` `?key=` `Schluessel` `&url=` `JavaScript-Ergebnis`
6. Aktion **Ergebnis anzeigen** → **Inhalte von URL**.

Benutzen: Übersichtsseite einer Serie in Safari öffnen (bei manchen Seiten vorher auf den Reiter mit der Kapitelliste tippen) → **Teilen → Kapitel aktualisieren**.

## 7. Updates

Die App-Oberfläche aktualisiert sich von selbst. Wenn es eine neue Version des Skripts gibt (siehe Versionsnummer unten in der App und die [Änderungen auf GitHub](https://github.com/lobi1994/Manga-Tracker/commits/main)):

1. In Apps Script den Inhalt von `Code.gs` wieder durch die neue [MangaTracker-Vorlage.gs](google/MangaTracker-Vorlage.gs) ersetzen und speichern.
2. **Bereitstellen → Bereitstellungen verwalten → Stift (Bearbeiten) → Version: Neue Version → Bereitstellen.**

Der App-Link und der Schlüssel bleiben dabei gleich – App und Kurzbefehle musst du nicht ändern.

## Probleme?

| Was passiert | Lösung |
|---|---|
| „Der Schlüssel passt nicht (mehr)“ | Einrichtungs-Link aus **App-Link anzeigen** neu öffnen. |
| „Keine Verbindung zu deiner Google-Web-App“ | Bereitstellung prüfen: Zugriff muss **Jeder** sein. Nach Skript-Änderungen eine **neue Version** bereitstellen. |
| Menü „Manga Tracker“ fehlt | Tabelle neu laden und ein paar Sekunden warten. |
| Die Home-Bildschirm-App fragt nach dem Einrichtungs-Link | Den Link einmal in die App einfügen – sie merkt ihn sich danach. |
| Kurzbefehl meldet „Kein Zugriff“ | App-Link und Schlüssel im Kurzbefehl prüfen (keine Leerzeichen). |
