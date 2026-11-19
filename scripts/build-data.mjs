#!/usr/bin/env node
/**
 * build-data.mjs
 *
 * Führt die Quellen zusammen und erzeugt die Daten, die die App lädt:
 *   data/articles.json        – alle Artikel des Sachsenspiegels (Prolog, LR I–III, Lehnrecht)
 *   data/transcriptions.json  – je § Originaltext, Übertragung, Status, Seite
 *
 * Eingaben:
 *   data/source/luebben-sections.json  (scripts/import-luebben.mjs)
 *   data/source/corrections.json       (OCR-Korrekturen)
 *   data/source/page-map.json          (geprüfte Seiten, Buchgrenzen)
 *   data/content/*.json                (Titel, Kernpunkte, Bedeutung, Übertragungen)
 *   data/manuscript-pages.json         (scripts/build-page-index.mjs)
 *   data/transcriptions.json (vorhanden) – Einträge mit status "verified" werden NIE überschrieben.
 *
 * Aufruf: node scripts/build-data.mjs
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const p = (...x) => resolve(ROOT, ...x);
const readJson = async (f, fallback) => {
  try {
    return JSON.parse(await readFile(p(f), "utf8"));
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
};

// Bücher mit Artikelzahl nach Homeyer
const BOOKS = [
  { id: "lr-i", label: "Landrecht I", short: "LR I", part: "landrecht", count: 71, released: true },
  { id: "lr-ii", label: "Landrecht II", short: "LR II", part: "landrecht", count: 72, released: false },
  { id: "lr-iii", label: "Landrecht III", short: "LR III", part: "landrecht", count: 91, released: false },
  { id: "lehnrecht", label: "Lehnrecht", short: "Lehnrecht", part: "lehnrecht", count: 80, released: false },
];

const SOURCE_NOTE =
  "Text nach der Edition: August Lübben (Hg.), Der Sachsenspiegel, Landrecht und Lehnrecht, nach dem Oldenburger Codex picturatus von 1336, Oldenburg 1879 (gemeinfrei; Digitalisat archive.org/details/dersachsenspiege00lbbe). OCR, automatisch bereinigt. Es handelt sich um die Edition einer anderen Handschrift derselben Bilderhandschriften-Gruppe (mittelniederdeutsch), nicht um eine Lesung der Dresdner Bilderhandschrift.";

async function main() {
  const luebben = await readJson("data/source/luebben-sections.json");
  const corrections = (await readJson("data/source/corrections.json", { sections: {} })).sections;
  const pageMap = await readJson("data/source/page-map.json");
  const manuscript = await readJson("data/manuscript-pages.json");
  const previous = await readJson("data/transcriptions.json", { transcriptions: [] });
  const keepVerified = new Map(
    (previous.transcriptions || []).filter((t) => t.status === "verified").map((t) => [t.sectionId, t])
  );

  // Inhalte (Titel, Kernpunkte, Übertragungen)
  const content = {};
  for (const f of (await readdir(p("data/content"))).filter((f) => f.endsWith(".json")).sort()) {
    Object.assign(content, (await readJson(`data/content/${f}`)).articles);
  }

  const pageByNumber = new Map(manuscript.pages.map((pg) => [pg.pageNumber, pg]));
  const pageRef = (n, extra = {}) => {
    const pg = pageByNumber.get(n);
    return { pageNumber: n, canvasId: pg?.canvasId ?? null, label: pg?.label ?? null, ...extra };
  };

  // --- Abschnitte aus der Edition, nur freigegebene Bücher ---
  const released = new Set(BOOKS.filter((b) => b.released).map((b) => b.id));
  const sections = luebben.sections.filter(
    (s) => s.segmentation === "anchor" && (released.has(s.book) || s.articleId === "lr-prolog")
  );

  // Korrekturen anwenden
  const log = [];
  for (const s of sections) {
    const c = corrections[`${s.articleId}#${s.section}`];
    s.ocr = "raw";
    if (!c) continue;
    for (const [a, b] of c.replace) {
      if (!s.text.includes(a)) log.push(`Korrektur nicht anwendbar: ${s.articleId} §${s.section} „${a}“`);
      s.text = s.text.split(a).join(b);
    }
    s.ocr = c.level === "ocr" ? "corrected" : "cleaned";
  }

  // --- Seitenschätzung nach Textmenge innerhalb der Buchgrenzen ---
  const estimates = new Map();
  for (const book of BOOKS) {
    const bounds = pageMap.books[book.id];
    const list = sections.filter((s) => s.book === book.id && s.articleId !== "lr-prolog");
    const total = list.reduce((n, s) => n + s.text.length, 0);
    if (!total) continue;
    const span = bounds.lastPage - bounds.firstPage + 0.6;
    let acc = 0;
    for (const s of list) {
      const start = bounds.firstPage + Math.floor((acc / total) * span);
      acc += s.text.length;
      const end = bounds.firstPage + Math.floor(((acc - 1) / total) * span);
      const pages = [];
      for (let n = start; n <= Math.min(end, bounds.lastPage); n++) pages.push(n);
      estimates.set(`${s.articleId}#${s.section}`, pages);
    }
  }

  // --- Transkriptionen ---
  const transcriptions = [];
  const sectionsByArticle = new Map();
  for (const s of sections) {
    const key = `${s.articleId}#${s.section}`;
    const sectionId = `${s.articleId}-s${s.section}`;
    if (keepVerified.has(sectionId)) {
      transcriptions.push(keepVerified.get(sectionId));
      continue;
    }
    const manual = pageMap.sections[key];
    const pages = manual ? manual.pages : estimates.get(key) || [];
    const translation = content[s.articleId]?.sections?.[String(s.section)] ?? "";
    if (!translation) log.push(`Keine Übertragung: ${key}`);
    const first = pageByNumber.get(pages[0]);
    const t = {
      articleId: s.articleId,
      sectionId,
      section: s.section,
      pageNumber: pages[0] ?? null,
      pages,
      canvasId: first?.canvasId ?? null,
      pageMapping: manual ? manual.checkedBy : "estimate-text-length",
      plainText: s.text,
      translation,
      status: "draft",
      basis: "edition",
      edition: "Lübben 1879",
      ocr: s.ocr,
      sourceNote: SOURCE_NOTE,
      textRegions: [],
    };
    transcriptions.push(t);
    if (!sectionsByArticle.has(s.articleId)) sectionsByArticle.set(s.articleId, []);
    sectionsByArticle.get(s.articleId).push(t);
  }

  // --- Artikel ---
  const articles = [];
  const mkArticle = (id, book, num) => {
    const c = content[id] || {};
    const secs = sectionsByArticle.get(id) || [];
    const pageNums = [...new Set(secs.flatMap((t) => t.pages))].sort((a, b) => a - b);
    const checked = secs.length && secs.every((t) => t.pageMapping !== "estimate-text-length");
    const statuses = secs.map((t) => t.status);
    const status = !secs.length ? "missing" : statuses.every((s) => s === "verified") ? "verified" : "draft";
    return {
      id,
      book: book.id,
      bookLabel: book.label,
      part: book.part,
      article: num,
      label: num === 0 ? "Vorrede" : `${book.short} ${num}`,
      title: c.title || null,
      metaStatus: c.metaStatus || (c.title ? "draft" : "missing"),
      keyPoints: c.keyPoints || [],
      significance: c.significance || "",
      keywords: c.keywords || [],
      synonyms: c.synonyms || [],
      note: c.note || null,
      status,
      sectionCount: secs.length,
      pages: pageNums.map((n) =>
        pageRef(n, {
          mappingStatus: "unverified",
          method: checked ? secs[0].pageMapping : "estimate-text-length",
        })
      ),
    };
  };
  articles.push(mkArticle("lr-prolog", BOOKS[0], 0));
  for (const book of BOOKS) {
    for (let n = 1; n <= book.count; n++) articles.push(mkArticle(`${book.id}-${n}`, book, n));
  }

  const counts = { verified: 0, draft: 0, missing: 0 };
  for (const a of articles) counts[a.status]++;

  await writeFile(
    p("data/articles.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        books: BOOKS.map(({ id, label, short, part, count, released }) => ({ id, label, short, part, count, released })),
        counts,
        articles,
      },
      null,
      1
    ),
    "utf8"
  );
  await writeFile(
    p("data/transcriptions.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), transcriptions }, null, 1),
    "utf8"
  );
  console.log(`Artikel: ${articles.length} – verified ${counts.verified}, draft ${counts.draft}, missing ${counts.missing}`);
  console.log(`Abschnitte: ${transcriptions.length}`);
  if (log.length) console.log("\nHinweise:\n" + log.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
