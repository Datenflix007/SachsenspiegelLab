// Annotationen: Speicherung im localStorage, Export/Import mit Validierung.
//
// Annotation:
// {
//   id: string,
//   target: {
//     type: "section" | "article" | "page",
//     articleId?: string, sectionId?: string,
//     pageNumber?: number, canvasId?: string,
//     region?: { x, y, w, h }   // Anteile 0..1 der Bildbreite/-höhe
//   },
//   text: string, tags: string[], createdAt: ISO, updatedAt: ISO
// }

import { storage, uid } from "../util.js";

export const SCHEMA_VERSION = 1;
const KEY = "ssl.annotations.v1";
const TARGET_TYPES = new Set(["section", "article", "page"]);
const listeners = new Set();

let items = load();

function load() {
  const v = storage.get(KEY, []);
  return Array.isArray(v) ? v.filter((a) => validateAnnotation(a).ok) : [];
}
function persist() {
  const ok = storage.set(KEY, items);
  listeners.forEach((fn) => fn(items));
  return ok;
}

export const onChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const all = () => items.slice();
export const count = () => items.length;

export function forSection(sectionId) {
  return items.filter((a) => a.target.type === "section" && a.target.sectionId === sectionId).sort(byCreated);
}
export function forArticle(articleId) {
  return items.filter((a) => a.target.articleId === articleId).sort(byCreated);
}
export function forArticleOnly(articleId) {
  return items.filter((a) => a.target.type === "article" && a.target.articleId === articleId).sort(byCreated);
}
export function forPage(pageNumber) {
  return items.filter((a) => a.target.pageNumber === pageNumber).sort(byCreated);
}
const byCreated = (a, b) => String(a.createdAt).localeCompare(String(b.createdAt));

export function add({ target, text, tags = [] }) {
  const now = new Date().toISOString();
  const a = { id: uid("note"), target: cleanTarget(target), text: String(text).trim(), tags: cleanTags(tags), createdAt: now, updatedAt: now };
  const v = validateAnnotation(a);
  if (!v.ok) throw new Error(v.error);
  items.push(a);
  const saved = persist();
  return { annotation: a, saved };
}

export function update(id, patch) {
  const i = items.findIndex((a) => a.id === id);
  if (i < 0) return null;
  const next = { ...items[i], ...patch, tags: patch.tags ? cleanTags(patch.tags) : items[i].tags, updatedAt: new Date().toISOString() };
  if (patch.text != null) next.text = String(patch.text).trim();
  const v = validateAnnotation(next);
  if (!v.ok) throw new Error(v.error);
  items[i] = next;
  persist();
  return next;
}

export function remove(id) {
  items = items.filter((a) => a.id !== id);
  persist();
}

export function clearAll() {
  items = [];
  persist();
}

export const parseTags = (s) => cleanTags(String(s || "").split(/[,;#]/));
function cleanTags(tags) {
  return [...new Set((tags || []).map((t) => String(t).trim().replace(/\s+/g, " ")).filter(Boolean))].slice(0, 20);
}
function cleanTarget(t) {
  const out = { type: t.type };
  for (const k of ["articleId", "sectionId", "canvasId"]) if (t[k]) out[k] = String(t[k]);
  if (t.pageNumber != null) out.pageNumber = Number(t.pageNumber);
  if (t.region) out.region = roundRegion(t.region);
  return out;
}
const roundRegion = (r) => Object.fromEntries(["x", "y", "w", "h"].map((k) => [k, Math.round(Number(r[k]) * 10000) / 10000]));

// ---------- Validierung ----------
export function validateAnnotation(a) {
  const fail = (error) => ({ ok: false, error });
  if (!a || typeof a !== "object") return fail("Eintrag ist kein Objekt");
  if (typeof a.id !== "string" || !a.id || a.id.length > 100) return fail("ungültige id");
  if (typeof a.text !== "string" || a.text.length > 20000) return fail(`${a.id}: text fehlt oder zu lang`);
  if (!a.text.trim() && !a.target?.region) return fail(`${a.id}: leerer Text`);
  if (!Array.isArray(a.tags) || a.tags.some((t) => typeof t !== "string")) return fail(`${a.id}: tags müssen Zeichenketten sein`);
  const t = a.target;
  if (!t || !TARGET_TYPES.has(t.type)) return fail(`${a.id}: target.type ungültig`);
  if (t.type === "section" && (!t.sectionId || !t.articleId)) return fail(`${a.id}: section braucht sectionId und articleId`);
  if (t.type === "article" && !t.articleId) return fail(`${a.id}: article braucht articleId`);
  if (t.type === "page" && !(Number.isInteger(t.pageNumber) && t.pageNumber >= 1 && t.pageNumber <= 196)) return fail(`${a.id}: pageNumber 1–196 erwartet`);
  if (t.region) {
    const r = t.region;
    const nums = ["x", "y", "w", "h"].map((k) => r[k]);
    if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1)) return fail(`${a.id}: region-Werte müssen zwischen 0 und 1 liegen`);
    if (r.x + r.w > 1.0001 || r.y + r.h > 1.0001) return fail(`${a.id}: region ragt über das Bild hinaus`);
  }
  for (const k of ["createdAt", "updatedAt"]) if (a[k] && Number.isNaN(Date.parse(a[k]))) return fail(`${a.id}: ${k} ist kein Datum`);
  return { ok: true };
}

// ---------- Export / Import ----------
export function exportJson() {
  return JSON.stringify(
    {
      schemaVersion: SCHEMA_VERSION,
      app: "SachsenspiegelLab",
      scope: "Sachsenspiegel (Landrecht I–III, Lehnrecht) und Dresdner Bilderhandschrift",
      exportedAt: new Date().toISOString(),
      count: items.length,
      annotations: items,
    },
    null,
    2
  );
}

/** Prüft eine Importdatei. Liefert {ok, annotations, errors}. */
export function parseImport(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: ["Keine gültige JSON-Datei: " + e.message] };
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { ok: false, errors: ["Erwartet wird ein Objekt mit schemaVersion und annotations."] };
  if (typeof doc.schemaVersion !== "number") return { ok: false, errors: ["schemaVersion fehlt."] };
  if (doc.schemaVersion > SCHEMA_VERSION) return { ok: false, errors: [`schemaVersion ${doc.schemaVersion} ist neuer als unterstützt (${SCHEMA_VERSION}).`] };
  if (!Array.isArray(doc.annotations)) return { ok: false, errors: ["annotations muss eine Liste sein."] };
  const errors = [];
  const valid = [];
  const seen = new Set();
  for (const a of doc.annotations) {
    const v = validateAnnotation(a);
    if (!v.ok) errors.push(v.error);
    else if (seen.has(a.id)) errors.push(`${a.id}: doppelte id`);
    else {
      seen.add(a.id);
      valid.push({ ...a, target: cleanTarget(a.target), tags: cleanTags(a.tags), createdAt: a.createdAt || new Date().toISOString(), updatedAt: a.updatedAt || a.createdAt || new Date().toISOString() });
    }
  }
  return { ok: valid.length > 0 || doc.annotations.length === 0, annotations: valid, errors, total: doc.annotations.length, exportedAt: doc.exportedAt };
}

/** mode: "merge" (neuere Fassung gewinnt) oder "replace". */
export function applyImport(annotations, mode) {
  if (mode === "replace") {
    items = annotations.slice();
  } else {
    const byId = new Map(items.map((a) => [a.id, a]));
    for (const a of annotations) {
      const cur = byId.get(a.id);
      if (!cur || String(a.updatedAt) > String(cur.updatedAt)) byId.set(a.id, a);
    }
    items = [...byId.values()];
  }
  persist();
  return items.length;
}
