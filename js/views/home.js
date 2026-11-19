// Startseite: Einstieg, Kennzahlen, Themenkarten, vollständiges Verzeichnis.

import { html, statusBadge } from "../util.js";
import { tocHtml } from "../components/toc.js";
import { articlesForTheme } from "../data.js";

function themeCard(t) {
  return html`<a class="theme-card" href="#theme/${t.id}" data-group="${t.group}">
    <span class="theme-card__meta">${t.meta}</span>
    <span class="theme-card__title">${t.title}</span>
    <span class="theme-card__text">${t.summary}</span>
  </a>`;
}

export function renderHome(ctx) {
  const { data } = ctx;
  const c = data.meta.counts;
  const total = data.articles.length;
  const heroPage = data.pageByNumber.get(15);
  const heroImg = `${heroPage.imageServiceUrl}/pct:3,1,48,30/900,/0/default.jpg`;
  const groups = [
    ["landrecht", "Landrecht"],
    ["lehnrecht", "Lehnrecht"],
  ];
  return html`<div class="page">
    <section class="hero" aria-labelledby="heroTitle">
      <div>
        <span class="eyebrow">Eike von Repgow · um 1220–1235</span>
        <h1 id="heroTitle">Der Sachsenspiegel – <em>Artikel für Artikel</em></h1>
        <p>
          Landrecht und Lehnrecht mit Originaltext, freier Übertragung ins heutige Deutsch und eigenen Annotationen –
          verknüpft mit allen ${data.pages.length} Seiten der <strong>Dresdner Bilderhandschrift</strong> (SLUB, Mscr.Dresd.M.32) im IIIF-Viewer.
        </p>
        <div class="hero__actions">
          <a class="btn btn--primary" href="#article/lr-i-1">Lesen: Landrecht I 1</a>
          <a class="btn" href="#manuscript">Handschrift durchblättern</a>
          <a class="btn btn--ghost" href="#search">Volltextsuche</a>
        </div>
        <div class="stat-row" aria-label="Bearbeitungsstand">
          <div class="stat"><b>${total}</b><span>Artikel im Verzeichnis</span></div>
          <div class="stat"><b>${c.draft + c.verified}</b><span>mit Text (${c.verified} geprüft · ${c.draft} Entwurf)</span></div>
          <div class="stat"><b>${c.missing}</b><span>noch ohne Transkription</span></div>
          <div class="stat"><b>${data.pages.length}</b><span>Seiten der Handschrift</span></div>
        </div>
      </div>
      <figure class="hero__visual" style="margin:0">
        <a href="#page/15" aria-label="Seite 15 (Bl. 4r) im Viewer öffnen">
          <img src="${heroImg}" alt="Bildstreifen der Dresdner Bilderhandschrift, Bl. 4r: Christus übergibt Papst und Kaiser die zwei Schwerter (LR I 1)" loading="eager" decoding="async" />
        </a>
        <figcaption>Bl. 4r: Christus übergibt die zwei Schwerter – Bildstreifen zu LR I 1 · SLUB Dresden, Public Domain</figcaption>
      </figure>
    </section>

    <div class="section-head">
      <h2>Themenfelder</h2>
      <p>Ein Klick zeigt die zugehörigen Artikel. „v. a.“ = Schwerpunkte, keine vollständige Liste.</p>
    </div>
    <div class="theme-groups">
      ${groups.map(
        ([g, label]) => html`<section class="theme-group" aria-label="${label}">
          <h3>${label}</h3>
          <div class="theme-grid">${data.themes.filter((t) => t.group === g).map(themeCard)}</div>
        </section>`
      )}
    </div>

    <div class="section-head">
      <h2>Gesamtverzeichnis</h2>
      <p>
        <span class="toc-dot toc-dot--verified" style="display:inline-block"></span> geprüft ·
        <span class="toc-dot toc-dot--draft" style="display:inline-block"></span> Entwurf ·
        <span class="toc-dot toc-dot--missing" style="display:inline-block"></span> noch ohne Transkription
      </p>
    </div>
    <div class="toc-full">${tocHtml(data, { openBooks: new Set(data.books.map((b) => b.id)) })}</div>
  </div>`;
}

export function renderTheme(ctx, id) {
  const { data } = ctx;
  const t = data.themes.find((x) => x.id === id);
  if (!t) return html`<div class="page"><p class="notice">Themenfeld nicht gefunden. <a href="#home">Zur Übersicht</a></p></div>`;
  const list = articlesForTheme(data, t);
  return html`<div class="page page--narrow">
    <a class="chip chip--link" href="#home">← Übersicht</a>
    <div class="art-head" style="margin-top:14px">
      <span class="theme-card__meta">${t.meta}</span>
      <h1>${t.title}</h1>
      <p class="art-head__sub">${t.summary}</p>
    </div>
    <p class="notice">Die Intervalle stammen aus den Tafelbildern. ${list.filter((x) => x.article.status !== "missing").length} von ${list.length} Artikeln haben bereits Text; die übrigen sind verlinkt, aber noch ohne Transkription.</p>
    <ol class="toc-list card" style="max-height:none;margin-top:14px">
      ${list.map(
        ({ article: a, sections }) => html`<li><a href="#article/${a.id}" class="${a.status === "missing" ? "is-missing" : ""}">
          <span class="num">${a.bookLabel.replace("Landrecht", "LR")} ${a.article}</span>
          <span class="ttl">${a.status === "missing" ? "noch ohne Transkription" : a.title}${sections ? ` (§§ ${sections[0]}–${sections[sections.length - 1]})` : ""}</span>
          ${statusBadge(a.status)}
        </a></li>`
      )}
    </ol>
  </div>`;
}
