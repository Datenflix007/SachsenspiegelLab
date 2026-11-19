// Kleine Hilfsfunktionen ohne Abhängigkeiten.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

/** Tagged template: setzt Werte HTML-escaped ein; raw(...) markiert vertrauenswürdiges HTML. */
const RAW = Symbol("raw");
export const raw = (html) => ({ [RAW]: true, html: String(html ?? "") });
export function html(strings, ...values) {
  let out = "";
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += render(values[i]);
  });
  return raw(out);
}
function render(v) {
  if (v == null || v === false) return "";
  if (Array.isArray(v)) return v.map(render).join("");
  if (typeof v === "object" && v[RAW]) return v.html;
  return esc(v);
}
export const toHtml = (v) => render(v);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/** localStorage nur über try/catch – privat-Modus, gesperrte Speicher etc. */
export const storage = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = document.querySelector("[data-toast]");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

export const STATUS_LABEL = { verified: "geprüft", draft: "Entwurf", missing: "fehlt" };
export const statusBadge = (status) =>
  html`<span class="badge badge--${status}" title="Status: ${STATUS_LABEL[status] || status}">${STATUS_LABEL[status] || status}</span>`;

export const MISSING_TEXT = "Für diese Stelle liegt noch keine projektgepflegte Transkription vor.";

export function uid(prefix = "n") {
  const r = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID().slice(0, 13) : Math.random().toString(36).slice(2, 15);
  return `${prefix}-${Date.now().toString(36)}-${r}`;
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/** Datei herunterladen (Export). */
export function download(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

/** Zahlenfolgen kompakt: [1,2,3,5] → "1–3, 5" */
export function compactRanges(nums) {
  const s = [...new Set(nums)].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? `${s[i]}` : `${s[i]}–${s[j]}`);
    i = j;
  }
  return out.join(", ");
}
