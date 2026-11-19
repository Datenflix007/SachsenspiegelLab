#!/usr/bin/env node
/**
 * import-luebben.mjs
 *
 * Liest den OCR-Text der gemeinfreien Edition
 *   August Lübben (Hg.): Der Sachsenspiegel, Landrecht und Lehnrecht,
 *   nach dem Oldenburger Codex picturatus von 1336. Oldenburg 1879.
 *   Digitalisat: https://archive.org/details/dersachsenspiege00lbbe
 * und zerlegt ihn in Bücher, Artikel und Paragraphen (Homeyer-Zählung).
 *
 * Zwei Stufen:
 *  1. automatisch über die Randzählung der Edition („I, 2, §. 1.“ bzw. „Art. 21. §. 1.“),
 *  2. verbindlich über Anker (data/source/luebben-anchors.json): geordnete Liste der
 *     Anfangsworte je §. Wo Anker vorliegen, ersetzen sie die automatische Gliederung.
 *
 * Ausgabe: data/source/luebben-sections.json  (+ Protokoll auf stdout)
 *
 * Aufruf:
 *   node scripts/import-luebben.mjs                 # lädt den OCR-Text von archive.org
 *   node scripts/import-luebben.mjs pfad/zur/datei  # nutzt lokale Kopie
 *   DEBUG_STREAM=datei.txt node scripts/import-luebben.mjs …   # Lesefassung mit Markern
 *
 * Der Text ist OCR. Er wird automatisch bereinigt (Fußnoten, Foliozählung, Kolumnentitel,
 * Silbentrennung, Kapitelzahlen der Handschrift). OCR-Fehler bleiben möglich;
 * Korrekturen gehören nach data/source/corrections.json.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_URL = "https://archive.org/download/dersachsenspiege00lbbe/dersachsenspiege00lbbe_djvu.txt";
const OUT = resolve(ROOT, "data/source/luebben-sections.json");
const ANCHORS = resolve(ROOT, "data/source/luebben-anchors.json");

const BOOKS = { 1: "lr-i", 2: "lr-ii", 3: "lr-iii", 4: "lehnrecht" };
const BOOK_ORDER = ["lr-i", "lr-ii", "lr-iii", "lehnrecht"];

async function loadText() {
  const local = process.argv[2];
  if (local) return readFile(local, "utf8");
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Download fehlgeschlagen: ${res.status}`);
  return res.text();
}

// ---------- Muster ----------
const ocrNum = (s) => Number(String(s).replace(/[lIi|]/g, "1").replace(/[oO]/g, "0").replace(/[^0-9]/g, ""));
const TOKEN = String.raw`\u0001\d+\u0002`;
const ROMAN = String.raw`(?:[IVX][IVXLUTl1]{0,7}|XL|IL)`;
// Kapitelzahl der Oldenburger Hs. vor einem Satzanfang, z. B. „XII. Origenes“, „XL De“ (=XI.)
const ROMAN_RE = new RegExp(String.raw`(^|\s)${ROMAN}[.,»]?(?=\s+(?:${TOKEN})?(?:[0-9lix]\)\s*)?["„]?[A-ZÄÖÜ])`, "g");
// Randmarker Landrecht: „I, 2, §. 1.“, „11,13, §.1.“, „1,7.“, „i, l.“, „1.34.“, „1 6; s.l.“
// Gruppen: 1 Buch, 2 Artikel (mit Trenner), 3 Artikel (ohne Trenner, nur mit §-Teil), 4 §
const LR_MARK = /(^|\s)(III|111|lll|Ill|IIl|lIl|HI|II|11|Il|lI|ll|I|1|l|i|\]|J|!|\|)(?:\s?[,;.]\s?([0-9lIO]{1,2})|\s([0-9]{1,2})(?=[,;.]\s*[§s]\s?[.,]?\s?[0-9lI]))\s?(?:[,;.]\s*[§s]\s?[.,•♦*]?\s?([0-9lI]{1,2})\s?[.,]?|[.,](?=\s|$))\s?\.?/g;
// Randmarker Lehnrecht: „Art. 21. §. 1.“, „Art.l.“
const LN_MARK = /(^|\s)Art\.\s?([0-9lI]{1,2})\s?\.?\s*(?:§\s?[.,•♦*]?\s?([0-9lI]{1,2})\s?[.,]?)?/g;
// Nur Paragraph: „§.2.“, „§ 2.“, „§♦ 3.“, „§*2.“, „§,4.“
const PAR_MARK = /(^|\s)§\s?[.,•♦*]?\s?([0-9lI]{1,2})\s?[.,«]?/g;

const isFootnoteStart = (l) => /^\s*(?:[0-9]{1,2}|[liIx])\s?[)j]\s/.test(l);
const isPageFurniture = (l) => {
  const t = l.trim();
  if (!t) return false;
  return (
    /^[0-9]{1,3}$/.test(t) ||
    /^[IVXl1]{1,4}\.?(\s+[0-9]{1,3})?$/.test(t) ||
    /^[0-9IVXl]{1,4}\.?\s+[0-9]{1,3}$/.test(t) ||
    /^[0-9,\s]+\(\s*S\.\s*[0-9]+\s*\)$/.test(t) ||
    /^Dit\s+is\s+der\s+sass/i.test(t) ||
    /^Incipit\s/.test(t) ||
    /^[^a-zäöü]{1,3}$/.test(t)
  );
};

function cleanLines(lines) {
  const out = [];
  let inNote = false;
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    if (inNote) {
      if (!l.trim()) inNote = false;
      continue;
    }
    if (isFootnoteStart(l) && (i === 0 || !lines[i - 1].trim() || !lines[i - 2]?.trim())) {
      inNote = true;
      continue;
    }
    if (isPageFurniture(l) || !l.trim()) continue;
    l = l
      .replace(/[|\[\]][|j\[]\s*\(\s*[ft]\*?\.[^)]*\)/g, " ")
      .replace(/\(\s*[ft]\*?\.\s*[0-9IlO]+[^)]{0,6}\)/g, " ")
      .replace(/\|\|/g, " ");
    out.push(l.replace(/\s+/g, " ").trim());
  }
  return out;
}

function stripInline(t) {
  return t
    .replace(/(\S)\s?(?:[0-9]{1,2}|[lix])\s?\)(?=[\s,.;:\u0001]|$)/g, "$1") // Fußnotenzeichen „he 6)“
    .replace(/(\S)\s?[0-9]{1,2}\s?[j;](?=[\s,.;:\u0001]|$)/g, "$1") // „10j“, „2;“
    .replace(/(^|\s)[!*'^]\)/g, "$1")
    .replace(ROMAN_RE, "$1")
    .replace(/\bAI\b/g, "Al")
    .replace(/(\w)-\s+(\u0001\d+\u0002)?([a-zäöüß])/g, "$1$3$2") // Silbentrennung
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function findBoundary(line, markerAtStart, prevEndsSentence) {
  ROMAN_RE.lastIndex = 0;
  const r = ROMAN_RE.exec(line);
  ROMAN_RE.lastIndex = 0;
  if (r) return r.index + r[1].length;
  if (markerAtStart && prevEndsSentence) return 0;
  const s = /[.;:]\s+(?=["„]?[A-ZÄÖÜ])/.exec(line);
  if (s) return s.index + s[0].length;
  return 0;
}

function parseRegion(lines, bookNo, log) {
  const marks = [];
  let curBook = bookNo;
  let curArt = 1;
  let curSec = 1;
  const stripped = lines.map((raw) => {
    const found = [];
    let text = raw;
    const take = (re, fn) => {
      text = text.replace(re, (m, pre, ...g) => {
        found.push({ off: g[g.length - 2], ...fn(g) });
        return pre + " \u0000 ";
      });
    };
    if (bookNo === 4) {
      take(LN_MARK, (g) => ({ article: ocrNum(g[0]), section: g[1] ? ocrNum(g[1]) : 1 }));
    } else {
      take(LR_MARK, (g) => {
        const b = g[0].replace(/[\]J!|]/g, "I").replace(/[^IHl1i]/g, "").replace(/H/g, "II").length;
        return { book: b, article: ocrNum(g[1] ?? g[2]), section: g[3] ? ocrNum(g[3]) : 1, raw: g.slice(0, 4).join("|") };
      });
    }
    take(PAR_MARK, (g) => ({ section: ocrNum(g[0]) }));
    found.sort((a, b) => a.off - b.off);
    const atStart = /^\s*\u0000/.test(text);
    text = text.replace(/\s*\u0000\s*/g, " ").replace(/\s+/g, " ").trim();
    return { text, found, atStart };
  });

  for (let i = 0; i < stripped.length; i++) {
    const s = stripped[i];
    for (const f of s.found) {
      let art = f.article ?? curArt;
      const sec = f.section;
      if (f.book !== undefined) {
        if (f.book === curBook + 1 && f.article <= 3) curBook = f.book;
        else if (f.book !== curBook) log.push(`B${curBook} Z${i}: Buchzahl ${f.book} (${f.raw}) ignoriert`);
      }
      if (f.article === undefined && sec === 1 && marks.length) art = curArt + 1;
      if (f.article !== undefined && f.article !== curArt && f.article !== curArt + 1) {
        log.push(`B${curBook} Z${i}: Artikelsprung ${curArt} → ${f.article}`);
      }
      if (f.article === undefined && sec !== 1 && sec !== curSec + 1) {
        log.push(`B${curBook} Z${i}: §-Folge Art. ${curArt} §${curSec} → §${sec}`);
      }
      const prevEnds = i > 0 && /[.;:]\s*$/.test(stripped[i - 1].text);
      marks.push({ line: i, col: findBoundary(s.text, s.atStart, prevEnds), book: curBook, article: art, section: sec });
      curArt = art;
      curSec = sec;
    }
  }

  let full = "";
  const offsets = [];
  for (const s of stripped) {
    offsets.push(full.length);
    full += s.text + "\n";
  }
  const pos = marks.map((m) => offsets[m.line] + m.col);
  let tokened = "";
  let last = 0;
  pos.forEach((p, k) => {
    tokened += full.slice(last, p) + `\u0001${k}\u0002`;
    last = p;
  });
  tokened += full.slice(last);
  const clean = stripInline(tokened.replace(/-\n/g, "").replace(/\n/g, " "));
  const parts = clean.split(/\u0001(\d+)\u0002/);
  const segs = [{ book: BOOKS[bookNo], article: 0, section: 0, text: parts[0] }];
  for (let i = 1; i < parts.length; i += 2) {
    const m = marks[Number(parts[i])];
    segs.push({ book: BOOKS[m.book], article: m.article, section: m.section, text: parts[i + 1] });
  }
  return segs
    .map((x) => ({ ...x, articleId: x.article === 0 ? (bookNo === 4 ? "lehnrecht-0" : "lr-prolog") : `${x.book}-${x.article}` }))
    .map((x) => ({ ...x, text: x.text.replace(/\s+/g, " ").trim() }))
    .filter((x) => x.text);
}

/**
 * Anker-Segmentierung. anchors: [{id, s, a}] in Handschriftenreihenfolge, abgeschlossen
 * durch {end: true, a: "…"}. Innerhalb [erster Anker, Endanker) wird die automatische
 * Gliederung verworfen und durch die Anker ersetzt.
 */
function applyAnchors(segs, anchors, log) {
  if (!anchors?.length) return segs;
  const norm = (t) => t.replace(/\s+/g, " ").trim();
  let stream = "";
  const starts = [];
  for (const sg of segs) {
    starts.push(stream.length);
    stream += norm(sg.text) + " ";
  }
  let from = 0;
  const hits = [];
  for (const a of anchors) {
    const at = stream.indexOf(norm(a.a), from);
    if (at < 0) {
      log.push(`Anker nicht gefunden: ${a.end ? "ENDE" : a.id + " §" + a.s} „${a.a}“`);
      continue;
    }
    hits.push({ ...a, at });
    from = at + 1;
  }
  if (hits.length < 2) return segs;
  const rangeStart = hits[0].at;
  const lastHit = hits[hits.length - 1];
  const rangeEnd = lastHit.end ? lastHit.at : stream.length;
  const before = [];
  const after = [];
  segs.forEach((sg, i) => {
    const s0 = starts[i];
    const s1 = (starts[i + 1] ?? stream.length) - 1;
    if (s1 <= rangeStart) before.push(sg);
    else if (s0 >= rangeEnd) after.push(sg);
    else {
      if (s0 < rangeStart) before.push({ ...sg, text: norm(stream.slice(s0, rangeStart)) });
      if (s1 > rangeEnd) after.push({ ...sg, text: norm(stream.slice(rangeEnd, s1)) });
    }
  });
  const anchored = [];
  hits.forEach((h, k) => {
    if (h.end) return;
    const next = hits[k + 1];
    const m = h.id.match(/^(.*)-(\d+)$/);
    anchored.push({
      book: h.id === "lr-prolog" ? "lr-i" : m[1],
      article: h.id === "lr-prolog" ? 0 : Number(m[2]),
      articleId: h.id,
      section: h.s,
      text: norm(stream.slice(h.at, next ? next.at : rangeEnd)),
      anchored: true,
    });
  });
  // Reste vor/nach dem Ankerbereich, die nur aus Kapitelzahlen o. ä. bestehen, verwerfen
  const real = (x) => x.text && x.text.replace(/[^a-zäöüß]/gi, "").length >= 4;
  return [...before.filter(real), ...anchored, ...after.filter(real)];
}

async function main() {
  const raw = (await loadText()).replace(/\r/g, "").split("\n");
  const find = (re, from = 0) => {
    for (let i = from; i < raw.length; i++) if (re.test(raw[i])) return i;
    throw new Error("Nicht gefunden: " + re);
  };
  const lrStart = find(/^I\.\s+Des\s+hilighen\s+geystes\s+minne/);
  const lrEnd = find(/^Expliciunt\s+tres\s+lib/, lrStart);
  const lnStart = find(/^Incipit\s+liber\s+quartus/, lrEnd);
  const lnEnd = find(/^Anno\s+domini\s+MCCCXXX/, lnStart);

  let anchors = {};
  try {
    anchors = JSON.parse(await readFile(ANCHORS, "utf8"));
  } catch {
    /* noch keine Anker */
  }

  const log = [];
  // Die Oldenburger Hs. setzt die Buchgrenzen anders als Homeyer (z. B. Buch II ab II 13).
  // Daher wird das Landrecht als ein Strom gelesen; die Buchzahl kommt aus der Randzählung.
  const regions = [
    [1, raw.slice(lrStart, lrEnd), anchors.landrecht],
    [4, raw.slice(lnStart + 1, lnEnd), anchors.lehnrecht],
  ];
  const sections = [];
  const debug = [];
  for (const [bookNo, lines, anc] of regions) {
    const parts = applyAnchors(parseRegion(cleanLines(lines), bookNo, log), anc, log);
    for (const p of parts) {
      sections.push({
        book: p.book,
        articleId: p.articleId,
        article: p.article,
        section: p.section,
        segmentation: p.anchored ? "anchor" : "auto",
        text: p.text,
      });
      debug.push(`⟦${p.articleId} §${p.section}${p.anchored ? " A" : ""}⟧ ${p.text}`);
    }
  }
  if (process.env.DEBUG_STREAM) await writeFile(process.env.DEBUG_STREAM, debug.join("\n"), "utf8");

  // Kapitelzahlen der Hs. am Abschnittsanfang/-ende entfernen („XX. Nimpt …“, „… tud. V.“)
  const LEAD = /^(?:[IVX][IVXLUTYF1ln]{0,7}[.,»]|[IVX][IVXLUTYF1]{1,7}|XL|IL)\s+(?=["„]?[A-ZÄÖÜa-zäöü])/;
  const TRAIL = /\s+(?:[IVX][IVXLUTYF1ln]{0,7}[.,»]?|[IVX][IVXLUTYF1]{1,7})\s*$/;
  for (const s of sections) {
    s.text = s.text.replace(LEAD, "").replace(TRAIL, "").trim();
  }

  // Gleiche Kennung mehrfach (Umstellung in der Hs. oder OCR-Fehler): anhängen, protokollieren.
  const merged = [];
  const seen = new Map();
  for (const s of sections) {
    const key = s.articleId + "#" + s.section;
    if (seen.has(key)) {
      log.push(`Doppelte Kennung ${s.articleId} §${s.section} → angehängt`);
      const t = seen.get(key);
      t.text += " ¶ " + s.text;
      if (s.segmentation === "auto") t.segmentation = "auto";
    } else {
      const c = { ...s };
      seen.set(key, c);
      merged.push(c);
    }
  }
  merged.sort((a, b) => {
    const ba = a.articleId === "lr-prolog" ? -1 : BOOK_ORDER.indexOf(a.book);
    const bb = b.articleId === "lr-prolog" ? -1 : BOOK_ORDER.indexOf(b.book);
    return ba - bb || a.article - b.article || a.section - b.section;
  });

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(
    OUT,
    JSON.stringify(
      {
        edition:
          "August Lübben (Hg.): Der Sachsenspiegel, Landrecht und Lehnrecht, nach dem Oldenburger Codex picturatus von 1336. Oldenburg 1879",
        sourceUrl: "https://archive.org/details/dersachsenspiege00lbbe",
        generatedAt: new Date().toISOString(),
        note: "Automatisch aus OCR erzeugt; OCR-Fehler möglich. segmentation=anchor: Gliederung manuell über Anker geprüft.",
        sections: merged,
      },
      null,
      1
    ),
    "utf8"
  );
  const byBook = {};
  for (const s of merged) (byBook[s.book] ??= new Set()).add(s.articleId);
  console.log("Abschnitte:", merged.length);
  for (const [b, set] of Object.entries(byBook)) console.log(b, "Artikel:", set.size);
  console.log("\nProtokoll (" + log.length + "):\n" + log.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
