// IIIF-Viewer auf Basis von OpenSeadragon (falls geladen), sonst einfaches Bild.
// Regionen werden als Anteile (0..1) der Bildfläche übergeben und als Overlays gezeigt.

import { esc } from "../util.js";

const OSD = () => window.OpenSeadragon;

export function altText(page) {
  return `Dresdner Bilderhandschrift des Sachsenspiegels, Seite ${page.pageNumber}${page.label ? ` (Bl. ${page.label})` : ` (${page.displayLabel})`}`;
}

/**
 * @param {HTMLElement} host  Container (position: relative; feste Höhe)
 * @param {object} opts { onRegionClick(id), onDraw(region) }
 */
export function createViewer(host, opts = {}) {
  host.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "osd-wrap";
  host.append(wrap);

  let page = null;
  let regions = [];
  let drawMode = false;
  let activeId = null;
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
      immediateRender: false,
      preserveImageSizeOnResize: true,
    });
    host._osd = osd; // für Diagnose im Browser
    osd.addHandler("open", () => renderOverlays());
    osd.addHandler("open-failed", () => {
      // IIIF-Info nicht erreichbar → einfaches Bild
      switchToFallback();
    });
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
    inner.style.cssText = "position:relative;max-width:100%;max-height:100%;height:100%;";
    const img = document.createElement("img");
    img.className = "viewer-fallback";
    img.decoding = "async";
    img.style.cssText = "height:100%;width:auto;max-width:100%;object-fit:contain;display:block;";
    inner.append(img);
    fallback.append(inner);
    wrap.append(fallback);
    fallback.inner = inner;
    fallback.img = img;
    img.addEventListener("load", renderOverlays);
    if (page) setPage(page, regions);
  }

  function setPage(p, regs = []) {
    page = p;
    regions = regs;
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", altText(p));
    if (osd) {
      osd.open(`${p.imageServiceUrl}/info.json`);
    } else if (fallback) {
      fallback.img.alt = altText(p);
      fallback.img.src = `${p.imageServiceUrl}/full/1000,/0/default.jpg`;
    }
  }

  function setRegions(regs) {
    regions = regs;
    renderOverlays();
  }

  function overlayEl(r) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `region-overlay${r.kind === "project" ? " region-overlay--project" : ""}${r.id === activeId ? " is-active" : ""}`;
    el.title = r.title || r.text || "Markierung";
    el.setAttribute("aria-label", `Markierung ${r.label || ""}: ${r.title || r.text || ""}`.trim());
    el.dataset.regionId = r.id;
    el.innerHTML = r.label ? `<span class="region-overlay__label">${esc(r.label)}</span>` : "";
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      highlight(r.id);
      opts.onRegionClick?.(r.id);
    });
    // OSD soll Klicks auf Overlays nicht als Drag werten
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    return el;
  }

  function renderOverlays() {
    if (osd) {
      osd.clearOverlays();
      const item = osd.world.getItemAt(0);
      if (!item) return;
      const size = item.getContentSize();
      for (const r of regions) {
        const g = r.region;
        const rect = osd.viewport.imageToViewportRectangle(new (OSD().Rect)(g.x * size.x, g.y * size.y, g.w * size.x, g.h * size.y));
        osd.addOverlay({ element: overlayEl(r), location: rect });
      }
    } else if (fallback) {
      fallback.inner.querySelectorAll(".region-overlay").forEach((n) => n.remove());
      for (const r of regions) {
        const el = overlayEl(r);
        const g = r.region;
        Object.assign(el.style, { position: "absolute", left: `${g.x * 100}%`, top: `${g.y * 100}%`, width: `${g.w * 100}%`, height: `${g.h * 100}%` });
        fallback.inner.append(el);
      }
    }
  }

  function highlight(id) {
    activeId = id;
    host.querySelectorAll(".region-overlay").forEach((n) => n.classList.toggle("is-active", n.dataset.regionId === id));
  }

  function focusRegion(id) {
    const r = regions.find((x) => x.id === id);
    if (!r) return;
    highlight(id);
    if (osd && osd.world.getItemAt(0)) {
      const size = osd.world.getItemAt(0).getContentSize();
      const g = r.region;
      const pad = 0.6;
      const rect = osd.viewport.imageToViewportRectangle(
        new (OSD().Rect)((g.x - g.w * pad) * size.x, (g.y - g.h * pad) * size.y, g.w * (1 + 2 * pad) * size.x, g.h * (1 + 2 * pad) * size.y)
      );
      osd.viewport.fitBoundsWithConstraints(rect);
    }
  }

  // ---------- Zeichnen ----------
  let drawStart = null;
  let drawRect = null;
  function toFraction(clientX, clientY) {
    const box = host.getBoundingClientRect();
    if (osd && osd.world.getItemAt(0)) {
      const pt = osd.viewport.viewerElementToImageCoordinates(new (OSD().Point)(clientX - box.left, clientY - box.top));
      const size = osd.world.getItemAt(0).getContentSize();
      return { x: pt.x / size.x, y: pt.y / size.y };
    }
    if (fallback) {
      const ib = fallback.img.getBoundingClientRect();
      return { x: (clientX - ib.left) / ib.width, y: (clientY - ib.top) / ib.height };
    }
    return null;
  }
  const clamp = (v) => Math.max(0, Math.min(1, v));
  function onDown(e) {
    if (!drawMode) return;
    e.preventDefault();
    host.setPointerCapture?.(e.pointerId);
    const box = host.getBoundingClientRect();
    drawStart = { cx: e.clientX, cy: e.clientY, x: e.clientX - box.left, y: e.clientY - box.top };
    drawRect = document.createElement("div");
    drawRect.className = "draw-rect";
    host.append(drawRect);
  }
  function onMove(e) {
    if (!drawMode || !drawStart || !drawRect) return;
    const box = host.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    Object.assign(drawRect.style, {
      left: `${Math.min(x, drawStart.x)}px`,
      top: `${Math.min(y, drawStart.y)}px`,
      width: `${Math.abs(x - drawStart.x)}px`,
      height: `${Math.abs(y - drawStart.y)}px`,
    });
  }
  function onUp(e) {
    if (!drawMode || !drawStart) return;
    const a = toFraction(drawStart.cx, drawStart.cy);
    const b = toFraction(e.clientX, e.clientY);
    drawRect?.remove();
    drawRect = null;
    drawStart = null;
    if (!a || !b) return;
    const x = clamp(Math.min(a.x, b.x));
    const y = clamp(Math.min(a.y, b.y));
    const w = clamp(Math.max(a.x, b.x)) - x;
    const h = clamp(Math.max(a.y, b.y)) - y;
    setDrawMode(false);
    if (w < 0.005 || h < 0.005) return;
    opts.onDraw?.({ x, y, w, h });
  }
  host.addEventListener("pointerdown", onDown, true);
  host.addEventListener("pointermove", onMove, true);
  host.addEventListener("pointerup", onUp, true);

  function setDrawMode(on) {
    drawMode = !!on;
    host.classList.toggle("is-drawing", drawMode);
    if (osd) osd.setMouseNavEnabled(!drawMode);
    opts.onDrawModeChange?.(drawMode);
  }

  return {
    setPage,
    setRegions,
    highlight,
    focusRegion,
    setDrawMode,
    get drawMode() {
      return drawMode;
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
