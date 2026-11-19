// Lese-Ansicht „Artikel“: Inhaltsverzeichnis | Original · Übertragung · Annotationen | Handschrift.

import { html, raw, esc, toHtml, statusBadge, MISSING_TEXT, $, $$ } from "../util.js";
import { tocHtml } from "../components/toc.js";
import { noteBlock } from "../components/notes.js";
import { altText } from "../components/viewer.js";
import { pageLabel } from "../data.js";
import { makeMatcher, highlightAll } from "../search.js";
import { alignSentences, sectionLines, cropHtml, paintCropMarks } from "../components/crop.js";

/** Editionstext mit Satz-Spans (Bereiche aus der Satzzuordnung), Lücken bleiben schlichter Text. */
function origWithSentences(text, items, fmt) {
  let out = "";
  let pos = 0;
  items.forEach((it, i) => {
    if (it.o.start > pos) out += toHtml(fmt(text.slice(pos, it.o.start)));
    out += `<span class="osent" data-osent="${i}">${toHtml(fmt(text.slice(it.o.start, it.o.end)))}</span>`;
    pos = Math.max(pos, it.o.end);
  });
  if (pos < text.length) out += toHtml(fmt(text.slice(pos)));
  return raw(out);
}

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
  const hl = params.get("hl");
  const matcher = hl
    ? makeMatcher({ q: hl, mode: params.get("mode") || "text", synonyms: params.get("syn") !== "0", variants: params.get("var") === "1", wholeWord: params.get("ww") === "1" }, data.synonymGroups).regex
    : null;
  const fmt = (text) => raw(matcher ? highlightAll(text, matcher, esc) : esc(text));
  const rowInfo = new Map();

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
    ? a.pages.map((p) => html`<a class="chip chip--link" href="#page/${p.pageNumber}" title="Seite im Handschriften-Viewer öffnen">${pageLabel(p)}</a>`)
    : html`<span class="chip" title="Für diesen Artikel ist noch keine Seite zugeordnet.">keine Seite zugeordnet</span>`;
  const method = a.pages[0]?.method;

  const tools = html`<div class="art-tools">
    ${pagesHtml}
    ${method ? html`<span class="meta-source" style="margin:0">Seitenzuordnung: ${METHOD_LABEL[method] || method}</span>` : ""}
  </div>`;

  const tabs = html`<div class="mobile-tabs" role="tablist" aria-label="Spalten">
    <button type="button" role="tab" data-tab="src" aria-selected="true">Original</button>
    <button type="button" role="tab" data-tab="trans" aria-selected="false">Übertragung</button>
    <button type="button" role="tab" data-tab="notes" aria-selected="false">Notizen</button>
  </div>`;

  const rows = sections.length
    ? html`<div class="sec-cols-head" aria-hidden="true">
          <div>Original · Dresdner Bilderhandschrift</div><div>Übertragung · heutiges Deutsch</div><div>Annotationen</div>
        </div>
        <div class="sec-list">
          ${sections.map((t) => {
            const pg = data.pageByNumber.get(t.pageNumber);
            const byPage = sectionLines(data, t);
            const crops = byPage.size ? cropHtml(data, t, byPage) : "";
            const align = crops && t.translation ? alignSentences(t.translation, t.plainText) : { exact: false, items: [] };
            rowInfo.set(t.sectionId, { t, byPage, align });
            const srcHtml = align.items.length ? origWithSentences(t.plainText, align.items, fmt) : fmt(t.plainText);
            const transHtml = !t.translation
              ? html`<span class="empty-text">Noch keine Übertragung.</span>`
              : align.items.length
                ? raw(
                    align.items
                      .map(
                        (it, i) =>
                          `<span class="sent" data-sent="${i}" tabindex="0" role="button" aria-label="Satz ${i + 1}: in der Handschrift markieren">${toHtml(fmt(t.translation.slice(it.t.start, it.t.end)))}</span>`
                      )
                      .join(" ")
                  )
                : fmt(t.translation);
            return html`<section class="sec-row${t.textRegions?.length ? " has-layout" : ""}${crops ? " has-crop" : ""}" id="s-${t.section}" data-sid="${t.sectionId}" aria-labelledby="sh-${t.section}">
              <div class="sec-cell sec-cell--src">
                <div class="sec-num">
                  <b id="sh-${t.section}"><a href="#article/${a.id}?s=${t.section}" data-sec-link="${t.section}" title="Link zu diesem Abschnitt">${secLabel(a, t.section)}</a></b>
                  ${pg ? html`<a class="chip chip--link" href="#page/${pg.pageNumber}?s=${encodeURIComponent(t.sectionId)}" title="${t.pageMapping === "estimate-text-length" ? "Seite geschätzt" : "Seite abgeglichen"} – im Handschriften-Viewer öffnen">${pageLabel(pg)}${t.pageMapping === "estimate-text-length" ? " ≈" : ""}</a>` : ""}
                  ${statusBadge(t.status)}
                </div>
                ${crops
                  ? html`<div class="ms-crops">${raw(crops)}</div>
                      <p class="crop-note">Ausschnitt der Dresdner Bilderhandschrift · Abschnitt eingegrenzt, ${align.exact ? "Sätze nach Satzgrenzen zugeordnet" : "Satzmarkierung anteilig geschätzt"} – unverifiziert</p>
                      <details class="src-details"${matcher ? " open" : ""}>
                        <summary>Editionstext (Lübben 1879)</summary>
                        <div class="src-text" lang="nds">${srcHtml}</div>
                      </details>`
                  : html`<div class="src-text" lang="nds">${srcHtml}</div>`}
                <div class="sec-meta">
                  ${t.basis === "manuscript-reading" ? html`<span class="chip">Lesung aus der Handschrift</span>` : html`<span class="chip" title="${t.sourceNote}">Edition ${t.edition}</span>`}
                  ${t.ocr === "raw" ? html`<span class="chip" title="Automatisch bereinigter OCR-Text; Lesefehler möglich">OCR</span>` : t.ocr === "corrected" ? html`<span class="chip" title="OCR-Fehler berichtigt">OCR berichtigt</span>` : html`<span class="chip" title="OCR, Apparatreste entfernt">OCR bereinigt</span>`}
                </div>
              </div>
              <div class="sec-cell sec-cell--trans">
                <div class="sec-num"><span>${secLabel(a, t.section)} · Übertragung</span></div>
                <div class="trans-text">${transHtml}</div>
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


  const view = html`<div class="reader" data-tab="src">
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
  </div>`;

  // ------- Verhalten -------
  function mount(root) {
    const reader = $(".reader", root);
    $("h1", root)?.setAttribute("id", "artTitle");

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
      })
    );

    function updateHash() {
      const s = location.hash.match(/[?&]s=(\d+)/)?.[1];
      history.replaceState(null, "", `#article/${a.id}${s ? "?s=" + s : ""}`);
    }
    // Großer Viewer: Seite öffnen, Paragraph dort markieren
    const openBig = (n, sid) => n && (location.hash = `#page/${n}${sid ? "?s=" + encodeURIComponent(sid) : ""}`);

    // Satz der Übertragung ↔ gelbe Markierung im Ausschnitt und im Editionstext
    let pinned = null; // { sid, i }
    function markSentence(row, i) {
      const info = rowInfo.get(row.dataset.sid);
      if (!info) return;
      const it = i == null ? null : info.align.items[i];
      paintCropMarks(row, info.byPage, it ? it.o : null);
      $$(".sent", row).forEach((s) => s.classList.toggle("is-on", !!it && Number(s.dataset.sent) === i));
      $$(".osent", row).forEach((s) => s.classList.toggle("is-on", !!it && Number(s.dataset.osent) === i));
      $$(".sent", row).forEach((s) => s.classList.toggle("is-pinned", !!pinned && pinned.sid === row.dataset.sid && Number(s.dataset.sent) === pinned.i));
    }
    function restore(row) {
      if (pinned && pinned.sid === row.dataset.sid) markSentence(row, pinned.i);
      else markSentence(row, null);
    }
    const sentOf = (e) => e.target.closest?.(".sec-row.has-crop .sent, .sec-row.has-crop .osent");
    const idxOf = (s) => Number(s.dataset.sent ?? s.dataset.osent);
    root.addEventListener("mouseover", (e) => {
      const s = sentOf(e);
      if (s) markSentence(s.closest(".sec-row"), idxOf(s));
    });
    root.addEventListener("mouseout", (e) => {
      const s = sentOf(e);
      if (s && !s.contains(e.relatedTarget)) restore(s.closest(".sec-row"));
    });
    root.addEventListener("focusin", (e) => {
      const s = sentOf(e);
      if (s) markSentence(s.closest(".sec-row"), idxOf(s));
    });
    root.addEventListener("focusout", (e) => {
      const s = sentOf(e);
      if (s) restore(s.closest(".sec-row"));
    });
    function pinSentence(s) {
      const row = s.closest(".sec-row");
      const i = idxOf(s);
      const prevRow = pinned && $(`.sec-row[data-sid="${CSS.escape(pinned.sid)}"]`, root);
      pinned = pinned && pinned.sid === row.dataset.sid && pinned.i === i ? null : { sid: row.dataset.sid, i };
      if (prevRow && prevRow !== row) markSentence(prevRow, null);
      $$(".sec-row", root).forEach((r) => r.classList.toggle("is-linked", !!pinned && r === row));
      markSentence(row, pinned ? i : null);
      // Ausschnitt in Sicht bringen, falls er aus dem Bild gescrollt ist
      const fig = $(".ms-crops", row);
      if (pinned && fig) {
        const r = fig.getBoundingClientRect();
        if (r.bottom < 80 || r.top > innerHeight - 40) fig.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
    root.addEventListener("click", (e) => {
      const s = sentOf(e);
      if (!s || e.target.closest("a, button")) return;
      pinSentence(s);
    });
    root.addEventListener("keydown", (e) => {
      const s = e.target.closest?.(".sec-row.has-crop .sent");
      if (s && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        pinSentence(s);
      }
    });
    // Klick auf den Ausschnitt → Seite im großen Viewer
    root.addEventListener("click", (e) => {
      const fig = e.target.closest(".ms-crop");
      if (!fig || e.target.closest("a, button")) return;
      openBig(Number(fig.dataset.page), fig.closest(".sec-row").dataset.sid);
    });
    // Paragraphen ohne Ausschnitt: Klick auf den Text → großer Viewer
    root.addEventListener("click", (e) => {
      const txt = e.target.closest(".sec-row.has-layout:not(.has-crop) .src-text, .sec-row.has-layout:not(.has-crop) .trans-text");
      if (!txt || e.target.closest("a, button, mark")) return;
      const t = data.sectionById.get(txt.closest(".sec-row").dataset.sid);
      openBig(t?.textRegions?.[0]?.pageNumber || t?.pageNumber, t?.sectionId);
    });

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
    const s = params.get("s") || (pageParam && sections.find((x) => (x.pages || []).includes(pageParam))?.section);
    if (s) requestAnimationFrame(() => jumpTo(s));
    else if (matcher) requestAnimationFrame(() => $(".hit", root)?.closest(".sec-row")?.scrollIntoView({ block: "start" }));
    else window.scrollTo(0, 0);

  }

  return { html: view, mount, title: `${a.label}${a.title && a.status !== "missing" ? " – " + a.title : ""}` };
}

export { altText };
