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
  { id: "lr-ii", label: "Landrecht II", short: "LR II", part: "landrecht", count: 72, released: true },
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

  // --- Abschnitte aus der Edition ---
  const released = new Set(BOOKS.filter((b) => b.released).map((b) => b.id));
  const allSections = luebben.sections.map((s) => ({ ...s, text: s.text.replace(/\s*¶\s*/g, " ") }));
  const sections = allSections.filter(
    (s) => s.segmentation === "anchor" && (released.has(s.book) || s.articleId === "lr-prolog")
  );

  // Korrekturen anwenden (auf alle, damit die Zeilen-Zuordnung mit dem Endtext rechnet)
  const log = [];
  for (const s of allSections) {
    const c = corrections[`${s.articleId}#${s.section}`];
    s.ocr = "raw";
    if (!c) continue;
    for (const [a, b] of c.replace) {
      if (!s.text.includes(a) && s.segmentation === "anchor") log.push(`Korrektur nicht anwendbar: ${s.articleId} §${s.section} „${a}“`);
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

  // --- Zeilen-Zuordnung (Text → erkannte Zeilen der Dresdner Hs.) ---
  // Je Teil (Landrecht, Lehnrecht) eine durchgehende Zeilenfolge über die Seiten; der Text wird
  // stückweise linear nach Zeichenzahl verteilt, zwischen Ankerpunkten aus page-map.json (lineAnchors).
  const lineRegions = await readJson("data/line-regions.json", { pages: {} });
  const textLayout = new Map(); // key → [{pageNumber, line, from, to}]
  const PARTS = [
    { books: ["lr-i", "lr-ii", "lr-iii"], from: 14, to: 119 },
    { books: ["lehnrecht"], from: 121, to: 191 },
  ];
  for (const part of PARTS) {
    const lines = [];
    const pageStart = new Map();
    for (let n = part.from; n <= part.to; n++) {
      pageStart.set(n, lines.length);
      (lineRegions.pages[String(n)]?.lines || []).forEach((_, i) => lines.push({ page: n, line: i }));
    }
    if (!lines.length) continue;
    const stream = allSections.filter((s) => part.books.includes(s.book) && s.article > 0 || (part.books.includes("lr-i") && s.articleId === "lr-prolog"));
    const pos = new Map();
    let c = 0;
    for (const s of stream) {
      pos.set(`${s.articleId}#${s.section}`, { c0: c, c1: c + s.text.length, s });
      c += s.text.length;
    }
    const total = c;
    const nLines = (p) => (lineRegions.pages[String(p)]?.lines || []).length;
    const pts = (pageMap.lineAnchors || [])
      .filter((a) => pos.has(a.key) && pageStart.has(a.page))
      .map((a) => ({ c: pos.get(a.key).c0, L: pageStart.get(a.page) + a.frac * nLines(a.page) }));
    if (!pts.some((p) => p.c === 0)) pts.push({ c: 0, L: 0 });
    pts.push({ c: total, L: lines.length });
    pts.sort((a, b) => a.c - b.c);
    const mono = pts.filter((p, i) => i === 0 || p.L >= pts[i - 1].L);
    const interp = (x, xs, ys) => {
      for (let i = 1; i < xs.length; i++) {
        if (x <= xs[i]) {
          const t = xs[i] === xs[i - 1] ? 0 : (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
          return ys[i - 1] + t * (ys[i] - ys[i - 1]);
        }
      }
      return ys[ys.length - 1];
    };
    const Cs = mono.map((p) => p.c);
    const Ls = mono.map((p) => p.L);
    const Lof = (x) => interp(x, Cs, Ls);
    const cOf = (L) => interp(L, Ls, Cs);
    for (const [key, { c0, c1, s }] of pos) {
      const L0 = Lof(c0);
      const L1 = Lof(c1);
      const text = s.text;
      // Trennstellen zwischen Zeilen, auf Wortgrenzen gerückt
      const cuts = [0];
      for (let k = Math.floor(L0) + 1; k < Math.ceil(L1); k++) {
        let at = Math.round(cOf(k) - c0);
        if (at <= cuts[cuts.length - 1] || at >= text.length) continue;
        const sp = text.indexOf(" ", at);
        const back = text.lastIndexOf(" ", at);
        at = sp >= 0 && (back < 0 || sp - at <= at - back) ? sp + 1 : back + 1;
        if (at > cuts[cuts.length - 1] && at < text.length) cuts.push(at);
      }
      cuts.push(text.length);
      const regs = [];
      let k = Math.floor(L0);
      for (let i = 0; i < cuts.length - 1 && k < lines.length; i++, k++) {
        regs.push({ pageNumber: lines[k].page, line: lines[k].line, from: cuts[i], to: cuts[i + 1] });
      }
      textLayout.set(key, regs);
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
    const layout = textLayout.get(key) || [];
    const layoutPages = [...new Set(layout.map((r) => r.pageNumber))];
    const pages = manual ? manual.pages : layoutPages.length ? layoutPages : estimates.get(key) || [];
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
      pageMapping: manual ? manual.checkedBy : layoutPages.length ? "estimate-lines" : "estimate-text-length",
      plainText: s.text,
      translation,
      status: "draft",
      basis: "edition",
      edition: "Lübben 1879",
      ocr: s.ocr,
      sourceNote: SOURCE_NOTE,
      // Zeilen der Dresdner Hs., auf die der Text (geschätzt) fällt; from/to = Zeichenbereich in plainText
      textRegions: layout,
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
