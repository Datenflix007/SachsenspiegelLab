// Lese-Ansicht „Artikel“: Inhaltsverzeichnis | Original · Übertragung · Annotationen | Handschrift.

import { html, raw, esc, statusBadge, MISSING_TEXT, storage, $, $$ } from "../util.js";
import { tocHtml } from "../components/toc.js";
import { noteBlock } from "../components/notes.js";
import { createViewer, altText, linesForPage } from "../components/viewer.js";
import { shapesForPage } from "./manuscript.js";
import { pageLabel } from "../data.js";
import { makeMatcher, highlightAll } from "../search.js";

const PROLOG_LABEL = { 1: "Prologus", 2: "Prologus (Forts.)", 3: "Textus prologi" };
const secLabel = (a, n) => (a.id === "lr-prolog" ? PROLOG_LABEL[n] || `Teil ${n}` : `§ ${n}`);

const METHOD_LABEL = {
  "claude-visual": "am Bild abgeglichen (Claude), noch nicht bestätigt",
  "claude-visual-estimate": "am Bild abgeglichen/geschätzt (Claude), noch nicht bestätigt",
  "manifest-structure": "aus der Gliederung des IIIF-Manifests",
  "estimate-text-length": "geschätzt nach Textmenge – unverifiziert",
};

export function renderArticle(ctx, id, params) {
  const { data } = ctx;
  const a = data.articleById.get(id);
  if (!a) {
    return { html: html`<div class="page"><p class="notice">Artikel „${id}“ nicht gefunden. <a href="#home">Zum Verzeichnis</a></p></div>` };
  }
  const idx = data.articleIndex.get(id);
  const prev = data.articles[idx - 1];
  const next = data.articles[idx + 1];
  const sections = data.sectionsByArticle.get(id) || [];
  const pageParam = params.get("page") ? Number(params.get("page")) : null;
  const panelPref = storage.get("ssl.panel", false);
  const showPanel = !!pageParam || panelPref;
  const hl = params.get("hl");
  const matcher = hl
    ? makeMatcher({ q: hl, mode: params.get("mode") || "text", synonyms: params.get("syn") !== "0", variants: params.get("var") === "1", wholeWord: params.get("ww") === "1" }, data.synonymGroups).regex
    : null;
  const fmt = (text) => raw(matcher ? highlightAll(text, matcher, esc) : esc(text));

  const isVerifiedMeta = a.metaStatus === "verified";
  const head = html`<header class="art-head">
    <div class="art-head__crumbs">
      <button type="button" class="btn btn--small reader__toc-toggle" data-toc-toggle aria-controls="readerToc" aria-expanded="false">☰ Verzeichnis</button>
      <a class="chip chip--link" href="#home">${a.bookLabel}</a>
      <span class="chip">${a.article === 0 ? "Vorrede" : `Art. ${a.article}`}</span>
      ${statusBadge(a.status)}
    </div>
    <span class="eyebrow">${a.bookLabel}${a.article ? ` · Artikel ${a.article}` : ""}</span>
    <h1>${a.article === 0 ? a.title : `${a.bookLabel} ${a.article}${a.title && a.status !== "missing" ? ` – ${a.title}` : ""}`}</h1>
    ${a.keyPoints.length || a.significance
      ? html`<div class="art-summary">
          <div>
            <div class="bar">Kernpunkte</div>
            <ul class="keypoints">${a.keyPoints.map((k) => html`<li>${k}</li>`)}</ul>
          </div>
          <div>
            <div class="bar">Bedeutung</div>
            <p class="significance">${a.significance}</p>
          </div>
        </div>
        <p class="meta-source">${isVerifiedMeta ? "Titel, Kernpunkte und Bedeutung: aus den Tafelbildern übernommen (geprüft)." : "Titel, Kernpunkte und Bedeutung: Entwurf, noch nicht geprüft."}${a.keywords.length ? ` Schlagworte: ${a.keywords.join(", ")}.` : ""}</p>`
      : ""}
    ${a.note ? html`<p class="notice" style="margin-top:12px">${a.note}</p>` : ""}
  </header>`;

  const pagesHtml = a.pages.length
    ? a.pages.map((p) => html`<button type="button" class="chip chip--link" data-panel-page="${p.pageNumber}" title="Seite im Panel zeigen">${pageLabel(p)}</button>`)
    : html`<span class="chip" title="Für diesen Artikel ist noch keine Seite zugeordnet.">keine Seite zugeordnet</span>`;
  const method = a.pages[0]?.method;

  const tools = html`<div class="art-tools">
    <button type="button" class="btn btn--small" data-panel-toggle aria-pressed="${showPanel}" aria-controls="msPanel">▣ Handschrift ${showPanel ? "ausblenden" : "einblenden"}</button>
    ${pagesHtml}
    ${method ? html`<span class="meta-source" style="margin:0">Seitenzuordnung: ${METHOD_LABEL[method] || method}</span>` : ""}
  </div>`;

  const tabs = html`<div class="mobile-tabs" role="tablist" aria-label="Spalten">
    <button type="button" role="tab" data-tab="src" aria-selected="true">Original</button>
    <button type="button" role="tab" data-tab="trans" aria-selected="false">Übertragung</button>
    <button type="button" role="tab" data-tab="notes" aria-selected="false">Notizen</button>
    <button type="button" role="tab" data-tab="ms" aria-selected="false">Handschrift</button>
  </div>`;

  const rows = sections.length
    ? html`<div class="sec-cols-head" aria-hidden="true">
          <div>Originaltext · Edition Lübben 1879</div><div>Übertragung · heutiges Deutsch</div><div>Annotationen</div>
        </div>
        <div class="sec-list">
          ${sections.map((t) => {
            const pg = data.pageByNumber.get(t.pageNumber);
            return html`<section class="sec-row${t.textRegions?.length ? " has-layout" : ""}" id="s-${t.section}" data-sid="${t.sectionId}" aria-labelledby="sh-${t.section}" ${t.textRegions?.length ? html`title="Klicken: Stelle in der Handschrift markieren (Zuordnung geschätzt)"` : ""}>
              <div class="sec-cell sec-cell--src">
                <div class="sec-num">
                  <b id="sh-${t.section}"><a href="#article/${a.id}?s=${t.section}" data-sec-link="${t.section}" title="Link zu diesem Abschnitt">${secLabel(a, t.section)}</a></b>
                  ${pg ? html`<button type="button" class="chip chip--link" data-panel-page="${pg.pageNumber}" title="${t.pageMapping === "estimate-text-length" ? "Seite geschätzt" : "Seite abgeglichen"}">${pageLabel(pg)}${t.pageMapping === "estimate-text-length" ? " ≈" : ""}</button>` : ""}
                  ${statusBadge(t.status)}
                </div>
                <div class="src-text" lang="nds">${fmt(t.plainText)}</div>
                <div class="sec-meta">
                  ${t.basis === "manuscript-reading" ? html`<span class="chip">Lesung aus der Handschrift</span>` : html`<span class="chip" title="${t.sourceNote}">Edition ${t.edition}</span>`}
                  ${t.ocr === "raw" ? html`<span class="chip" title="Automatisch bereinigter OCR-Text; Lesefehler möglich">OCR</span>` : t.ocr === "corrected" ? html`<span class="chip" title="OCR-Fehler berichtigt">OCR berichtigt</span>` : html`<span class="chip" title="OCR, Apparatreste entfernt">OCR bereinigt</span>`}
                </div>
              </div>
              <div class="sec-cell sec-cell--trans">
                <div class="sec-num"><span>${secLabel(a, t.section)} · Übertragung</span></div>
                <div class="trans-text">${t.translation ? fmt(t.translation) : html`<span class="empty-text">Noch keine Übertragung.</span>`}</div>
              </div>
              <div class="sec-cell sec-cell--notes">
                <div class="sec-num"><span>${secLabel(a, t.section)} · Annotationen</span></div>
                ${noteBlock({ type: "section", articleId: a.id, sectionId: t.sectionId, pageNumber: t.pageNumber || undefined, canvasId: t.canvasId || undefined })}
              </div>
            </section>`;
          })}
        </div>`
    : html`<div class="sec-list"><p class="notice notice--warn">${MISSING_TEXT}</p></div>`;

  const articleNotes = html`<section class="card" style="margin-top:20px" aria-labelledby="artNotesH">
    <h2 id="artNotesH" class="eyebrow" style="margin:0 0 10px">Notizen zum ganzen Artikel</h2>
    ${noteBlock({ type: "article", articleId: a.id }, { addLabel: "Notiz zum Artikel" })}
  </section>`;

  const source = sections.length
    ? html`<details class="card" style="margin-top:14px">
        <summary><b>Quelle &amp; Status</b></summary>
        <p class="meta-source" style="font-size:.86rem">${sections[0].sourceNote}</p>
        <p class="meta-source" style="font-size:.86rem">Übertragungen: freie Übertragung ins heutige Deutsch, Entwurf. Status „geprüft“ setzt ausschließlich der Projektinhaber.</p>
      </details>`
    : "";

  const pager = html`<nav class="art-pager" aria-label="Weitere Artikel">
    ${prev ? html`<a class="prev" href="#article/${prev.id}" rel="prev"><small>← vorheriger</small>${prev.label}${prev.title && prev.status !== "missing" ? ` · ${prev.title}` : ""}</a>` : html`<span></span>`}
    ${next ? html`<a class="next" href="#article/${next.id}" rel="next"><small>nächster →</small>${next.label}${next.title && next.status !== "missing" ? ` · ${next.title}` : ""}</a>` : html`<span></span>`}
  </nav>`;

  const panel = html`<aside class="reader__panel" id="msPanel" aria-label="Handschrift" ${showPanel ? "" : html`hidden`}>
    <div class="ms-panel">
      <div class="ms-panel__head">
        <button type="button" class="icon-btn" data-ms-prev aria-label="Vorherige Seite">‹</button>
        <strong data-ms-label>–</strong>
        <button type="button" class="icon-btn" data-ms-next aria-label="Nächste Seite">›</button>
        <span class="spacer"></span>
        <button type="button" class="icon-btn" data-ms-text aria-pressed="false" aria-label="Transkription über das Bild legen" title="Text über das Bild legen">¶</button>
        <button type="button" class="icon-btn" data-ms-zoomin aria-label="Vergrößern">＋</button>
        <button type="button" class="icon-btn" data-ms-zoomout aria-label="Verkleinern">－</button>
        <button type="button" class="icon-btn" data-ms-full aria-label="Vollbild">⛶</button>
      </div>
      <div class="ms-panel__stage" data-ms-stage></div>
      <div class="ms-panel__foot">
        <a data-ms-big href="#manuscript">Im großen Viewer öffnen</a> ·
        <a data-ms-source href="https://sachsen.digital/werk/6439" target="_blank" rel="noopener">Quelle ↗</a>
        <span data-ms-note></span>
      </div>
    </div>
  </aside>`;

  const view = html`<div class="reader${showPanel ? " has-panel" : ""}" data-tab="src">
    <aside class="reader__toc" id="readerToc" aria-label="Inhaltsverzeichnis">
      <div class="toc-filter">
        <label class="visually-hidden" for="tocFilter">Verzeichnis filtern</label>
        <input id="tocFilter" type="search" placeholder="Verzeichnis filtern …" autocomplete="off" />
      </div>
      ${tocHtml(data, { currentId: a.id })}
    </aside>
    <article class="reader__main" aria-labelledby="artTitle">
      ${head}${tools}${tabs}${rows}${articleNotes}${source}${pager}
    </article>
    ${panel}
  </div>`;

  // ------- Verhalten -------
  function mount(root) {
    const reader = $(".reader", root);
    const panelEl = $("#msPanel", root);
    $("h1", root)?.setAttribute("id", "artTitle");
    let viewer = null;
    let currentPage = pageParam || a.pages[0]?.pageNumber || null;

    // Verzeichnis: aktuellen Eintrag sichtbar machen, Filter, Mobil-Schublade
    const cur = $(`[data-toc-id="${a.id}"]`, root);
    cur?.scrollIntoView({ block: "center" });
    const tocEl = $("#readerToc", root);
    $("#tocFilter", root).addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      $$(".toc-list li", tocEl).forEach((li) => (li.hidden = q && !li.textContent.toLowerCase().includes(q)));
      if (q) $$("details.toc-book", tocEl).forEach((d) => (d.open = true));
    });
    const tocToggle = $("[data-toc-toggle]", root);
    tocToggle?.addEventListener("click", () => {
      const open = tocEl.classList.toggle("is-open");
      tocToggle.setAttribute("aria-expanded", String(open));
      if (open) $("#tocFilter", root).focus();
    });
    tocEl.addEventListener("click", (e) => {
      if (e.target.closest("a")) tocEl.classList.remove("is-open");
    });

    // Mobile Tabs
    $$(".mobile-tabs [data-tab]", root).forEach((b) =>
      b.addEventListener("click", () => {
        reader.dataset.tab = b.dataset.tab;
        $$(".mobile-tabs [data-tab]", root).forEach((x) => x.setAttribute("aria-selected", String(x === b)));
        if (b.dataset.tab === "ms") openPanel(currentPage, { persist: false });
      })
    );

    // Panel
    function updateHash() {
      const s = location.hash.match(/[?&]s=(\d+)/)?.[1];
      const qs = new URLSearchParams();
      if (s) qs.set("s", s);
      if (currentPage && !panelEl.hidden) qs.set("page", currentPage);
      const str = qs.toString();
      history.replaceState(null, "", `#article/${a.id}${str ? "?" + str : ""}`);
    }
    function showPage(n) {
      const p = data.pageByNumber.get(n);
      if (!p) return;
      currentPage = n;
      $("[data-ms-label]", root).textContent = pageLabel(p);
      $("[data-ms-big]", root).href = `#page/${n}`;
      $("[data-ms-source]", root).href = p.sachsenDigitalUrl;
      const mapped = a.pages.find((x) => x.pageNumber === n);
      $("[data-ms-note]", root).textContent = mapped ? ` · ${mapped.mappingStatus === "verified" ? "Zuordnung bestätigt" : "Zuordnung unverifiziert"}` : " · nicht diesem Artikel zugeordnet";
      if (!viewer) {
        viewer = createViewer($("[data-ms-stage]", root), {
          onLineClick: (sid) => linkSection(sid, { fromViewer: true }),
          onShapeClick: (id) => {
            location.hash = `#page/${currentPage}?note=${encodeURIComponent(id)}`;
          },
          onOpen: () => linkedSection && viewer.highlightSection(linkedSection, { focus: true }),
        });
        const pv = storage.get("ssl.viewer", {});
        viewer.setVisibility({ text: !!pv.panelText, user: pv.user !== false, project: pv.project !== false, imported: pv.imported !== false });
        viewer.setTextOpacity(pv.opacity ?? 0.78);
        $("[data-ms-text]", root).setAttribute("aria-pressed", String(!!pv.panelText));
      }
      viewer.setPage(p, { lines: linesForPage(data, n), shapes: shapesForPage(ctx, n) });
      updateHash();
    }

    // Klick auf Original/Übertragung → Zeilen im Bild markieren; Klick auf Zeile im Bild → zum §
    let linkedSection = null;
    function linkSection(sid, { fromViewer = false } = {}) {
      const t = data.sectionById.get(sid);
      if (!t) return;
      linkedSection = sid;
      $$(".sec-row", root).forEach((r) => r.classList.toggle("is-linked", r.dataset.sid === sid));
      if (fromViewer) {
        const row = $(`.sec-row[data-sid="${CSS.escape(sid)}"]`, root);
        if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });
        else if (t.articleId !== a.id) location.hash = `#article/${t.articleId}?s=${t.section}&page=${currentPage}`;
        viewer?.highlightSection(sid, { focus: false });
        return;
      }
      const pg = t.textRegions?.[0]?.pageNumber || t.pageNumber;
      if (!pg) return;
      if (panelEl.hidden || currentPage !== pg) openPanel(pg);
      else viewer?.highlightSection(sid, { focus: true });
    }
    root.addEventListener("click", (e) => {
      const txt = e.target.closest(".sec-row.has-layout .src-text, .sec-row.has-layout .trans-text");
      if (!txt || e.target.closest("a, button, mark")) return;
      if (matchMedia("(max-width: 900px)").matches) $('.mobile-tabs [data-tab="ms"]', root)?.click();
      linkSection(txt.closest(".sec-row").dataset.sid);
    });
    $("[data-ms-text]", root).addEventListener("click", (e) => {
      const pv = storage.get("ssl.viewer", {});
      pv.panelText = !pv.panelText;
      storage.set("ssl.viewer", pv);
      e.currentTarget.setAttribute("aria-pressed", String(pv.panelText));
      viewer?.setVisibility({ text: pv.panelText });
    });
    function openPanel(n, { persist = true } = {}) {
      panelEl.hidden = false;
      reader.classList.add("has-panel");
      const t = $("[data-panel-toggle]", root);
      t.setAttribute("aria-pressed", "true");
      t.textContent = "▣ Handschrift ausblenden";
      if (persist) storage.set("ssl.panel", true);
      if (n) showPage(n);
      else {
        $("[data-ms-label]", root).textContent = "Keine Seite zugeordnet";
        const st = data.meta.structures.find((s) => s.label.includes(a.bookLabel.replace("Landrecht", "Landrecht")));
        $("[data-ms-stage]", root).innerHTML = `<p class="notice" style="margin:16px">Für diesen Artikel ist noch keine Seite zugeordnet.${st ? ` Das Buch beginnt in der Handschrift auf <a href="#page/${st.firstPage}">Seite ${st.firstPage}</a>.` : ""}</p>`;
      }
    }
    function closePanel() {
      panelEl.hidden = true;
      reader.classList.remove("has-panel");
      const t = $("[data-panel-toggle]", root);
      t.setAttribute("aria-pressed", "false");
      t.textContent = "▣ Handschrift einblenden";
      storage.set("ssl.panel", false);
      updateHash();
    }
    $("[data-panel-toggle]", root).addEventListener("click", () => (panelEl.hidden ? openPanel(currentPage) : closePanel()));
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-panel-page]");
      if (!b) return;
      if (matchMedia("(max-width: 900px)").matches) {
        $('.mobile-tabs [data-tab="ms"]', root)?.click();
      }
      openPanel(Number(b.dataset.panelPage));
    });
    $("[data-ms-prev]", root).addEventListener("click", () => currentPage > 1 && showPage(currentPage - 1));
    $("[data-ms-next]", root).addEventListener("click", () => currentPage < data.pages.length && showPage(currentPage + 1));
    $("[data-ms-zoomin]", root).addEventListener("click", () => viewer?.zoomIn());
    $("[data-ms-zoomout]", root).addEventListener("click", () => viewer?.zoomOut());
    $("[data-ms-full]", root).addEventListener("click", () => viewer?.toggleFullscreen($(".ms-panel", root)));
    if (showPanel) openPanel(currentPage, { persist: false });

    // §-Links: ohne Neurendern springen
    root.addEventListener("click", (e) => {
      const l = e.target.closest("[data-sec-link]");
      if (!l) return;
      e.preventDefault();
      history.replaceState(null, "", l.getAttribute("href"));
      updateHash();
      jumpTo(l.dataset.secLink);
    });
    function jumpTo(n) {
      const row = $(`#s-${CSS.escape(String(n))}`, root);
      if (!row) return;
      row.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      row.classList.remove("is-flash");
      void row.offsetWidth;
      row.classList.add("is-flash");
    }
    const s = params.get("s");
    if (s) requestAnimationFrame(() => jumpTo(s));
    else if (matcher) requestAnimationFrame(() => $(".hit", root)?.closest(".sec-row")?.scrollIntoView({ block: "start" }));
    else window.scrollTo(0, 0);

    return () => viewer?.destroy();
  }

  return { html: view, mount, title: `${a.label}${a.title && a.status !== "missing" ? " – " + a.title : ""}` };
}

export { altText };
