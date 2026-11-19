// Notiz-Blöcke (Annotationen) für §, Artikel oder Seite – mit Delegation.

import * as store from "../annotations/store.js";
import { html, raw, toHtml, esc, toast, formatDate } from "../util.js";
import { editorHtml, readEditor, sanitizeHtml } from "./editor.js";

const keyOf = (t) => [t.type, t.articleId || "", t.sectionId || "", t.pageNumber || ""].join("|");

function listFor(t) {
  if (t.type === "section") return store.forSection(t.sectionId);
  if (t.type === "article") return store.forArticleOnly(t.articleId);
  if (t.type === "page") return store.forPage(t.pageNumber).filter((a) => a.target.type === "page" && !a.target.region);
  return [];
}

export function noteItem(a, { showTarget = false, pageLink = true } = {}) {
  const r = a.target.region || a.target.shape;
  return html`<article class="note${r ? " note--region" : ""}" data-note-id="${a.id}" ${a.style ? html`style="border-left-color:${a.style.color}"` : ""}>
    ${a.html ? html`<div class="note__text note__html">${raw(sanitizeHtml(a.html))}</div>` : html`<div class="note__text">${a.text || (r ? "(Markierung ohne Text)" : "")}</div>`}
    <div class="note__foot">
      ${a.tags.map((t) => html`<span class="note__tag">#${t}</span>`)}
      ${r && pageLink ? html`<a class="note__tag" href="#page/${a.target.pageNumber}?note=${a.id}" title="Markierung im Viewer zeigen">▣ S. ${a.target.pageNumber}</a>` : ""}
      ${showTarget ? targetLink(a.target) : ""}
      <span class="spacer"></span>
      <time datetime="${a.updatedAt}" title="zuletzt geändert">${formatDate(a.updatedAt)}</time>
      <button type="button" class="link-btn" data-note-edit="${a.id}">Bearbeiten</button>
      <button type="button" class="link-btn link-btn--danger" data-note-delete="${a.id}">Löschen</button>
    </div>
  </article>`;
}

export function targetLink(t) {
  if (t.type === "section") {
    const n = t.sectionId.split("-s").pop();
    return html`<a class="note__tag" href="#article/${t.articleId}?s=${n}">${labelFor(t.articleId)} § ${n}</a>`;
  }
  if (t.type === "article") return html`<a class="note__tag" href="#article/${t.articleId}">${labelFor(t.articleId)}</a>`;
  return html`<a class="note__tag" href="#page/${t.pageNumber}">S. ${t.pageNumber}</a>`;
}
let labelFor = (id) => id;
export const setLabelResolver = (fn) => (labelFor = fn);

/** HTML eines Notizblocks für ein Ziel. */
export function noteBlock(target, { addLabel = "Notiz hinzufügen" } = {}) {
  const list = listFor(target);
  return html`<div class="notes" data-note-block="${keyOf(target)}" data-target="${JSON.stringify(target)}">
    ${list.map((a) => noteItem(a))}
    <button type="button" class="btn btn--small add-note" data-note-add>＋ ${addLabel}</button>
  </div>`;
}

function formHtml(a = { text: "", tags: [] }, { submitLabel = "Speichern" } = {}) {
  return html`<form class="note-form" data-note-form>
    ${editorHtml("html", a.html || esc(a.text || ""), "Eigene Anmerkung / Glosse …")}
    <label class="visually-hidden">Tags</label>
    <input name="tags" type="text" placeholder="Tags, durch Komma getrennt (optional)" value="${a.tags.join(", ")}" />
    <div class="note-form__row">
      <button type="button" class="btn btn--small btn--ghost" data-note-cancel>Abbrechen</button>
      <button type="submit" class="btn btn--small btn--primary">${submitLabel}</button>
    </div>
  </form>`;
}

function rerender(block) {
  const target = JSON.parse(block.dataset.target);
  const tmp = document.createElement("div");
  tmp.innerHTML = toHtml(noteBlock(target));
  block.replaceWith(tmp.firstElementChild);
}

export function refreshAll(root = document) {
  root.querySelectorAll("[data-note-block]").forEach(rerender);
}

/** Einmalig am Dokument registrieren. */
export function bindNotes(root = document) {
  root.addEventListener("click", (e) => {
    const add = e.target.closest("[data-note-add]");
    if (add) {
      const block = add.closest("[data-note-block]");
      add.insertAdjacentHTML("beforebegin", toHtml(formHtml()));
      add.hidden = true;
      block.querySelector("[data-note-form] .ed-area")?.focus();
      return;
    }
    const cancel = e.target.closest("[data-note-cancel]");
    if (cancel) {
      const block = cancel.closest("[data-note-block]");
      if (block) rerender(block);
      else cancel.closest("[data-note-form]")?.remove();
      return;
    }
    const edit = e.target.closest("[data-note-edit]");
    if (edit) {
      const id = edit.dataset.noteEdit;
      const a = store.all().find((x) => x.id === id);
      const item = edit.closest("[data-note-id]");
      if (!a || !item) return;
      const tmp = document.createElement("div");
      tmp.innerHTML = toHtml(formHtml(a, { submitLabel: "Ändern" }));
      tmp.firstElementChild.dataset.editId = id;
      item.replaceWith(tmp.firstElementChild);
      return;
    }
    const del = e.target.closest("[data-note-delete]");
    if (del) {
      const id = del.dataset.noteDelete;
      if (!confirm("Diese Notiz wirklich löschen?")) return;
      store.remove(id);
      const block = del.closest("[data-note-block]");
      if (block) rerender(block);
      else del.closest("[data-note-id]")?.remove();
      toast("Notiz gelöscht");
    }
  });

  root.addEventListener("submit", (e) => {
    const form = e.target.closest("[data-note-form]");
    if (!form) return;
    e.preventDefault();
    const { html: htmlValue, text } = readEditor(form);
    const tags = store.parseTags(form.elements.tags.value);
    const block = form.closest("[data-note-block]");
    try {
      if (form.dataset.editId) {
        const cur = store.all().find((x) => x.id === form.dataset.editId);
        if (!text && !(cur?.target.region || cur?.target.shape)) return;
        store.update(form.dataset.editId, { text, tags, html: htmlValue || undefined });
        toast("Notiz geändert");
      } else {
        if (!text) return;
        const target = JSON.parse(block.dataset.target);
        const { saved } = store.add({ target, text, tags, html: htmlValue });
        toast(saved ? "Notiz gespeichert" : "Notiz angelegt – Speichern im Browser nicht möglich (Export nutzen!)", saved ? 2200 : 5000);
      }
    } catch (err) {
      toast("Fehler: " + err.message, 4000);
      return;
    }
    if (block) rerender(block);
    else document.dispatchEvent(new CustomEvent("ssl:notes-changed"));
  });
}

export { esc };
