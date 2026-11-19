// Inhaltsverzeichnis im Stil von gesetze-im-internet.de: Bücher → Artikel.

import { html, STATUS_LABEL } from "../util.js";

export function bookArticles(data, bookId) {
  return data.articles.filter((a) => a.book === bookId && a.id !== "lr-prolog");
}

function item(a, currentId) {
  const missing = a.status === "missing";
  return html`<li><a href="#article/${a.id}" class="${missing ? "is-missing" : ""}" ${a.id === currentId ? html`aria-current="page"` : ""} data-toc-id="${a.id}">
    <span class="num">${a.article === 0 ? "Vorr." : `Art. ${a.article}`}</span>
    <span class="ttl">${a.title && !missing ? a.title : missing ? "noch ohne Transkription" : a.title || "—"}</span>
    <span class="toc-dot toc-dot--${a.status}" title="${STATUS_LABEL[a.status]}"></span>
  </a></li>`;
}

/**
 * @param {object} opts { currentId, openBooks: Set|null, compact }
 */
export function tocHtml(data, { currentId = null, openBooks = null } = {}) {
  const prolog = data.articleById.get("lr-prolog");
  const current = currentId ? data.articleById.get(currentId) : null;
  return data.books.map((b) => {
    const list = bookArticles(data, b.id);
    const withText = list.filter((a) => a.status !== "missing").length;
    const open = openBooks ? openBooks.has(b.id) : current ? current.book === b.id : b.id === "lr-i";
    return html`<details class="toc-book" data-book="${b.id}" ${open ? html`open` : ""}>
      <summary><span>${b.label}</span><small>${withText}/${list.length} mit Text</small></summary>
      <ol class="toc-list">
        ${b.id === "lr-i" && prolog ? item(prolog, currentId) : ""}
        ${list.map((a) => item(a, currentId))}
      </ol>
    </details>`;
  });
}
