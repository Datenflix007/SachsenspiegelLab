// IIIF-Viewer auf Basis von OpenSeadragon (falls geladen), sonst einfaches Bild.
//
// Über dem Bild liegt EINE SVG-Ebene in Bildpixeln (viewBox = Bildgröße). Sie skaliert mit dem Zoom und enthält
//   • Textzeilen  (transkribierter Text an den erkannten Zeilenpositionen, transparent, anklickbar)
//   • Formen      (Annotationen: Rechteck, Linie, Freihand; Ebenen „Projekt“, „Importiert“, „Eigene“)
//   • Zeichenvorschau
// Alle Koordinaten werden als Anteile 0..1 übergeben.

import { esc } from "../util.js";

const OSD = () => window.OpenSeadragon;
const SVGNS = "http://www.w3.org/2000/svg";

export function altText(page) {
  return `Dresdner Bilderhandschrift des Sachsenspiegels, Seite ${page.pageNumber}${page.label ? ` (Bl. ${page.label})` : ` (${page.displayLabel})`}`;
}

/** Formen aus einer Annotation (v1-Region oder v2-Shape) als Punktliste. */
export function shapeOf(a) {
  if (a.target?.shape) return a.target.shape;
  const r = a.target?.region;
  if (r) return { type: "rect", points: [[r.x, r.y], [r.x + r.w, r.y + r.h]] };
  return null;
}

/**
 * @param {HTMLElement} host Container mit fester Höhe
 * @param {object} opts { onShapeClick(id), onLineClick(sectionId), onDraw(shape), onToolChange(tool) }
 */
export function createViewer(host, opts = {}) {
  host.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "osd-wrap";
  host.append(wrap);

  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("class", "ov-svg no-text");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "false");

  let page = null;
  let layers = { lines: [], shapes: [] };
  let vis = { text: false, user: true, project: true, imported: true };
  let opacity = 0.78;
  let size = { x: 1000, y: 1317 };
  let hlSection = null;
  let activeShape = null;
  let tool = null;
  let style = { color: "#fbbf24", width: 3 };
  let osd = null;
  let fallback = null;

  if (OSD()) {
    osd = OSD()({
      element: wrap,
      showNavigationControl: false,
      gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
      gestureSettingsTouch: { pinchRotate: false },
      maxZoomPixelRatio: 3,
      minZoomImageRatio: 0.8,
      visibilityRatio: 0.6,
      crossOriginPolicy: "Anonymous",
      animationTime: 0.5,
      springStiffness: 9,
      preserveImageSizeOnResize: true,
    });
    host._osd = osd; // Diagnose
    osd.addHandler("open", () => {
      const item = osd.world.getItemAt(0);
      size = item.getContentSize();
      osd.clearOverlays();
      osd.addOverlay({ element: svg, location: item.getBounds() });
      render();
      opts.onOpen?.();
    });
    osd.addHandler("open-failed", () => switchToFallback());
  } else {
    switchToFallback();
  }

  function switchToFallback() {
    if (osd) {
      try {
        osd.destroy();
      } catch {}
      osd = null;
    }
    wrap.innerHTML = "";
    fallback = document.createElement("div");
    fallback.style.cssText = "position:absolute;inset:0;display:grid;place-items:center;";
    const inner = document.createElement("div");
    inner.style.cssText = "position:relative;height:100%;max-width:100%;";
    const img = document.createElement("img");
    img.className = "viewer-fallback";
    img.decoding = "async";
    img.style.cssText = "height:100%;width:auto;max-width:100%;object-fit:contain;display:block;";
    svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
    inner.append(img, svg);
    fallback.append(inner);
    wrap.append(fallback);
    fallback.img = img;
    img.addEventListener("load", () => {
      size = { x: img.naturalWidth, y: img.naturalHeight };
      render();
      opts.onOpen?.();
    });
    if (page) setPage(page, layers);
  }

  function setPage(p, l = layers) {
    page = p;
    layers = l;
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", altText(p));
    if (osd) osd.open(`${p.imageServiceUrl}/info.json`);
    else if (fallback) {
      fallback.img.alt = altText(p);
      fallback.img.src = `${p.imageServiceUrl}/full/1000,/0/default.jpg`;
    }
  }

  // ---------- Rendering ----------
  const X = (v) => v * size.x;
  const Y = (v) => v * size.y;
  const unit = () => size.x / 1000;

  function render() {
    svg.setAttribute("viewBox", `0 0 ${size.x} ${size.y}`);
    svg.classList.toggle("no-text", !vis.text);
    svg.style.setProperty("--tl-opacity", String(opacity));
    let out = "";
    // Textzeilen
    out += `<g class="tl-layer">`;
    for (const ln of layers.lines || []) {
      const [x, y, w, h] = ln.rect;
      const fs = Y(h) * 0.58;
      const hl = ln.sectionId === hlSection ? " is-hl" : "";
      out += `<g class="tl${hl}" data-sec="${esc(ln.sectionId)}" tabindex="-1"><title>${esc(ln.label || "")}</title>
        <rect class="tl-bg" x="${X(x)}" y="${Y(y)}" width="${X(w)}" height="${Y(h)}" rx="${3 * unit()}"/>
        ${ln.text ? `<text class="tl-text" x="${X(x) + 2 * unit()}" y="${Y(y) + Y(h) * 0.72}" font-size="${fs}" ${ln.text.length >= 28 || ln.partial ? `textLength="${Math.max(10, X(w) - 4 * unit())}" lengthAdjust="spacingAndGlyphs"` : ""}>${esc(ln.text)}</text>` : ""}
      </g>`;
    }
    out += `</g><g class="sh-layer">`;
    // Formen
    for (const s of layers.shapes || []) {
      if (!vis[s.kind]) continue;
      const pts = s.shape.points.map(([px, py]) => [X(px), Y(py)]);
      const color = s.color || (s.kind === "project" ? "#7dd3fc" : "#fbbf24");
      const sw = s.width || 3;
      const act = s.id === activeShape ? " is-active" : "";
      let geom = "";
      if (s.shape.type === "rect") {
        const [[x1, y1], [x2, y2]] = pts;
        const a = `x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}" rx="${3 * unit()}"`;
        geom = `<rect ${a} class="sh-fill" style="fill:${color}"/><rect ${a} class="sh-stroke" style="stroke:${color};stroke-width:${sw}"/><rect ${a} class="sh-hit"/>`;
      } else {
        const tag = s.shape.type === "line" ? "line" : "polyline";
        const g =
          tag === "line"
            ? `x1="${pts[0][0]}" y1="${pts[0][1]}" x2="${pts[pts.length - 1][0]}" y2="${pts[pts.length - 1][1]}"`
            : `points="${pts.map((p) => p.join(",")).join(" ")}"`;
        geom = `<${tag} ${g} class="sh-stroke" style="stroke:${color};stroke-width:${sw}"/><${tag} ${g} class="sh-hit sh-hit--line"/>`;
      }
      const [lx, ly] = pts[0];
      const label = s.label
        ? `<g class="sh-label"><rect x="${lx - 2 * unit()}" y="${ly - 20 * unit()}" width="${(String(s.label).length * 7 + 10) * unit()}" height="${17 * unit()}" rx="${3 * unit()}" style="fill:${color}"/><text x="${lx + 3 * unit()}" y="${ly - 7 * unit()}" font-size="${12 * unit()}">${esc(s.label)}</text></g>`
        : "";
      out += `<g class="sh sh--${s.kind}${act}" data-shape="${esc(s.id)}" role="button" tabindex="0" aria-label="${esc(`Markierung ${s.label || ""}: ${s.title || ""}`)}"><title>${esc(s.title || "")}</title>${geom}${label}</g>`;
    }
    out += `</g><g class="draw-layer"></g>`;
    svg.innerHTML = out;
  }

  svg.addEventListener("pointerdown", (e) => {
    if (tool) return;
    if (e.target.closest(".sh, .tl")) e.stopPropagation(); // kein Pan beim Anklicken
  });
  svg.addEventListener("click", (e) => {
    if (tool) return;
    const sh = e.target.closest(".sh");
    if (sh) {
      e.stopPropagation();
      highlightShape(sh.dataset.shape);
      opts.onShapeClick?.(sh.dataset.shape);
      return;
    }
    const tl = e.target.closest(".tl");
    if (tl && (vis.text || tl.classList.contains("is-hl"))) {
      e.stopPropagation();
      highlightSection(tl.dataset.sec, { focus: false });
      opts.onLineClick?.(tl.dataset.sec);
    }
  });
  svg.addEventListener("keydown", (e) => {
    const sh = e.target.closest(".sh");
    if (sh && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      highlightShape(sh.dataset.shape);
      opts.onShapeClick?.(sh.dataset.shape);
    }
  });

  function highlightShape(id) {
    activeShape = id;
    svg.querySelectorAll(".sh").forEach((n) => n.classList.toggle("is-active", n.dataset.shape === id));
  }

  function fitTo(points, pad = 0.5) {
    if (!osd || !osd.world.getItemAt(0) || !points.length) return;
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = Math.max(x1 - x0, 0.05), h = Math.max(y1 - y0, 0.03);
    const rect = osd.viewport.imageToViewportRectangle(
      new (OSD().Rect)((x0 - w * pad) * size.x, (y0 - h * pad) * size.y, w * (1 + 2 * pad) * size.x, h * (1 + 2 * pad) * size.y)
    );
    osd.viewport.fitBoundsWithConstraints(rect);
  }

  function highlightSection(id, { focus = true } = {}) {
    hlSection = id;
    svg.querySelectorAll(".tl").forEach((n) => n.classList.toggle("is-hl", n.dataset.sec === id));
    if (focus) {
      const lines = (layers.lines || []).filter((l) => l.sectionId === id);
      if (lines.length) fitTo(lines.flatMap((l) => [[l.rect[0], l.rect[1]], [l.rect[0] + l.rect[2], l.rect[1] + l.rect[3]]]), 0.35);
    }
  }

  function focusShape(id) {
    const s = (layers.shapes || []).find((x) => x.id === id);
    if (!s) return;
    highlightShape(id);
    fitTo(s.shape.points, 0.6);
  }

  // ---------- Zeichnen ----------
  let drawing = null;
  function toFraction(clientX, clientY) {
    const box = host.getBoundingClientRect();
    if (osd && osd.world.getItemAt(0)) {
      const pt = osd.viewport.viewerElementToImageCoordinates(new (OSD().Point)(clientX - box.left, clientY - box.top));
      return [clamp(pt.x / size.x), clamp(pt.y / size.y)];
    }
    if (fallback) {
      const ib = fallback.img.getBoundingClientRect();
      return [clamp((clientX - ib.left) / ib.width), clamp((clientY - ib.top) / ib.height)];
    }
    return null;
  }
  const clamp = (v) => Math.max(0, Math.min(1, v));
  function preview() {
    const g = svg.querySelector(".draw-layer");
    if (!g || !drawing) return;
    const pts = drawing.points.map(([x, y]) => [X(x), Y(y)]);
    const st = `stroke:${style.color};stroke-width:${style.width}`;
    if (tool === "rect") {
      const [[x1, y1], [x2, y2]] = [pts[0], pts[pts.length - 1]];
      g.innerHTML = `<rect class="sh-stroke" style="${st}" x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}"/>`;
    } else if (tool === "line") {
      g.innerHTML = `<line class="sh-stroke" style="${st}" x1="${pts[0][0]}" y1="${pts[0][1]}" x2="${pts[pts.length - 1][0]}" y2="${pts[pts.length - 1][1]}"/>`;
    } else {
      g.innerHTML = `<polyline class="sh-stroke" style="${st}" points="${pts.map((p) => p.join(",")).join(" ")}"/>`;
    }
  }
  function onDown(e) {
    if (!tool || e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    host.setPointerCapture?.(e.pointerId);
    const p = toFraction(e.clientX, e.clientY);
    if (!p) return;
    drawing = { points: [p, p] };
    preview();
  }
  function onMove(e) {
    if (!tool || !drawing) return;
    const p = toFraction(e.clientX, e.clientY);
    if (!p) return;
    if (tool === "path") {
      const last = drawing.points[drawing.points.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.002) drawing.points.push(p);
    } else drawing.points[1] = p;
    preview();
  }
  function onUp() {
    if (!tool || !drawing) return;
    let pts = drawing.points;
    drawing = null;
    const g = svg.querySelector(".draw-layer");
    if (g) g.innerHTML = "";
    if (tool !== "path") pts = [pts[0], pts[pts.length - 1]];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    if (Math.max(...xs) - Math.min(...xs) < 0.004 && Math.max(...ys) - Math.min(...ys) < 0.004) return;
    if (tool === "rect") pts = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
    if (pts.length > 4000) pts = pts.filter((_, i) => i % Math.ceil(pts.length / 4000) === 0);
    opts.onDraw?.({ type: tool, points: pts }, { ...style });
  }
  host.addEventListener("pointerdown", onDown, true);
  host.addEventListener("pointermove", onMove, true);
  host.addEventListener("pointerup", onUp, true);

  function setTool(t, st) {
    tool = t || null;
    if (st) style = { ...style, ...st };
    host.classList.toggle("is-drawing", !!tool);
    if (osd) osd.setMouseNavEnabled(!tool);
    opts.onToolChange?.(tool);
  }

  return {
    setPage,
    setLayers(l) {
      layers = { ...layers, ...l };
      render();
    },
    setVisibility(v) {
      vis = { ...vis, ...v };
      render();
    },
    setTextOpacity(o) {
      opacity = o;
      svg.style.setProperty("--tl-opacity", String(o));
    },
    setStyle(st) {
      style = { ...style, ...st };
    },
    highlightSection,
    highlightShape,
    focusShape,
    setTool,
    get tool() {
      return tool;
    },
    get hasZoom() {
      return !!osd;
    },
    zoomIn: () => osd?.viewport.zoomBy(1.4),
    zoomOut: () => osd?.viewport.zoomBy(1 / 1.4),
    home: () => osd?.viewport.goHome(),
    toggleFullscreen(target = host.parentElement || host) {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else target.requestFullscreen?.().catch(() => {});
    },
    destroy() {
      host.removeEventListener("pointerdown", onDown, true);
      host.removeEventListener("pointermove", onMove, true);
      host.removeEventListener("pointerup", onUp, true);
      try {
        osd?.destroy();
      } catch {}
      host.innerHTML = "";
    },
  };
}

/** Textzeilen einer Seite aus den Transkriptionen bauen. */
export function linesForPage(data, pageNumber) {
  const regions = data.lineRegions?.[String(pageNumber)]?.lines || [];
  const byLine = new Map();
  for (const t of data.transcriptionsByPage.get(pageNumber) || []) {
    const a = data.articleById.get(t.articleId);
    for (const r of t.textRegions) {
      if (r.pageNumber !== pageNumber || !regions[r.line]) continue;
      if (!byLine.has(r.line)) byLine.set(r.line, []);
      byLine.get(r.line).push({
        sectionId: t.sectionId,
        articleId: t.articleId,
        text: t.plainText.slice(r.from, r.to).trim(),
        label: `${a?.label || t.articleId} § ${t.section} (Zuordnung geschätzt)`,
        order: (data.articleIndex.get(t.articleId) ?? 0) * 100 + t.section,
      });
    }
  }
  // Teilen sich mehrere §§ eine Zeile, wird die Zeile anteilig nach Textlänge aufgeteilt.
  const out = [];
  for (const [line, items] of byLine) {
    items.sort((a, b) => a.order - b.order);
    const [x, y, w, h] = regions[line];
    const total = items.reduce((n, it) => n + Math.max(1, it.text.length), 0);
    let cx = x;
    for (const it of items) {
      const iw = (w * Math.max(1, it.text.length)) / total;
      out.push({ ...it, rect: [cx, y, iw, h], partial: items.length > 1 });
      cx += iw;
    }
  }
  return out;
}
