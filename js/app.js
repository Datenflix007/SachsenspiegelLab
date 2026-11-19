// SachsenspiegelLab – Einstieg, Hash-Router, gemeinsame Dienste.
//
// Routen:
//   #home                         Startseite (Themen + Gesamtverzeichnis)
//   #theme/<id>                   gefilterte Artikelliste eines Themenfelds
//   #article/<id>?s=<§>&page=<n>  Lese-Ansicht, optional mit Handschriften-Panel
//   #manuscript                   Galerie aller Seiten
//   #page/<n>                     Viewer einer Seite
//   #search?q=…&mode=regex        Volltextsuche
//   #context[/<schaubild>]        Schaubilder
//   #notes                        eigene Annotationen, Export/Import

import { loadData } from "./data.js";
import { buildIndex } from "./search.js";
import * as store from "./annotations/store.js";
import { bindNotes, setLabelResolver } from "./components/notes.js";
import { bindEditors, editorHtml, readEditor } from "./components/editor.js";
import { html, toHtml, esc, $, $$, storage } from "./util.js";
import { renderHome, renderTheme } from "./views/home.js";
import { renderArticle } from "./views/article.js";
import { renderGallery, renderPage, resolvePage } from "./views/manuscript.js";
import { renderSearch } from "./views/search.js";
import { renderContext } from "./views/context.js";
import { renderNotes } from "./views/notes.js";

const main = document.getElementById("main");
let cleanup = null;
let ctx = null;

function parseHash() {
  const h = location.hash.replace(/^#/, "") || "home";
  const qi = h.indexOf("?");
  const path = qi < 0 ? h : h.slice(0, qi);
  const query = qi < 0 ? "" : h.slice(qi + 1);
  const parts = path.split("/").filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  return { parts, params: new URLSearchParams(query) };
}

function route() {
  const { parts, params } = parseHash();
  const [name, arg] = parts;
  ctx.params = params;
  switch (name) {
    case "home":
      return { view: { html: renderHome(ctx), title: null }, nav: "home" };
    case "theme":
      return { view: { html: renderTheme(ctx, arg), title: "Themenfeld" }, nav: "home" };
    case "article":
      return { view: renderArticle(ctx, arg || storage.get("ssl.lastArticle", "lr-i-1") || "lr-i-1", params), nav: "article" };
    case "manuscript":
      return { view: renderGallery(ctx), nav: "manuscript" };
    case "page": {
      const n = resolvePage(ctx.data, arg) || Number(arg);
      return { view: renderPage(ctx, n), nav: "manuscript" };
    }
    case "search":
      return { view: renderSearch(ctx), nav: "search" };
    case "context":
      return { view: renderContext(ctx, arg), nav: "context" };
    case "notes":
      return { view: renderNotes(ctx), nav: "notes" };
    default:
      // Kurzformen: #lr-i-2  → Artikel
      if (ctx.data.articleById.has(name)) {
        location.replace(`#article/${name}`);
        return null;
      }
      return { view: { html: html`<div class="page"><p class="notice">Unbekannte Adresse. <a href="#home">Zur Übersicht</a></p></div>` }, nav: null };
  }
}

function render() {
  const r = route();
  if (!r) return;
  try {
    cleanup?.();
  } catch {}
  cleanup = null;
  main.innerHTML = toHtml(r.view.html);
  document.title = r.view.title ? `${r.view.title} · SachsenspiegelLab` : "SachsenspiegelLab – Der Sachsenspiegel Artikel für Artikel";
  $$(".app-nav a").forEach((a) => {
    if (a.dataset.nav === r.nav) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  if (r.nav === "article") {
    const id = parseHash().parts[1];
    if (id) $('.app-nav a[data-nav="article"]').href = `#article/${id}`;
    storage.set("ssl.lastArticle", id);
  }
  if (r.nav !== "search") $("#quickSearch").value = "";
  cleanup = r.view.mount?.(main) || null;
  // Fokus für Screenreader-Nutzer auf den Inhalt setzen (ohne zu scrollen)
  main.focus({ preventScroll: true });
}

/** Einfacher Formulardialog. Liefert Promise<{...}|null>. */
function formDialog({ title, intro = "", details = [], fields = [], submitLabel = "OK", cancel = true }) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "modal";
    d.innerHTML = toHtml(html`<form method="dialog">
      <h2>${title}</h2>
      ${intro ? html`<p style="white-space:pre-line;color:var(--text-2)">${intro}</p>` : ""}
      ${details.length ? html`<ul class="meta-source">${details.map((x) => html`<li>${x}</li>`)}</ul>` : ""}
      ${fields.map((f) =>
        f.type === "radio"
          ? html`<fieldset style="border:0;padding:0;margin:10px 0;display:grid;gap:6px"><legend class="eyebrow">${f.label}</legend>${f.options.map(([v, l]) => html`<label style="display:flex;gap:8px;align-items:flex-start"><input type="radio" name="${f.name}" value="${v}" ${f.value === v ? html`checked` : ""} /> <span>${l}</span></label>`)}</fieldset>`
          : f.type === "editor"
          ? html`<div style="display:grid;gap:4px;margin:10px 0"><span class="eyebrow">${f.label}</span>${editorHtml(f.name, f.value || "")}</div>`
          : f.type === "color"
          ? html`<label style="display:flex;gap:8px;align-items:center;margin:10px 0"><span class="eyebrow">${f.label}</span><input type="color" name="${f.name}" value="${f.value || "#fbbf24"}" /></label>`
          : f.type === "textarea"
          ? html`<label style="display:grid;gap:4px;margin:10px 0"><span class="eyebrow">${f.label}</span><textarea class="field" name="${f.name}" rows="3" ${f.required ? html`required` : ""}></textarea></label>`
          : html`<label style="display:grid;gap:4px;margin:10px 0"><span class="eyebrow">${f.label}</span><input class="field" name="${f.name}" type="text" value="${f.value || ""}" ${f.required ? html`required` : ""} /></label>`
      )}
      <div class="row">
        ${cancel ? html`<button type="button" class="btn btn--ghost" value="cancel" data-cancel>Abbrechen</button>` : ""}
        <button type="submit" class="btn btn--primary" value="ok">${submitLabel}</button>
      </div>
    </form>`);
    document.body.append(d);
    const form = d.querySelector("form");
    let result = null;
    form.addEventListener("submit", (e) => {
      if (!form.checkValidity()) return;
      e.preventDefault();
      result = Object.fromEntries(new FormData(form).entries());
      const ed = form.querySelector("[data-editor]");
      if (ed) Object.assign(result, readEditor(ed));
      d.close();
    });
    d.querySelector("[data-cancel]")?.addEventListener("click", () => d.close());
    d.addEventListener("close", () => {
      d.remove();
      resolve(result);
    });
    d.showModal();
    (d.querySelector(".ed-area") || d.querySelector("textarea, input:not([type=radio])"))?.focus();
  });
}

function initTheme() {
  const btn = document.querySelector("[data-theme-toggle]");
  const setLabel = () => {
    const dark = document.documentElement.dataset.theme !== "light";
    btn.setAttribute("aria-label", dark ? "Helles Pergament-Design aktivieren" : "Dunkles Design aktivieren");
    btn.title = dark ? "Pergament (hell)" : "Dunkel";
  };
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("ssl.theme", next);
    } catch {}
    setLabel();
  });
  setLabel();
}

function initQuickSearch() {
  const form = document.querySelector("[data-quick-search]");
  const input = $("#quickSearch");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    location.hash = q ? `#search?q=${encodeURIComponent(q)}` : "#search";
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select, [contenteditable]") || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "/") {
      e.preventDefault();
      input.focus();
    }
    // [ und ] : vorheriger / nächster Artikel
    if ((e.key === "[" || e.key === "]") && parseHash().parts[0] === "article") {
      const link = document.querySelector(e.key === "[" ? ".art-pager a.prev" : ".art-pager a.next");
      if (link) location.hash = link.getAttribute("href");
    }
  });
}

async function start() {
  initTheme();
  initQuickSearch();
  try {
    const data = await loadData();
    ctx = { data, index: buildIndex(data), store, formDialog, params: new URLSearchParams() };
    setLabelResolver((id) => data.articleById.get(id)?.label || id);
    bindNotes(document);
    bindEditors(document);
    window.addEventListener("hashchange", render);
    render();
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="page"><p class="notice notice--warn" role="alert">Die Daten konnten nicht geladen werden (${esc(err.message)}). Bitte die Seite über einen Webserver öffnen, nicht als Datei.</p></div>`;
  }
}

start();
