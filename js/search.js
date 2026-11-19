// Volltextsuche über echte Texte (Original, Übertragung) und Metadaten
// (Titel, Kernpunkte, Schlagworte, Synonyme). Modi: Text, Regex.
// Optionen: Synonymgruppen, Schreibvarianten-Toleranz, ganze Wörter.

import * as store from "./annotations/store.js";

export const FIELD_LABEL = {
  plainText: "Originaltext",
  translation: "Übertragung",
  title: "Titel",
  keyPoints: "Kernpunkte",
  keywords: "Schlagworte",
  synonyms: "Synonyme",
  note: "Eigene Notiz",
};

const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Schreibvarianten (Mittelniederdeutsch/Mitteldeutsch ↔ heutige Schreibung)
const VARIANT = {
  a: "[aäâ]", ä: "[aäe]", e: "[eëê]", i: "[ijyî]", j: "[ijy]", y: "[ijy]", o: "[oöô]", ö: "[oöe]",
  u: "[uvwüû]", v: "[uvwf]", w: "[uvw]", ü: "[uvwü]", f: "[fv]",
  c: "(?:ch|ck|c|k)", k: "(?:ch|ck|c|k)", z: "(?:tz|z|c|s)", g: "(?:gh|g)", t: "(?:th|dt|t|d)", d: "[dt]", s: "(?:ss|s|z)", ß: "(?:ss|ß|s)",
};
function variantPattern(word) {
  let out = "";
  const w = word.toLowerCase();
  for (let i = 0; i < w.length; i++) {
    const ch = w[i];
    // h nach c/g/t gehört zum Digraphen (ch, gh, th) – dort schon abgedeckt
    if (ch === "h" && /[cgt]/.test(w[i - 1] || "")) continue;
    if (VARIANT[ch]) out += `${VARIANT[ch]}+`;
    else if (/\s/.test(ch)) out += "\\s+";
    else out += reEscape(ch);
  }
  return out;
}

/**
 * Baut aus der Eingabe einen globalen RegExp.
 * @returns {{regex: RegExp|null, error: string|null, terms: string[]}}
 */
export function makeMatcher({ q, mode = "text", synonyms = true, variants = false, wholeWord = false }, synonymGroups = []) {
  const query = String(q || "").trim();
  if (!query) return { regex: null, error: null, terms: [] };
  if (mode === "regex") {
    try {
      const regex = new RegExp(query, "giu");
      if (regex.test("")) return { regex: null, error: "Der Ausdruck passt auch auf leeren Text – bitte enger fassen.", terms: [query] };
      return { regex, error: null, terms: [query] };
    } catch (e) {
      return { regex: null, error: "Ungültiger regulärer Ausdruck: " + e.message, terms: [query] };
    }
  }
  let terms = [query];
  if (synonyms) {
    const low = query.toLowerCase();
    for (const g of synonymGroups) if (g.includes(low)) terms.push(...g);
    terms = [...new Set(terms.map((t) => t.toLowerCase()))];
  }
  const parts = terms.map((t) => (variants ? variantPattern(t) : reEscape(t).replace(/\s+/g, "\\s+")));
  let src = parts.length > 1 ? `(?:${parts.join("|")})` : parts[0];
  if (wholeWord) src = `(?<![\\p{L}\\p{N}])${src}(?![\\p{L}\\p{N}])`;
  try {
    return { regex: new RegExp(src, "giu"), error: null, terms };
  } catch (e) {
    return { regex: null, error: e.message, terms };
  }
}

/** Erstellt den Suchindex einmalig. */
export function buildIndex(data) {
  const docs = [];
  for (const t of data.transcriptions) {
    if (t.plainText) docs.push({ kind: "section", articleId: t.articleId, section: t.section, sectionId: t.sectionId, field: "plainText", text: t.plainText });
    if (t.translation) docs.push({ kind: "section", articleId: t.articleId, section: t.section, sectionId: t.sectionId, field: "translation", text: t.translation });
  }
  for (const a of data.articles) {
    if (a.title && a.status !== "missing") docs.push({ kind: "meta", articleId: a.id, field: "title", text: a.title });
    if (a.keyPoints.length) docs.push({ kind: "meta", articleId: a.id, field: "keyPoints", text: a.keyPoints.join(" · ") });
    if (a.keywords.length) docs.push({ kind: "meta", articleId: a.id, field: "keywords", text: a.keywords.join(" · ") });
    if (a.synonyms.length) docs.push({ kind: "meta", articleId: a.id, field: "synonyms", text: a.synonyms.join(" · ") });
  }
  return docs;
}

const FIELD_GROUPS = {
  all: null,
  plainText: ["plainText"],
  translation: ["translation"],
  meta: ["title", "keyPoints", "keywords", "synonyms"],
};

/**
 * @returns {{results: object[], total: number, error: string|null}}
 */
export function search(data, index, opts) {
  const { regex, error } = makeMatcher(opts, data.synonymGroups);
  if (!regex) return { results: [], total: 0, error };
  const fields = FIELD_GROUPS[opts.field || "all"];
  let docs = index;
  if (opts.includeNotes) {
    docs = docs.concat(
      store.all().map((n) => ({ kind: "note", articleId: n.target.articleId || null, section: n.target.sectionId ? Number(n.target.sectionId.split("-s").pop()) : null, pageNumber: n.target.pageNumber, field: "note", text: `${n.text} ${n.tags.map((t) => "#" + t).join(" ")}` }))
    );
  }
  const results = [];
  for (const d of docs) {
    if (fields && d.kind !== "note" && !fields.includes(d.field)) continue;
    if (opts.book && opts.book !== "all") {
      const a = d.articleId ? data.articleById.get(d.articleId) : null;
      if (!a || (opts.book === "lr-i" ? !(a.book === "lr-i") : a.book !== opts.book)) continue;
    }
    regex.lastIndex = 0;
    const ranges = [];
    let m;
    let guard = 0;
    while ((m = regex.exec(d.text)) && guard++ < 500) {
      if (!m[0].length) {
        regex.lastIndex++;
        continue;
      }
      ranges.push([m.index, m.index + m[0].length]);
    }
    if (ranges.length) results.push({ ...d, ranges, count: ranges.length });
  }
  results.sort((a, b) => {
    const ia = a.articleId ? data.articleIndex.get(a.articleId) ?? 1e9 : 1e9;
    const ib = b.articleId ? data.articleIndex.get(b.articleId) ?? 1e9 : 1e9;
    return ia - ib || (a.section ?? 0) - (b.section ?? 0) || order(a.field) - order(b.field);
  });
  return { results, total: results.reduce((n, r) => n + r.count, 0), error: null };
}
const ORDER = ["title", "keyPoints", "keywords", "synonyms", "plainText", "translation", "note"];
const order = (f) => ORDER.indexOf(f);

/** Kontextausschnitt mit Hervorhebung (HTML). */
export function snippet(text, ranges, esc, radius = 90) {
  const [s0] = ranges[0];
  let start = Math.max(0, s0 - radius);
  let end = Math.min(text.length, ranges[0][1] + radius * 1.6);
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  if (end < text.length) end = text.lastIndexOf(" ", end) > start ? text.lastIndexOf(" ", end) : end;
  let out = start > 0 ? "… " : "";
  let pos = start;
  for (const [a, b] of ranges) {
    if (b <= start || a >= end) continue;
    out += esc(text.slice(pos, Math.max(pos, a))) + `<mark>${esc(text.slice(Math.max(a, pos), Math.min(b, end)))}</mark>`;
    pos = Math.min(b, end);
  }
  out += esc(text.slice(pos, end)) + (end < text.length ? " …" : "");
  return out;
}

/** Hervorhebung eines ganzen Textes (für die Artikelansicht). */
export function highlightAll(text, regex, esc) {
  if (!regex) return esc(text);
  regex.lastIndex = 0;
  let out = "";
  let pos = 0;
  let m;
  let guard = 0;
  while ((m = regex.exec(text)) && guard++ < 500) {
    if (!m[0].length) {
      regex.lastIndex++;
      continue;
    }
    out += esc(text.slice(pos, m.index)) + `<mark class="hit">${esc(m[0])}</mark>`;
    pos = m.index + m[0].length;
  }
  return out + esc(text.slice(pos));
}
