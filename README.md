# SachsenspiegelLab

Der Sachsenspiegel des Eike von Repgow Artikel für Artikel: **Originaltext**, **freie Übertragung ins heutige Deutsch**
und **eigene Annotationen** nebeneinander, dazu alle 196 Seiten der **Dresdner Bilderhandschrift**
(SLUB Dresden, Mscr.Dresd.M.32) im IIIF-Viewer.

Unterseite von [datenflix007.github.io](https://datenflix007.github.io/), rein statisch (HTML/CSS/JS, ES-Module), ohne Build-Server.

## Funktionen

- **Übersicht** – Themenkarten (Landrecht/Lehnrecht) mit konkreten Artikelintervallen und ein Gesamtverzeichnis
  aller 315 Artikel (Vorrede, LR I–III, Lehnrecht) im Stil von gesetze-im-internet.de.
- **Artikel** – Verzeichnis links, Artikelkopf mit Kernpunkten und „Bedeutung“, darunter je § eine Zeile
  *Original | Übertragung | Annotationen*. Das Handschriften-Panel lässt sich einblenden; Vor/Zurück mit `[` und `]`.
- **Handschrift** – Galerie aller 196 Seiten (lazy geladene IIIF-Thumbnails), Viewer mit Zoom/Pan
  (OpenSeadragon 4.1.1), Vollbild, Sprung zu Seite oder Blatt („4r“), Filmstreifen, „Quelle ↗“ zu sachsen.digital.
  **Text über dem Bild:** Die Transkription liegt zeilengenau und transparent auf der Handschrift (Deckkraft
  einstellbar). Ein Klick auf Original oder Übertragung markiert die Zeilen im Bild, ein Klick auf eine Zeile
  springt zum §. Die Zeilen sind automatisch erkannt, die Zuordnung ist geschätzt.
  **Werkzeuge wie in Transkribus:** Rechteck, Linie und Freihand mit Farbe und Strichstärke, dazu Glossen im
  Rich-Text-Editor. Ebenen: Eigene (Sitzung), Projekt (Repo-Datei), Importiert (Datei).
- **Kontext** – Schaubilder der Tafelbilder als HTML/SVG: Heerschilde, Grenzen der Heerschildordnung, Landrecht,
  Tabelle zu LR I 2, Hecks Deutungsmodell, Gesamtmodell, Netzdiagramm – mit Kennzeichnungen
  („Forschungsdeutung, nicht Wortlaut Eikes“, „heuristisch“, „rekonstruiert“).
- **Suche** – Volltext über Original, Übertragung, Titel, Kernpunkte, Schlagworte und Synonyme;
  **Regex-Modus**, Synonymgruppen (Gewere ↔ Besitz …), Toleranz für Schreibvarianten (u/v/w, i/j/y, c/k, gh/g, th/t …).
- **Notizen** – Annotationen je §, Artikel oder Seite mit Tags, automatisch im `localStorage`;
  Export/Import als JSON (Zusammenführen oder Ersetzen).
- Dunkles Design passend zur Hauptseite, umschaltbar auf ein helles „Pergament“-Theme; mobil mit Tabs
  *Original | Übertragung | Notizen | Handschrift*.

## Deep Links

| Adresse | Ziel |
|---|---|
| `#article/lr-i-2` | Artikel |
| `#article/lr-i-2?s=3` | Artikel, zu § 3 springen |
| `#article/lr-i-2?page=15` | Artikel mit Handschriften-Panel auf Seite 15 |
| `#page/15` | Viewer, Seite 15 (Bl. 4r) |
| `#manuscript` | Galerie |
| `#search?q=herw[ea]de&mode=regex` | Suche |
| `#theme/erbrecht` | Themenfeld |
| `#context/heck` | Schaubild |
| `#notes` | eigene Annotationen |

## Bearbeitungsstand

| Teil | Status |
|---|---|
| Vorrede, Landrecht I–III, Lehnrecht | Text aus der Edition (Lübben 1879), freie Übertragung, Metadaten – **Entwurf** (313 Artikel) |
| LR I 26, LR II 19 | fehlen in der Oldenburger Hs. – Status **missing** |
| LR I 1–3 (Seiten 14–17, 33) | Seitenzuordnung manuell geprüft; übrige Seiten geschätzt |

Titel, Kernpunkte und „Bedeutung“ von LR I 1–3 stammen wörtlich aus den Tafelbildern (`metaStatus: verified`).
Alle übrigen erzeugten Inhalte sind Entwürfe. Den Status **verified** setzt nur der Projektinhaber.

## Quellen

- **Handschrift:** Die Dresdner Bilderhandschrift des Sachsenspiegels, SLUB Dresden, Mscr.Dresd.M.32 –
  [sachsen.digital/werk/6439](https://sachsen.digital/werk/6439), IIIF-Manifest
  `https://iiif.slub-dresden.de/iiif/2/272362328/manifest.json`, Public Domain Mark 1.0.
  Kein iframe; die Bilder kommen direkt vom IIIF-Server, nichts liegt im Repository.
- **Text:** A. Lübben (Hg.), *Der Sachsenspiegel, Landrecht und Lehnrecht, nach dem Oldenburger Codex picturatus
  von 1336*, Oldenburg 1879 (gemeinfrei, [archive.org](https://archive.org/details/dersachsenspiege00lbbe)), OCR, bereinigt.
  Es handelt sich um eine Edition der Oldenburger Handschrift, nicht um eine Lesung der Dresdner Handschrift.
- **Übertragungen, Kernpunkte, Schaubild-Nachbauten:** SachsenspiegelLab (Entwurf).

## Entwicklung

Voraussetzung: Node ≥ 18 (nur für die Skripte), beliebiger statischer Webserver.

```bash
node scripts/build-page-index.mjs        # IIIF-Manifest → data/manuscript-pages.json
node scripts/import-luebben.mjs          # Edition (OCR) → data/source/luebben-sections.json
node scripts/build-data.mjs              # → data/articles.json, data/transcriptions.json
python -m http.server 8000               # dann http://localhost:8000/
```

Neue Bücher freischalten: Anker in `data/source/luebben-anchors.json` ergänzen, Inhalte unter
`data/content/` anlegen, in `scripts/build-data.mjs` `released: true` setzen und die Skripte erneut ausführen.
Das Datenmodell beschreibt [`docs/datenmodell.md`](docs/datenmodell.md).

## Struktur

```
index.html            App-Shell (Hash-Routing)
css/                  tokens.css · layout.css · components.css
js/app.js             Router, Dialoge, Theme
js/data.js · search.js · util.js
js/views/             home · article · manuscript · search · context · notes
js/components/        viewer (OpenSeadragon/IIIF) · notes · toc
js/annotations/       store (localStorage, Export/Import)
data/                 JSON-Daten (siehe docs/datenmodell.md)
scripts/              Build-Skripte (Node)
reference/tafelbilder Vorlagen (Tafelbilder)
```
