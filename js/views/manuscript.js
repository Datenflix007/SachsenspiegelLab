// Ansicht „Handschrift“: Galerie aller Seiten + großer Viewer.

import { html, raw, toHtml, esc, $, $$, toast, compactRanges, storage } from "../util.js";
import { createViewer, altText, shapeOf, linesForPage } from "../components/viewer.js";
import { noteBlock, noteItem } from "../components/notes.js";
import { sanitizeHtml } from "../components/editor.js";
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

/** Alle Formen einer Seite aus den drei Ebenen (Eigene · Projekt · Importiert). */
export function shapesForPage(ctx, n) {
  const mk = (a, kind, i) => {
    const shape = shapeOf(a);
    if (!shape) return null;
    return {
      id: a.id,
      kind,
      shape,
      color: a.style?.color || (kind === "project" ? "#7dd3fc" : kind === "imported" ? "#c084fc" : "#fbbf24"),
      width: a.style?.width || 3,
      label: a.label || (kind === "user" ? `N${i + 1}` : kind === "imported" ? `I${i + 1}` : ""),
      title: a.title ? `${a.title} ${a.text || ""}` : a.text || "",
      ann: a,
    };
  };
  const own = ctx.store.forPage(n).filter((a) => a.target.region || a.target.shape);
  const proj = ctx.data.projectAnnotations.filter((a) => a.target.pageNumber === n);
  const imp = ctx.store.importedLayer().annotations.filter((a) => a.target?.pageNumber === n);
  return [...own.map((a, i) => mk(a, "user", i)), ...proj.map((a, i) => mk(a, "project", i)), ...imp.map((a, i) => mk(a, "imported", i))].filter(Boolean);
}

const LAYER_LABEL = { user: "Eigene", project: "Projekt (Repo)", imported: "Importiert" };

export function renderPage(ctx, n) {
  const { data } = ctx;
  const p = data.pageByNumber.get(n);
  if (!p) return { html: html`<div class="page"><p class="notice">Seite ${n} gibt es nicht (1–${data.pages.length}). <a href="#manuscript">Zur Galerie</a></p></div>` };
  const prev = data.pageByNumber.get(n - 1);
  const next = data.pageByNumber.get(n + 1);
  const arts = data.articlesByPage.get(n) || [];
  const strip = data.pages.filter((x) => Math.abs(x.pageNumber - n) <= 8);
  const secs = data.transcriptionsByPage.get(n) || [];
  const prefs = { text: true, opacity: 0.78, color: "#fbbf24", width: 3, user: true, project: true, imported: true, ...storage.get("ssl.viewer", {}) };

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

    <div class="tool-bar" role="toolbar" aria-label="Werkzeuge">
      <button type="button" class="tool-btn" data-toggle-text aria-pressed="${prefs.text}" title="Transkribierten Text über das Bild legen">¶ Text</button>
      <label title="Deckkraft der Textebene">Deckkraft <input type="range" min="0.15" max="1" step="0.05" value="${prefs.opacity}" data-opacity /></label>
      <span class="sep"></span>
      <button type="button" class="tool-btn" data-tool="" aria-pressed="true" title="Auswählen / verschieben">☚ Auswählen</button>
      <button type="button" class="tool-btn" data-tool="rect" aria-pressed="false" title="Rechteck zeichnen">▭ Rechteck</button>
      <button type="button" class="tool-btn" data-tool="line" aria-pressed="false" title="Linie zeichnen (z. B. Abschnitt markieren)">╱ Linie</button>
      <button type="button" class="tool-btn" data-tool="path" aria-pressed="false" title="Freihand zeichnen">✎ Freihand</button>
      <label title="Farbe">Farbe <input type="color" value="${prefs.color}" data-color /></label>
      <label title="Strichstärke">Stärke
        <select data-width>${[1, 2, 3, 4, 6, 8].map((w) => html`<option value="${w}" ${w === prefs.width ? html`selected` : ""}>${w}</option>`)}</select>
      </label>
      <span class="sep"></span>
      <span class="eyebrow" style="font-size:.68rem">Ebenen</span>
      ${["user", "project", "imported"].map((k) => html`<label><input type="checkbox" data-layer="${k}" ${prefs[k] ? html`checked` : ""} /> ${LAYER_LABEL[k]}</label>`)}
    </div>

    <div class="viewer-layout">
      <div>
        <div class="viewer-stage" data-stage>
          <div class="viewer-controls">
            <button type="button" class="icon-btn" data-zoomin aria-label="Vergrößern" title="Vergrößern">＋</button>
            <button type="button" class="icon-btn" data-zoomout aria-label="Verkleinern" title="Verkleinern">－</button>
            <button type="button" class="icon-btn" data-home aria-label="Ganze Seite" title="Ganze Seite">⌂</button>
            <button type="button" class="icon-btn" data-full aria-label="Vollbild" title="Vollbild">⛶</button>
          </div>
          <div class="viewer-label">${pageLabel(p)}</div>
          <div class="viewer-hint" data-hint hidden>Auf dem Bild zeichnen · Esc beendet</div>
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
          <p class="meta-source" style="margin:0">${p.sections.join(" · ") || "—"} · ${(data.lineRegions[String(n)]?.lines || []).length} Zeilen erkannt</p>
          <div class="row" style="margin-top:10px"><a class="btn btn--small" href="${p.sachsenDigitalUrl}" target="_blank" rel="noopener">Quelle ↗ sachsen.digital</a></div>
        </section>
        <section class="side-card" aria-labelledby="txtH">
          <h2 id="txtH">Text auf dieser Seite</h2>
          ${secs.length
            ? html`<ul style="list-style:none;padding:0;display:grid;gap:2px">${secs.map((t) => {
                const a = data.articleById.get(t.articleId);
                return html`<li><button type="button" class="link-btn" style="font-size:.88rem;text-align:left" data-sec-pick="${t.sectionId}">${a.label} § ${t.section}${a.title ? ` – ${a.title}` : ""}</button></li>`;
              })}</ul>
              <div data-sec-detail></div>
              <p class="meta-source">Zeilenzuordnung automatisch geschätzt (Zeilenerkennung + Textmenge); Text nach Lübben 1879, nicht der Wortlaut dieser Handschrift.</p>`
            : html`<p class="meta-source" style="margin:0">Für diese Seite ist noch kein Text zugeordnet.</p>`}
          ${arts.length && !secs.length ? html`<ul>${arts.map(({ article: a }) => html`<li><a href="#article/${a.id}?page=${n}">${a.label}</a></li>`)}</ul>` : ""}
        </section>
        <section class="side-card" aria-labelledby="glH">
          <h2 id="glH">Glossen &amp; Markierungen</h2>
          <div data-glosses class="notes"></div>
          <p class="meta-source">Mit ▭ ╱ ✎ auf dem Bild zeichnen; danach eine Glosse im Editor schreiben. Farbe und Stärke in der Werkzeugleiste.</p>
        </section>
        <section class="side-card" aria-labelledby="notesH">
          <h2 id="notesH">Notizen zur Seite</h2>
          <div data-page-notes></div>
        </section>
      </div>
    </div>
  </div>`;

  function mount(root) {
    const stage = $("[data-stage]", root);
    const host = $("[data-osd]", root);
    const hint = $("[data-hint]", root);
    const savePrefs = () => storage.set("ssl.viewer", prefs);
    let activeGloss = null;

    const viewer = createViewer(host, {
      onShapeClick: (id) => selectGloss(id, false),
      onLineClick: (sid) => showSection(sid, false),
      onDraw: (shape, style) => createShape(shape, style),
      onToolChange: (t) => {
        $$("[data-tool]", root).forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.tool || null) === t)));
        hint.hidden = !t;
      },
      onOpen: () => {
        const s = ctx.params.get("s");
        if (s) showSection(s, true);
        const note = ctx.params.get("note");
        if (note) setTimeout(() => selectGloss(note, true), 300);
      },
    });
    const layers = () => ({ lines: linesForPage(data, n), shapes: shapesForPage(ctx, n) });
    viewer.setPage(p, layers());
    viewer.setVisibility({ text: prefs.text, user: prefs.user, project: prefs.project, imported: prefs.imported });
    viewer.setTextOpacity(prefs.opacity);
    viewer.setStyle({ color: prefs.color, width: prefs.width });

    function showSection(sid, focus) {
      const t = data.sectionById.get(sid);
      if (!t) return;
      viewer.highlightSection(sid, { focus });
      const a = data.articleById.get(t.articleId);
      $$("[data-sec-pick]", root).forEach((b) => b.classList.toggle("is-active", b.dataset.secPick === sid));
      const box = $("[data-sec-detail]", root);
      if (box)
        box.innerHTML = toHtml(html`<div class="card" style="margin-top:8px;padding:10px 12px">
          <b>${a.label} § ${t.section}</b>${a.title ? html` · ${a.title}` : ""}
          <p class="src-text" style="font-size:1rem;margin:6px 0">${t.plainText}</p>
          <p style="margin:6px 0;font-size:.92rem">${t.translation}</p>
          <a class="btn btn--small" href="#article/${a.id}?s=${t.section}&page=${n}">Im Artikel öffnen</a>
        </div>`);
    }

    function glossCard(s) {
      const a = s.ann;
      const own = s.kind === "user";
      const body = a.html ? raw(sanitizeHtml(a.html)) : a.title ? html`<b>${a.title}</b><br />${a.text}` : a.text;
      return html`<article class="gloss${s.id === activeGloss ? " is-active" : ""}" style="--gloss-color:${s.color}" data-gloss="${s.id}" tabindex="0">
        <div class="gloss__head">
          <span class="layer-chip">${LAYER_LABEL[s.kind]}</span>
          ${s.label ? html`<b>${s.label}</b>` : ""}
          <span>${{ rect: "Rechteck", line: "Linie", path: "Freihand" }[s.shape.type]}</span>
          <span style="flex:1"></span>
          ${own ? html`<button type="button" class="link-btn" data-gloss-edit="${s.id}">Bearbeiten</button><button type="button" class="link-btn link-btn--danger" data-gloss-del="${s.id}">Löschen</button>` : html`<button type="button" class="link-btn" data-gloss-copy="${s.id}" title="Als eigene Glosse übernehmen">Übernehmen</button>`}
        </div>
        <div class="gloss__body">${body || html`<span class="empty-text">(ohne Text)</span>`}</div>
        ${a.tags?.length ? html`<div class="note__foot">${a.tags.map((t) => html`<span class="note__tag">#${t}</span>`)}</div>` : ""}
      </article>`;
    }

    function renderSide() {
      const top = (s) => Math.min(...s.shape.points.map((q) => q[1]));
      const shapes = shapesForPage(ctx, n).sort((x, y) => top(x) - top(y));
      $("[data-glosses]", root).innerHTML = shapes.length ? toHtml(shapes.map(glossCard)) : `<p class="meta-source" style="margin:0">Noch keine Markierungen auf dieser Seite.</p>`;
      $("[data-page-notes]", root).innerHTML = toHtml(noteBlock({ type: "page", pageNumber: n, canvasId: p.canvasId }, { addLabel: "Notiz zur Seite" }));
      viewer.setLayers(layers());
    }

    function selectGloss(id, focus) {
      activeGloss = id;
      $$("[data-gloss]", root).forEach((g) => g.classList.toggle("is-active", g.dataset.gloss === id));
      $(`[data-gloss="${CSS.escape(id)}"]`, root)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (focus) viewer.focusShape(id);
      else viewer.highlightShape(id);
    }

    function glossDialog(title, a = {}, style) {
      return ctx.formDialog({
        title,
        intro: `${pageLabel(p)} – Glosse oder Anmerkung zur Markierung.`,
        fields: [
          { name: "html", label: "Glosse", type: "editor", value: a.html || esc(a.text || "") },
          { name: "tags", label: "Tags (optional, durch Komma getrennt)", type: "text", value: (a.tags || []).join(", ") },
          { name: "color", label: "Farbe", type: "color", value: style?.color || a.style?.color || prefs.color },
        ],
        submitLabel: "Speichern",
      });
    }

    async function createShape(shape, style) {
      viewer.setTool(null);
      const res = await glossDialog("Markierung beschreiben", {}, style);
      if (!res) return;
      const target = { type: "page", pageNumber: n, canvasId: p.canvasId, shape };
      if (shape.type === "rect") {
        const [[x1, y1], [x2, y2]] = shape.points;
        target.region = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      }
      const { annotation, saved } = ctx.store.add({ target, text: res.text || "Markierung", html: res.html, tags: ctx.store.parseTags(res.tags), style: { ...style, color: res.color || style.color } });
      toast(saved ? "Markierung gespeichert" : "Markierung angelegt – Speichern im Browser nicht möglich (Export nutzen)", saved ? 2000 : 5000);
      activeGloss = annotation.id;
      renderSide();
    }

    root.addEventListener("click", async (e) => {
      const tb = e.target.closest("[data-tool]");
      if (tb) return viewer.setTool(tb.dataset.tool || null, { color: prefs.color, width: prefs.width });
      const pick = e.target.closest("[data-sec-pick]");
      if (pick) return showSection(pick.dataset.secPick, true);
      const ed = e.target.closest("[data-gloss-edit]");
      if (ed) {
        const a = ctx.store.all().find((x) => x.id === ed.dataset.glossEdit);
        if (!a) return;
        const res = await glossDialog("Glosse bearbeiten", a);
        if (!res) return;
        ctx.store.update(a.id, { text: res.text || "Markierung", html: res.html, tags: ctx.store.parseTags(res.tags), style: { color: res.color, width: a.style?.width || prefs.width } });
        return renderSide();
      }
      const del = e.target.closest("[data-gloss-del]");
      if (del) {
        if (!confirm("Diese Markierung samt Glosse löschen?")) return;
        ctx.store.remove(del.dataset.glossDel);
        return renderSide();
      }
      const cp = e.target.closest("[data-gloss-copy]");
      if (cp) {
        const s = shapesForPage(ctx, n).find((x) => x.id === cp.dataset.glossCopy);
        if (!s) return;
        ctx.store.add({
          target: { type: "page", pageNumber: n, canvasId: p.canvasId, shape: s.shape, ...(s.ann.target.region ? { region: s.ann.target.region } : {}) },
          text: [s.ann.title, s.ann.text].filter(Boolean).join(" ") || "Markierung",
          html: s.ann.html,
          tags: s.ann.tags || [],
          style: { color: s.color, width: s.width },
        });
        toast("Als eigene Glosse übernommen");
        return renderSide();
      }
      const g = e.target.closest("[data-gloss]");
      if (g && !e.target.closest("button, a")) selectGloss(g.dataset.gloss, true);
    });
    root.addEventListener("keydown", (e) => {
      const g = e.target.closest?.("[data-gloss]");
      if (g && e.key === "Enter") selectGloss(g.dataset.gloss, true);
    });

    const textBtn = $("[data-toggle-text]", root);
    textBtn.addEventListener("click", () => {
      prefs.text = !prefs.text;
      textBtn.setAttribute("aria-pressed", String(prefs.text));
      viewer.setVisibility({ text: prefs.text });
      savePrefs();
    });
    $("[data-opacity]", root).addEventListener("input", (e) => {
      prefs.opacity = Number(e.target.value);
      viewer.setTextOpacity(prefs.opacity);
      savePrefs();
    });
    $("[data-color]", root).addEventListener("input", (e) => {
      prefs.color = e.target.value;
      viewer.setStyle({ color: prefs.color });
      savePrefs();
    });
    $("[data-width]", root).addEventListener("change", (e) => {
      prefs.width = Number(e.target.value);
      viewer.setStyle({ width: prefs.width });
      savePrefs();
    });
    $$("[data-layer]", root).forEach((c) =>
      c.addEventListener("change", () => {
        prefs[c.dataset.layer] = c.checked;
        viewer.setVisibility({ [c.dataset.layer]: c.checked });
        savePrefs();
      })
    );

    $("[data-zoomin]", root).addEventListener("click", () => viewer.zoomIn());
    $("[data-zoomout]", root).addEventListener("click", () => viewer.zoomOut());
    $("[data-home]", root).addEventListener("click", () => viewer.home());
    $("[data-full]", root).addEventListener("click", () => viewer.toggleFullscreen(stage));
    if (!viewer.hasZoom) $$("[data-zoomin],[data-zoomout],[data-home]", root).forEach((b) => (b.disabled = true));
    $("[data-jump]", root).addEventListener("submit", (e) => {
      e.preventDefault();
      const t = resolvePage(data, $("#jumpPage", root).value);
      if (t) location.hash = `#page/${t}`;
      else toast("Seite nicht gefunden");
    });
    const onKey = (e) => {
      if (e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape" && viewer.tool) viewer.setTool(null);
      if (e.key === "ArrowLeft" && prev && !viewer.tool) location.hash = `#page/${prev.pageNumber}`;
      if (e.key === "ArrowRight" && next && !viewer.tool) location.hash = `#page/${next.pageNumber}`;
    };
    document.addEventListener("keydown", onKey);
    const offStore = ctx.store.onChange(() => viewer.setLayers(layers()));
    const onNotes = () => renderSide();
    document.addEventListener("ssl:notes-changed", onNotes);
    renderSide();
    $(".filmstrip .is-current", root)?.scrollIntoView({ inline: "center", block: "nearest" });
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
