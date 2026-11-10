# Setting up Manga Tracker – Guide

[Deutsch](ANLEITUNG.md) | **English**

This guide gets you your own Manga Tracker. Your list lives in **your own Google Sheet** in your Google Drive, and nobody else can see it. The app interface comes from this GitHub page and is the same for everyone; it connects to your sheet through a personal link with a key.

You need: a Google account, about 15 minutes, and ideally a computer for steps 1 to 4 (an iPad works too, in the browser's desktop view).

The script's menus inside the sheet are in German. Their names are given below as they appear, with the English meaning in brackets.

---

## 1. Create a Google Sheet

1. Open [sheets.new](https://sheets.new). This creates a new, empty Google Sheet.
2. Name it **Manga Tracker** (top left).

## 2. Paste in the script

1. In the sheet: **Extensions → Apps Script**. A new tab opens with a file called `Code.gs`.
2. Open [google/MangaTracker-Vorlage.gs](google/MangaTracker-Vorlage.gs) and click **Copy raw file** at the top right (the icon with two rectangles).
3. Back in Apps Script: select everything in `Code.gs`, delete it and paste the copied text.
4. Click the **save icon**. You can name the project "Manga Tracker" at the top left.

## 3. Run the setup

1. Go back to the sheet tab and **reload** the page. After a few seconds a new menu **Manga Tracker** appears.
2. Choose **Manga Tracker → Einrichten** (Set up).
3. Google asks for permission. Because the script is your own and has not been reviewed by Google, you will see a warning:
   **Choose account → Advanced → "Go to Manga Tracker (unsafe)" → Allow.**
   This gives the script access to your sheet, a Drive folder for cover images and backups, schedules for the chapter check, and sending notifications to yourself.
4. If the message "Fertig eingerichtet" (setup complete) does not appear right away, just choose **Einrichten** again.

This also creates your **own random key**.

## 4. Deploy as a web app (once)

1. In the Apps Script tab, top right: **Deploy → New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Settings:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy** (you may need to confirm "Authorize access" once more).

"Anyone" is needed so the app and the shortcuts can reach your sheet. Without your key, nobody can read or change anything.

## 5. Get the app onto your iPhone / iPad

1. In the sheet: **Manga Tracker → App-Link anzeigen** (show app link). The first time, the sheet asks for the **web app link**: in Apps Script go to **Deploy → Manage deployments**, copy the web app URL (it ends in `/exec`) and paste it.
2. Copy the **setup link** (it starts with `https://lobi1994.github.io/Manga-Tracker/#setup=`) and get it onto your iPhone/iPad, for example via Notes, AirDrop or an email to yourself.
3. Open the link on your iPhone/iPad in **Safari**. Your (still empty) list appears.
4. **Share → Add to Home Screen**. You now have Manga Tracker as an app with its own icon.

On a Mac or PC: open the link in your browser and bookmark it.

> **Important:** Do not share your setup link, app link or key. Anyone who has them can change your list. If that happens: **Manga Tracker → Neuen Schlüssel erzeugen** (create new key), then open the new setup link.

## 6. Create the shortcuts (iPhone / iPad)

Two shortcuts let you log chapters straight from Safari without opening the app. **Manga Tracker → App-Link anzeigen** also shows your **app link** (ends in `/exec`) and your **key**. You need both here.

### Option A: Get the shortcuts via an iCloud link

If someone sends you the shortcuts as an iCloud link, your iPhone asks for the **app link** and **key** when you add them. Paste your own values and you're done.

### Option B: Build them yourself

Open the **Shortcuts** app → **+**.

**Shortcut "Manga gelesen"** (manga read) logs the chapter you just read:

1. Tap the name at the top → **Rename** → `Manga gelesen`. Under ⓘ, turn on **Show in Share Sheet** and allow only **URLs** and **Safari web pages** as input.
2. Action **Text** → paste your app link. Then action **Set Variable** → name `AppLink`.
3. Action **Text** → paste your key. Then **Set Variable** → name `Key`.
4. Action **URL Encode** → input: **Shortcut Input**.
5. Action **Get Contents of URL** → type this as the URL and insert the variables:
   `AppLink` `?key=` `Key` `&add=` `URL Encoded Text`
6. Action **Show Result** (or **Show Notification**) → **Contents of URL**.

How to use: read a chapter in Safari → **Share → Manga gelesen**.

**Shortcut "Kapitel aktualisieren"** (update chapter) reads the latest chapter and release day from a series' overview page:

1. Once beforehand: **Settings → Apps → Shortcuts → Advanced → Allow Running Scripts**.
2. New shortcut `Kapitel aktualisieren`, shown in the Share Sheet, input: **Safari web pages**.
3. As above: **Text** (app link) → **Set Variable** `AppLink`, **Text** (key) → **Set Variable** `Key`.
4. Action **Run JavaScript on Web Page** → input **Shortcut Input**. Delete the sample code completely and paste the contents of [kurzbefehle/kapitel-aktualisieren.js](kurzbefehle/kapitel-aktualisieren.js) (use **Copy raw file** there).
5. Action **Get Contents of URL** → URL:
   `AppLink` `?key=` `Key` `&url=` `JavaScript Result`
6. Action **Show Result** → **Contents of URL**.

How to use: open a series' overview page in Safari (on some sites, tap the tab with the chapter list first) → **Share → Kapitel aktualisieren**.

## 6b. Reading overlay in Safari (optional)

With this you no longer need to tap "Manga gelesen":

- **On a series' chapter overview** you see "read up to X" at the bottom, your chapter is highlighted, and a button takes you to the next chapter.
- **On a chapter page** the chapter is saved automatically once you reach the end (at least 15 seconds on the page) or tap "next chapter". A message with **Undo** appears.
- **Older or already read chapters** change nothing.
- **Series that are not in your list yet** are only added if you tap **Add**.
- The overlay only runs on reading sites that already appear in your list. A new site is added once you use "Manga gelesen" there.

Setup (about 5 minutes):

1. Get the free app **Userscripts** from the App Store and open it. Pick a folder for the scripts (e.g. "On My iPhone").
2. **Settings → Apps → Safari → Extensions → Userscripts**: turn it on and set *Other Websites* to **Allow**.
3. In Safari, open [the script](https://raw.githubusercontent.com/lobi1994/Manga-Tracker/main/userscript/manga-tracker.user.js). Tap the puzzle icon (or **ᴀA**) in the address bar → **Userscripts** → **Install**.
4. In Safari (not the home screen app), open [lobi1994.github.io/Manga-Tracker](https://lobi1994.github.io/Manga-Tracker/) once. After a few seconds **"Reading overlay connected ✓"** appears. If the page asks for the setup link, paste yours from **App-Link anzeigen**.

Requires script version 2.5 or newer (see "7. Updates").

## 6c. Manga ideas from Instagram (optional)

Collect reels and posts with manga tips and add them to your list later with one tap. Free, no outside services.

**Shortcut "Manga merken"** (create once, about 5 minutes):

1. Shortcuts app → **+** → name `Manga merken`. Under ⓘ turn on **Show in Share Sheet**, input: **URLs** and **Text**.
2. Action **Get Contents of URL**. URL: your **app link** (ends in `/exec`, see **App-Link anzeigen**).
3. In that action tap **Show More**: Method **POST**, Request Body **Form**. Add three fields (all type Text):
   - `fn` → `apiInboxNeu`
   - `key` → your **key**
   - `url` → variable **Shortcut Input**
4. Action **Show Notification** → **Contents of URL**.

How to use: in Instagram, on a reel or post tap **Share** (paper plane) → **Share to …** / **More** → **Manga merken**. "Saved ✓ (3 open)" appears. The links go to the **Inbox** sheet of your spreadsheet.

**Going through them** (needs the overlay from 6b, version 1.2 or newer):

1. In **Safari**, open [instagram.com](https://www.instagram.com) and log in. At the bottom: "📥 3 manga ideas saved" → **Open ›**.
2. The overlay suggests titles from the caption and picture texts; in picture series more appear as you swipe. Tap the right title or type it.
3. Results with chapter counts appear → **Add**. The manga goes into your list (note "Idee von Instagram"), the link is done.
4. **Next idea ›**, **Skip ›** or **Not interested**.

On any other Instagram post in Safari there is a **Find manga** button at the bottom.

**Read text on pictures** (optional, once, about 2 minutes): lets the overlay also read titles that only appear on the pictures (via Google Drive, free).

1. In Apps Script, next to **Services** on the left, click **+** → **Drive API** → **Add**.
2. In the function menu at the top choose **ocrBerechtigen** → **Run** → allow access.
3. **Deploy → Manage deployments → pencil → New version → Deploy.**

The overlay then reads the picture on screen (in picture series, each one you swipe to) and shows the recognised lines as suggestions.

Chapter counts come from MangaUpdates (otherwise AniList). If the title is only spoken in a video, the overlay cannot find it – just type it in.

## 7. Updates

The app interface updates itself. When there is a new version of the script (see the version number at the bottom of the app and the [changes on GitHub](https://github.com/lobi1994/Manga-Tracker/commits/main)):

1. In Apps Script, replace the contents of `Code.gs` with the new [MangaTracker-Vorlage.gs](google/MangaTracker-Vorlage.gs) and save.
2. **Deploy → Manage deployments → pencil (Edit) → Version: New version → Deploy.**

The app link and key stay the same, so you don't need to change the app or the shortcuts.

## Problems?

| What happens | Fix |
|---|---|
| "Der Schlüssel passt nicht (mehr)" (the key doesn't match) | Open the setup link from **App-Link anzeigen** again. |
| "Keine Verbindung zu deiner Google-Web-App" (no connection to your web app) | Check the deployment: access must be **Anyone**. After script changes, deploy a **new version**. |
| The "Manga Tracker" menu is missing | Reload the sheet and wait a few seconds. |
| The home screen app asks for the setup link | Paste the link into the app once; it remembers it after that. |
| Shortcut says "Kein Zugriff" (no access) | Check the app link and key in the shortcut (no spaces). |
