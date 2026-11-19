# Datenmodell – SachsenspiegelLab

Alle Daten liegen als statisches JSON unter `data/` und werden von der App per `fetch` geladen.
Bilder der Handschrift werden **nicht** gespeichert, sondern direkt vom IIIF-Server der SLUB geladen.

```
data/
├─ manuscript-pages.json     erzeugt: scripts/build-page-index.mjs
├─ articles.json             erzeugt: scripts/build-data.mjs
├─ transcriptions.json       erzeugt: scripts/build-data.mjs
├─ themes.json               gepflegt (Themenkarten)
├─ synonyms.json             gepflegt (Synonymgruppen für die Suche)
├─ project-annotations.json  gepflegt (mitgelieferte Bildmarkierungen, nur lesbar)
├─ content/lr-i-*.json       gepflegt (Titel, Kernpunkte, Bedeutung, Übertragungen)
└─ source/
   ├─ luebben-sections.json  erzeugt: scripts/import-luebben.mjs (Editionstext je §)
   ├─ luebben-anchors.json   gepflegt (Anfangsworte je § → verbindliche Gliederung)
   ├─ corrections.json       gepflegt (OCR-Korrekturen je §)
   └─ page-map.json          gepflegt (Buchgrenzen, geprüfte Seitenzuordnungen)
```

## Pipeline

```
IIIF-Manifest ──build-page-index.mjs──► manuscript-pages.json
archive.org OCR ──import-luebben.mjs──► source/luebben-sections.json  (+ luebben-anchors.json)
source/* + content/* + manuscript-pages.json ──build-data.mjs──► articles.json, transcriptions.json
```

`build-data.mjs` **überschreibt niemals** Einträge in `transcriptions.json`, deren `status` bereits
`"verified"` ist. Nur der Projektinhaber setzt `verified`.

---

## `manuscript-pages.json`

| Feld | Typ | Bedeutung |
|---|---|---|
| `pageNumber` | number | laufende Nummer 1–196 = Canvas-Reihenfolge = `sachsen.digital/werk/6439/<n>` |
| `label` | string \| null | Blattangabe aus dem Manifest, z. B. `"4r"`; `null` bei Einband/ohne Zählung |
| `displayLabel` | string | Anzeigeform (`"Bl. 4r"` oder z. B. `"Einband (alt)"`) |
| `canvasId` | string | IIIF-Canvas-URI |
| `width`, `height` | number | Canvas-Maße laut Manifest |
| `imageServiceUrl` | string | IIIF-Image-Service (ohne `/info.json`) |
| `thumbnailUrl` | string | `…/full/250,/0/default.jpg` (Galerie) |
| `previewUrl` | string | `…/full/500,/0/default.jpg` |
| `sachsenDigitalUrl` | string | `https://sachsen.digital/werk/6439/<pageNumber>` |
| `sections` | string[] | Gliederung des Manifests (z. B. `"Bl. 4 ff. Landrecht I"`) |

Kopf: `title`, `manifestUrl`, `attribution`, `license` (Public Domain Mark 1.0), `structures[]` mit
`label`, `firstPage`, `lastPage`.

Hinweis: Der SLUB-Server liefert höchstens ca. 1000 px Breite (`*.medium.jpg`); der Viewer zoomt daher etwa auf das 2–3-Fache.

## `articles.json`

```json
{
  "books": [{ "id": "lr-i", "label": "Landrecht I", "short": "LR I", "part": "landrecht", "count": 71, "released": true }],
  "counts": { "verified": 0, "draft": 71, "missing": 244 },
  "articles": [ … ]
}
```

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | string | `lr-prolog`, `lr-i-1` … `lr-i-71`, `lr-ii-*`, `lr-iii-*`, `lehnrecht-*` |
| `book` | string | `lr-i` \| `lr-ii` \| `lr-iii` \| `lehnrecht` |
| `article` | number | Artikelnummer nach Homeyer (0 = Vorrede) |
| `label` | string | z. B. `"LR I 2"` |
| `title` | string \| null | Sachtitel, z. B. `"Zweischwerterlehre"` |
| `metaStatus` | `verified` \| `draft` \| `missing` | Status von Titel/Kernpunkten/Bedeutung (`verified` = wörtlich aus den Tafelbildern) |
| `keyPoints` | string[] | Kernpunkte |
| `significance` | string | Kasten „Bedeutung“ |
| `keywords` | string[] | Schlagworte (durchsuchbar) |
| `synonyms` | string[] | artikelspezifische Synonyme (durchsuchbar) |
| `note` | string \| null | redaktioneller Hinweis (z. B. LR I 26 fehlt in der Hs.) |
| `status` | `verified` \| `draft` \| `missing` | aggregiert aus den §§: alle verified → verified; keine §§ → missing |
| `sectionCount` | number | Anzahl §§ |
| `pages[]` | object[] | `{ pageNumber, canvasId, label, mappingStatus: "verified"\|"unverified", method }` |

`method` der Seitenzuordnung:

- `claude-visual` – am IIIF-Bild abgeglichen (Rubriken, Textanfänge, Bildstreifen), noch unbestätigt
- `claude-visual-estimate` – teils abgeglichen, teils geschätzt
- `manifest-structure` – aus der Gliederung des Manifests (z. B. Prolog = S. 14)
- `estimate-text-length` – linear nach Textmenge innerhalb der Buchgrenzen des Manifests geschätzt

Artikel ohne erhaltene oder zugeordnete Seite haben `pages: []`.

## `transcriptions.json`

Ein Eintrag je §:

| Feld | Typ | Bedeutung |
|---|---|---|
| `articleId` | string | z. B. `lr-i-2` |
| `sectionId` | string | `<articleId>-s<§>`, z. B. `lr-i-2-s3` |
| `section` | number | § |
| `pageNumber` | number \| null | erste zugeordnete Seite |
| `pages` | number[] | alle Seiten, auf denen der § (vermutlich) steht |
| `canvasId` | string \| null | Canvas der ersten Seite |
| `pageMapping` | string | Methode wie oben |
| `plainText` | string | Originaltext |
| `translation` | string | freie Übertragung ins heutige Deutsch |
| `status` | `verified` \| `draft` \| `missing` | nur der Projektinhaber setzt `verified` |
| `basis` | `edition` \| `manuscript-reading` | `edition` = Text aus einer Edition; `manuscript-reading` = direkt aus dem IIIF-Bild gelesen |
| `edition` | string | z. B. `"Lübben 1879"` |
| `ocr` | `raw` \| `cleaned` \| `corrected` | Bearbeitungsstand des OCR-Textes |
| `sourceNote` | string | vollständiger Quellennachweis |
| `textRegions` | object[] | optional, für spätere Trefferhervorhebung: `{ pageNumber, region: {x,y,w,h} }` (Anteile 0..1) |

Artikel ohne Eintrag gelten als `missing`; die App zeigt dann:
„Für diese Stelle liegt noch keine projektgepflegte Transkription vor.“

### Textgrundlage

August Lübben (Hg.): *Der Sachsenspiegel, Landrecht und Lehnrecht, nach dem Oldenburger Codex picturatus von 1336*,
Oldenburg 1879 – gemeinfrei, Digitalisat <https://archive.org/details/dersachsenspiege00lbbe>.
Die Edition gibt den mittelniederdeutschen Text der Oldenburger Bilderhandschrift mit Homeyers Artikelzählung am Rand.
Das ist **nicht** der Wortlaut der Dresdner Handschrift (mitteldeutsch). Die Oldenburger Handschrift stellt einige §§
um (z. B. LR I 60 § 3 – 62) und weist LR I 26 nicht als eigenen Artikel aus.

## `themes.json`

```json
{ "id": "erbrecht", "group": "landrecht", "title": "Erbrecht",
  "meta": "v. a. LR I · Art. 3–6, 17, 24–33 · LR III · Art. 72, 80–81",
  "summary": "Regeln zu Erbfolge, Verwandtschaft und Nachlass.",
  "refs": [ { "book": "lr-i", "from": 3, "to": 6 }, { "book": "lehnrecht", "from": 71, "to": 71, "sections": [21, 22] } ] }
```

`meta` ist die Anzeigezeile, `refs` die maschinenlesbaren Intervalle (optional mit §§).

## `synonyms.json`

`groups: string[][]` – ein Suchbegriff aus einer Gruppe findet alle Wörter der Gruppe (heutige Begriffe ↔ Formen der Edition).

## Annotationen (localStorage, Export)

Gespeichert unter `ssl.annotations.v1` im Browser. Export/Import als JSON:

```json
{
  "schemaVersion": 1,
  "app": "SachsenspiegelLab",
  "exportedAt": "2026-11-19T18:00:00.000Z",
  "count": 1,
  "annotations": [
    {
      "id": "note-…",
      "target": {
        "type": "section",            // "section" | "article" | "page"
        "articleId": "lr-i-3",
        "sectionId": "lr-i-3-s2",
        "pageNumber": 16,             // optional
        "canvasId": "https://iiif.slub-dresden.de/iiif/2/272362328/canvas/PHYS_0016",
        "region": { "x": 0.088, "y": 0.663, "w": 0.107, "h": 0.098 }   // optional, Anteile 0..1
      },
      "text": "Adler = König",
      "tags": ["Heerschild"],
      "createdAt": "…", "updatedAt": "…"
    }
  ]
}
```

Import-Validierung: gültiges JSON, `schemaVersion` ≤ 1, `annotations` als Liste; je Eintrag `id`, `text`
(≤ 20 000 Zeichen), `tags` als Zeichenketten, gültiger `target.type` mit Pflichtfeldern, `pageNumber` 1–196,
Region im Bereich 0..1. Fehlerhafte Einträge werden übersprungen und gemeldet.
Modi: **zusammenführen** (bei gleicher `id` gewinnt das neuere `updatedAt`) oder **ersetzen**.

## `project-annotations.json`

Wie Annotationen, aber nur lesbar und mit `label`/`title`. Derzeit: die sieben Heerschilde auf S. 16 (Bl. 4v)
nach dem Tafelbild „Die Heerschilde in der Dresdner Bilderhandschrift“.
