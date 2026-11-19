// Ansicht „Handschrift“: Galerie aller Seiten + großer Viewer.

import { html, toHtml, $, $$, toast, compactRanges } from "../util.js";
import { createViewer, altText } from "../components/viewer.js";
import { noteBlock, noteItem } from "../components/notes.js";
import { pageLabel } from "../data.js";

function articlesShort(data, n) {
  const list = data.articlesByPage.get(n) || [];
  if (!list.length) return "";
  const byBook = new Map();
  for (const { article } of list) {
    const key = article.id === "lr-prolog" ? "Vorrede" : article.bookLabel.replace("Landrecht", "LR");
    if (!byBook.has(key)) byBook.set(key, []);
    if (article.article) byBook.get(key).push(article.article);
  }
  return [...byBook.entries()].map(([b, nums]) => (nums.length ? `${b} ${compactRanges(nums)}` : b)).join(" · ");
}

/** Sprungziel aus Eingabe: Seitennummer oder Blattlabel („4r“, „Bl. 13v“). */
export function resolvePage(data, input) {
  const s = String(input || "").trim().toLowerCase().replace(/^bl\.?\s*/, "").replace(/^s\.?\s*/, "");
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return data.pageByNumber.has(n) ? n : null;
  }
  const hit = data.pages.find((p) => p.label && p.label.toLowerCase() === s);
  return hit ? hit.pageNumber : null;
}

export function renderGallery(ctx) {
  const { data } = ctx;
  const structures = data.meta.structures;
  const sectionStart = new Map();
  for (const s of structures) if (!sectionStart.has(s.firstPage)) sectionStart.set(s.firstPage, s.label);

  const view = html`<div class="page">
    <div class="section-head" style="margin-top:0">
      <h2>Die Dresdner Bilderhandschrift</h2>
      <p>${data.pages.length} Seiten · Mscr.Dresd.M.32 · SLUB Dresden (IIIF)</p>
    </div>
    <p style="color:var(--text-2);max-width:80ch;margin-top:0">
      Digitalisat der Dresdner Bilderhandschrift des Sachsenspiegels (2. Viertel 14. Jh.). Die Bilder werden direkt vom IIIF-Server der SLUB geladen.
      Zugeordnete Artikel sind – soweit nicht anders vermerkt – nach Textmenge geschätzt und unverifiziert.
    </p>
    <form class="ms-toolbar" data-jump>
      <div class="pager-inline">
        <label for="jumpInput" class="visually-hidden">Zu Seite oder Blatt springen</label>
        <input id="jumpInput" placeholder="Seite oder Bl. (z. B. 15, 4r)" autocomplete="off" />
        <button class="btn btn--primary" type="submit">Öffnen</button>
      </div>
      ${structures
        .filter((s) => !/Einband/.test(s.label))
        .map((s) => html`<a class="chip chip--link" href="#manuscript" data-scroll-page="${s.firstPage}">${s.label.replace(/^Bl\. [^ ]+ (ff\. )?/, "")}</a>`)}
    </form>
    <div class="ms-grid">
      ${data.pages.map((p) => {
        const arts = articlesShort(data, p.pageNumber);
        return html`${sectionStart.has(p.pageNumber) ? html`<h3 class="ms-structure" id="sec-${p.pageNumber}">${sectionStart.get(p.pageNumber)}</h3>` : ""}
          <a class="ms-thumb" id="thumb-${p.pageNumber}" href="#page/${p.pageNumber}" aria-label="${altText(p)}${arts ? ", " + arts : ""}">
            <div class="ms-thumb__img"><img src="${p.thumbnailUrl}" alt="" loading="lazy" decoding="async" width="250" height="${Math.round((250 * p.height) / p.width)}" /></div>
            <div class="ms-thumb__body">
              <div class="ms-thumb__top"><b>${p.pageNumber}</b><span>${p.label ? `Bl. ${p.label}` : p.displayLabel}</span></div>
              <div class="ms-thumb__arts">${arts}</div>
            </div>
          </a>`;
      })}
    </div>
  </div>`;

  function mount(root) {
    $("[data-jump]", root).addEventListener("submit", (e) => {
      e.preventDefault();
      const n = resolvePage(data, $("#jumpInput", root).value);
      if (n) location.hash = `#page/${n}`;
      else toast("Seite nicht gefunden – Nummer 1–196 oder Blatt wie „4r“ eingeben");
    });
    root.addEventListener("click", (e) => {
      const c = e.target.closest("[data-scroll-page]");
      if (!c) return;
      e.preventDefault();
      $(`#sec-${c.dataset.scrollPage}`, root)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    const from = ctx.params.get("from");
    if (from) $(`#thumb-${from}`, root)?.scrollIntoView({ block: "center" });
    else window.scrollTo(0, 0);
  }
  return { html: view, mount, title: "Handschrift" };
}

export function renderPage(ctx, n) {
  const { data } = ctx;
  const p = data.pageByNumber.get(n);
  if (!p) return { html: html`<div class="page"><p class="notice">Seite ${n} gibt es nicht (1–${data.pages.length}). <a href="#manuscript">Zur Galerie</a></p></div>` };
  const prev = data.pageByNumber.get(n - 1);
  const next = data.pageByNumber.get(n + 1);
  const arts = data.articlesByPage.get(n) || [];
  const proj = data.projectAnnotations.filter((x) => x.target.pageNumber === n);
  const strip = data.pages.filter((x) => Math.abs(x.pageNumber - n) <= 8);

  const view = html`<div class="page">
    <div class="ms-toolbar">
      <a class="chip chip--link" href="#manuscript?from=${n}">← Galerie</a>
      <div class="pager-inline">
        <a class="btn btn--small" ${prev ? html`href="#page/${prev.pageNumber}"` : html`aria-disabled="true"`} rel="prev" aria-label="Vorherige Seite">‹ zurück</a>
        <form data-jump class="pager-inline">
          <label for="jumpPage" class="visually-hidden">Zu Seite oder Blatt springen</label>
          <input id="jumpPage" value="${n}" autocomplete="off" />
          <button class="btn btn--small" type="submit">Los</button>
        </form>
        <a class="btn btn--small" ${next ? html`href="#page/${next.pageNumber}"` : html`aria-disabled="true"`} rel="next" aria-label="Nächste Seite">weiter ›</a>
      </div>
      <a class="btn btn--small btn--ghost" href="${p.sachsenDigitalUrl}" target="_blank" rel="noopener">Quelle ↗</a>
    </div>
    <div class="viewer-layout">
      <div>
        <div class="viewer-stage" data-stage>
          <div class="viewer-controls">
            <button type="button" class="icon-btn" data-zoomin aria-label="Vergrößern" title="Vergrößern">＋</button>
            <button type="button" class="icon-btn" data-zoomout aria-label="Verkleinern" title="Verkleinern">－</button>
            <button type="button" class="icon-btn" data-home aria-label="Ganze Seite" title="Ganze Seite">⌂</button>
            <button type="button" class="icon-btn" data-full aria-label="Vollbild" title="Vollbild">⛶</button>
            <button type="button" class="icon-btn" data-draw aria-pressed="false" aria-label="Rechteck markieren" title="Rechteck markieren">▭</button>
          </div>
          <div class="viewer-label">${pageLabel(p)}</div>
          <div class="viewer-hint" data-hint hidden>Rechteck aufziehen · Esc bricht ab</div>
          <div class="osd-host" data-osd style="position:absolute;inset:0"></div>
        </div>
        <nav class="filmstrip" aria-label="Benachbarte Seiten">
          ${strip.map((x) => html`<a href="#page/${x.pageNumber}" class="${x.pageNumber === n ? "is-current" : ""}" aria-label="${altText(x)}" ${x.pageNumber === n ? html`aria-current="page"` : ""}><img src="${x.thumbnailUrl}" alt="" loading="lazy" /></a>`)}
        </nav>
      </div>
      <div class="viewer-side">
        <section class="side-card" aria-labelledby="pgH">
          <h2 id="pgH">Seite</h2>
          <p style="margin:0 0 6px"><b style="font-size:1.2rem">${p.pageNumber}</b> · ${p.label ? `Blatt ${p.label}` : p.displayLabel}</p>
          <p class="meta-source" style="margin:0">${p.sections.join(" · ") || "—"}</p>
          <div class="row" style="margin-top:10px">
            <a class="btn btn--small" href="${p.sachsenDigitalUrl}" target="_blank" rel="noopener">Quelle ↗ sachsen.digital</a>
          </div>
        </section>
        <section class="side-card" aria-labelledby="artsH">
          <h2 id="artsH">Zugeordnete Artikel</h2>
          ${arts.length
            ? html`<ul>${arts.map(
                ({ article: a, mapping }) => html`<li><a href="#article/${a.id}?page=${n}">${a.label}${a.title && a.status !== "missing" ? ` – ${a.title}` : ""}</a>
                  <span class="meta-source">${mapping.mappingStatus === "verified" ? "bestätigt" : mapping.method === "estimate-text-length" ? "geschätzt, unverifiziert" : "abgeglichen, unverifiziert"}</span></li>`
              )}</ul>`
            : html`<p class="meta-source" style="margin:0">Noch keine Artikel zugeordnet.</p>`}
        </section>
        ${proj.length
          ? html`<section class="side-card" aria-labelledby="projH">
              <h2 id="projH">Projekt-Markierungen</h2>
              <ol style="margin:0;padding-left:20px;display:grid;gap:4px;font-size:.88rem">
                ${proj.map((x) => html`<li><button type="button" class="link-btn" style="font-size:.88rem;text-align:left;padding:0" data-focus-region="${x.id}"><b>${x.title}</b></button><br /><span style="color:var(--text-2)">${x.text}</span></li>`)}
              </ol>
              <p class="meta-source">Nach dem Tafelbild „Die Heerschilde in der Dresdner Bilderhandschrift“. Vgl. <a href="#article/lr-i-3?s=2">LR I 3 § 2</a> und <a href="#context/heerschild">Schaubild A</a>.</p>
            </section>`
          : ""}
        <section class="side-card" aria-labelledby="notesH">
          <h2 id="notesH">Annotationen dieser Seite</h2>
          <div data-page-notes></div>
          <p class="meta-source">Tipp: Mit ▭ ein Rechteck auf dem Bild aufziehen, um z. B. Wappen oder Figuren im Bildstreifen zu markieren.</p>
        </section>
      </div>
    </div>
  </div>`;

  function mount(root) {
    const stage = $("[data-stage]", root);
    const host = $("[data-osd]", root);
    const drawBtn = $("[data-draw]", root);
    const hint = $("[data-hint]", root);
    const viewer = createViewer(host, {
      onRegionClick: (id) => {
        const el = root.querySelector(`[data-note-id="${CSS.escape(id)}"]`);
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        el?.animate?.([{ outline: "2px solid var(--accent)" }, { outline: "2px solid transparent" }], { duration: 1400 });
      },
      onDraw: (region) => openRegionForm(region),
      onDrawModeChange: (on) => {
        drawBtn.setAttribute("aria-pressed", String(on));
        hint.hidden = !on;
      },
    });
    const regions = () => [
      ...ctx.store.forPage(n).filter((x) => x.target.region).map((x, i) => ({ id: x.id, region: x.target.region, label: `N${i + 1}`, text: x.text, kind: "user" })),
      ...proj.map((x) => ({ id: x.id, region: x.target.region, label: x.label, title: `${x.title} ${x.text}`, kind: "project" })),
    ];
    viewer.setPage(p, regions());

    function renderNotes() {
      const pageOnly = noteBlock({ type: "page", pageNumber: n, canvasId: p.canvasId }, { addLabel: "Notiz zur Seite" });
      const sectionNotes = ctx.store.forPage(n).filter((x) => x.target.type !== "page");
      const regionNotes = ctx.store.forPage(n).filter((x) => x.target.type === "page" && x.target.region);
      $("[data-page-notes]", root).innerHTML = toHtml(html`
        ${regionNotes.length ? html`<p class="eyebrow" style="margin:0 0 6px">Markierungen</p><div class="notes" style="margin-bottom:10px">${regionNotes.map((x, i) => html`<div><span class="note__tag">N${i + 1}</span>${noteItem(x, { pageLink: false })}</div>`)}</div>` : ""}
        ${sectionNotes.length ? html`<p class="eyebrow" style="margin:0 0 6px">Notizen zu Paragraphen auf dieser Seite</p><div class="notes" style="margin-bottom:10px">${sectionNotes.map((x) => noteItem(x, { showTarget: true }))}</div>` : ""}
        ${pageOnly}`);
      viewer.setRegions(regions());
    }

    async function openRegionForm(region) {
      const res = await ctx.formDialog({
        title: "Markierung beschreiben",
        intro: `Rechteck auf ${pageLabel(p)} – z. B. „Wappen: schwarzer Adler auf Gold“.`,
        fields: [
          { name: "text", label: "Beschreibung", type: "textarea", required: true },
          { name: "tags", label: "Tags (optional, durch Komma getrennt)", type: "text" },
        ],
        submitLabel: "Markierung speichern",
      });
      if (!res) return;
      const { saved } = ctx.store.add({ target: { type: "page", pageNumber: n, canvasId: p.canvasId, region }, text: res.text, tags: ctx.store.parseTags(res.tags) });
      toast(saved ? "Markierung gespeichert" : "Markierung angelegt – Speichern im Browser nicht möglich", saved ? 2200 : 5000);
      renderNotes();
    }

    drawBtn.addEventListener("click", () => viewer.setDrawMode(!viewer.drawMode));
    $("[data-zoomin]", root).addEventListener("click", () => viewer.zoomIn());
    $("[data-zoomout]", root).addEventListener("click", () => viewer.zoomOut());
    $("[data-home]", root).addEventListener("click", () => viewer.home());
    $("[data-full]", root).addEventListener("click", () => viewer.toggleFullscreen(stage));
    if (!viewer.hasZoom) $$("[data-zoomin],[data-zoomout],[data-home]", root).forEach((b) => (b.disabled = true));
    root.addEventListener("click", (e) => {
      const f = e.target.closest("[data-focus-region]");
      if (f) viewer.focusRegion(f.dataset.focusRegion);
    });
    $("[data-jump]", root).addEventListener("submit", (e) => {
      e.preventDefault();
      const t = resolvePage(data, $("#jumpPage", root).value);
      if (t) location.hash = `#page/${t}`;
      else toast("Seite nicht gefunden");
    });
    const onKey = (e) => {
      if (e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape" && viewer.drawMode) viewer.setDrawMode(false);
      if (e.key === "ArrowLeft" && prev) location.hash = `#page/${prev.pageNumber}`;
      if (e.key === "ArrowRight" && next) location.hash = `#page/${next.pageNumber}`;
    };
    document.addEventListener("keydown", onKey);
    const offStore = ctx.store.onChange(() => viewer.setRegions(regions()));
    const onNotes = () => renderNotes();
    document.addEventListener("ssl:notes-changed", onNotes);
    renderNotes();
    $(".filmstrip .is-current", root)?.scrollIntoView({ inline: "center", block: "nearest" });
    const focusNote = ctx.params.get("note");
    if (focusNote) setTimeout(() => viewer.focusRegion(focusNote), 900);
    window.scrollTo(0, 0);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("ssl:notes-changed", onNotes);
      offStore();
      viewer.destroy();
    };
  }

  return { html: view, mount, title: `Handschrift · ${pageLabel(p)}` };
}
