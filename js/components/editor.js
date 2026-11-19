// Kleiner Rich-Text-Editor für Glossen + HTML-Bereinigung (Whitelist).

import { html, raw } from "../util.js";

const ALLOWED = new Set(["B", "STRONG", "I", "EM", "U", "S", "P", "BR", "UL", "OL", "LI", "A", "SPAN", "BLOCKQUOTE", "SUB", "SUP", "MARK", "DIV"]);

/** Entfernt alles außer einfacher Auszeichnung; Links nur http(s)/mailto. */
export function sanitizeHtml(input) {
  const doc = new DOMParser().parseFromString(`<div>${String(input || "")}</div>`, "text/html");
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) continue;
      if (child.nodeType !== 1 || !ALLOWED.has(child.tagName)) {
        if (child.nodeType === 1 && !["SCRIPT", "STYLE", "IFRAME", "OBJECT"].includes(child.tagName)) {
          walk(child);
          child.replaceWith(...child.childNodes);
        } else child.remove();
        continue;
      }
      for (const attr of [...child.attributes]) {
        const keep =
          (child.tagName === "A" && attr.name === "href" && /^(https?:|mailto:|#)/i.test(attr.value.trim())) ||
          (attr.name === "style" && /^\s*color:\s*#[0-9a-f]{3,6}\s*;?\s*$/i.test(attr.value));
        if (!keep) child.removeAttribute(attr.name);
      }
      if (child.tagName === "A") {
        child.setAttribute("target", "_blank");
        child.setAttribute("rel", "noopener");
      }
      walk(child);
    }
  };
  const root = doc.body.firstElementChild;
  walk(root);
  return root.innerHTML.trim();
}

export const htmlToText = (h) => {
  const d = new DOMParser().parseFromString(`<div>${h || ""}</div>`, "text/html");
  d.querySelectorAll("li, p, br, div").forEach((n) => n.append(" "));
  return d.body.textContent.replace(/\s+/g, " ").trim();
};

/** Editor-Markup; value = vorhandenes (bereinigtes) HTML. */
export function editorHtml(name = "html", value = "", placeholder = "Glosse / Anmerkung …") {
  const btn = (cmd, label, title, arg = "") =>
    html`<button type="button" class="ed-btn" data-cmd="${cmd}" data-arg="${arg}" title="${title}" aria-label="${title}">${raw(label)}</button>`;
  return html`<div class="editor" data-editor>
    <div class="ed-toolbar" role="toolbar" aria-label="Formatierung">
      ${btn("bold", "<b>B</b>", "Fett (Strg+B)")}
      ${btn("italic", "<i>I</i>", "Kursiv (Strg+I)")}
      ${btn("underline", "<u>U</u>", "Unterstrichen (Strg+U)")}
      ${btn("strikeThrough", "<s>S</s>", "Durchgestrichen")}
      ${btn("insertUnorderedList", "•", "Aufzählung")}
      ${btn("insertOrderedList", "1.", "Nummerierung")}
      ${btn("formatBlock", "❝", "Zitat", "blockquote")}
      ${btn("createLink", "🔗", "Link einfügen")}
      ${btn("removeFormat", "⌫", "Formatierung entfernen")}
    </div>
    <div class="ed-area" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${placeholder}" data-placeholder="${placeholder}" data-name="${name}">${raw(sanitizeHtml(value))}</div>
  </div>`;
}

/** Einmalig registrieren: Toolbar-Befehle. */
export function bindEditors(root = document) {
  root.addEventListener("mousedown", (e) => {
    if (e.target.closest(".ed-btn")) e.preventDefault(); // Auswahl im Editor behalten
  });
  root.addEventListener("click", (e) => {
    const b = e.target.closest(".ed-btn");
    if (!b) return;
    const area = b.closest("[data-editor]").querySelector(".ed-area");
    area.focus();
    let arg = b.dataset.arg || null;
    if (b.dataset.cmd === "createLink") {
      arg = prompt("Link-Adresse (https://…):", "https://");
      if (!arg || !/^https?:\/\//i.test(arg)) return;
    }
    document.execCommand(b.dataset.cmd, false, arg);
  });
}

export function readEditor(container) {
  const area = container.querySelector(".ed-area");
  const clean = sanitizeHtml(area?.innerHTML || "");
  return { html: clean, text: htmlToText(clean) };
}
