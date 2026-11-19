// Handschriften-Ausschnitt je Paragraph + Satzzuordnung Übertragung ↔ Original.
//
// Grundlage: textRegions (Zeichenbereich des Editionstextes je Zeile der Hs.) und
// data/line-regions.json (erkannte Zeilen). Beides ist geschätzt – die Satzmarkierung
// ist daher eine Näherung und wird in der Oberfläche so ausgewiesen.

import { esc } from "../util.js";
import { linesForPage } from "./viewer.js";

/** Satzgrenzen als Zeichenbereiche [{start, end}] (end exklusiv, ohne folgendes Leerzeichen). */
export function splitSentences(text, { strict = true } = {}) {
  const out = [];
  // Übertragung: Grenze nur vor Großbuchstaben/Anführung; Original: nach jedem Punkt.
  const re = strict ? /[.!?]["“”»«]?(?=\s+[„"«»(A-ZÄÖÜ])/g : /[.!?]["“”»«*]?(?=\s+\S)/g;
  let start = 0;
  let m;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    // Abkürzungen wie „N.“ oder „z. B.“ nicht als Satzende werten
    const word = text.slice(start, end).match(/(\S+)$/)?.[1] || "";
    if (/^(?:[A-ZÄÖÜ]|z\.\s?B|bzw|vgl|Art|S|Bl|Nr|ca)\.$/.test(word)) continue;
    if (end - start > 1) out.push({ start, end });
    start = end;
    while (start < text.length && /\s/.test(text[start])) start++;
  }
  if (start < text.length) out.push({ start, end: text.length });
  return out;
}

/**
 * Ordnet jedem Satz der Übertragung einen Zeichenbereich im Original zu.
 * Gleiche Satzzahl → 1:1. Sonst anteilig nach Textmenge, an Satz- bzw. Wortgrenzen ausgerichtet.
 */
export function alignSentences(trans, orig) {
  const T = splitSentences(trans, { strict: true });
  if (!T.length || !orig) return { exact: false, items: [] };
  const O = splitSentences(orig, { strict: false });
  if (O.length === T.length) return { exact: true, items: T.map((t, i) => ({ t, o: O[i] })) };
  const tl = trans.length;
  const ol = orig.length;
  const bounds = O.map((s) => s.end);
  const items = [];
  let prev = 0;
  T.forEach((t, i) => {
    let end = ol;
    if (i < T.length - 1) {
      const target = (t.end / tl) * ol;
      const near = bounds.filter((b) => b > prev + 3 && b < ol).sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
      if (near != null && Math.abs(near - target) < ol * 0.12) end = near;
      else {
        // nächste Wortgrenze
        let k = Math.max(prev + 1, Math.round(target));
        while (k < ol && !/\s/.test(orig[k])) k++;
        end = Math.min(k, ol);
      }
    }
    if (end <= prev) end = Math.min(ol, prev + 1);
    let start = prev;
    while (start < end && /\s/.test(orig[start])) start++;
    items.push({ t, o: { start, end } });
    prev = end;
  });
  return { exact: false, items };
}

/** Zeilen eines Paragraphen mit Rechteck (Seitenanteile) und Zeichenbereich, nach Seiten gruppiert. */
export function sectionLines(data, t) {
  const byPage = new Map();
  for (const n of new Set((t.textRegions || []).map((r) => r.pageNumber))) {
    const lines = linesForPage(data, n).filter((l) => l.sectionId === t.sectionId);
    if (lines.length) byPage.set(n, lines);
  }
  return byPage;
}

/** Rechtecke (Seitenanteile) für einen Zeichenbereich [a, b) des Editionstextes. */
export function rangeRects(lines, a, b) {
  const out = [];
  for (const l of lines) {
    if (l.to <= a || l.from >= b) continue;
    const span = Math.max(1, l.to - l.from);
    const f0 = (Math.max(a, l.from) - l.from) / span;
    const f1 = (Math.min(b, l.to) - l.from) / span;
    const [x, y, w, h] = l.rect;
    out.push([x + w * f0, y, Math.max(w * (f1 - f0), w * 0.04), h]);
  }
  return out;
}

/** HTML der Ausschnitte (eine Abbildung je Seite) für einen Paragraphen. */
export function cropHtml(data, t, byPage) {
  let out = "";
  for (const [n, lines] of byPage) {
    const p = data.pageByNumber.get(n);
    const reg = data.lineRegions?.[String(n)];
    if (!p || !reg) continue;
    const W = reg.width || p.width || 1000;
    const H = reg.height || p.height || 1400;
    const lh = lines.reduce((s, l) => s + l.rect[3], 0) / lines.length;
    const col = reg.column || [Math.min(...lines.map((l) => l.rect[0])), Math.max(...lines.map((l) => l.rect[0] + l.rect[2]))];
    const x0 = Math.max(0, col[0] - 0.015);
    const x1 = Math.min(1, col[1] + 0.015);
    const y0 = Math.max(0, Math.min(...lines.map((l) => l.rect[1])) - lh * 2.2);
    const y1 = Math.min(1, Math.max(...lines.map((l) => l.rect[1] + l.rect[3])) + lh * 2.2);
    const cx = x0 * W, cy = y0 * H, cw = (x1 - x0) * W, ch = (y1 - y0) * H;
    const mid = `cm-${t.sectionId}-${n}`.replace(/[^\w-]/g, "_");
    const pad = lh * H * 0.18;
    const holes = lines
      .map((l) => `<rect x="${l.rect[0] * W - pad}" y="${l.rect[1] * H - pad}" width="${l.rect[2] * W + 2 * pad}" height="${l.rect[3] * H + 2 * pad}" rx="4"/>`)
      .join("");
    out += `<figure class="ms-crop" data-page="${n}" style="aspect-ratio:${cw.toFixed(1)} / ${ch.toFixed(1)}">
      <img src="${esc(`${p.imageServiceUrl}/full/1000,/0/default.jpg`)}" alt="Ausschnitt ${esc(p.displayLabel || "S. " + n)}: Stelle des Paragraphen in der Handschrift" loading="lazy" decoding="async"
        style="width:${((W / cw) * 100).toFixed(3)}%;left:${((-cx / cw) * 100).toFixed(3)}%;top:${((-cy / ch) * 100).toFixed(3)}%" />
      <svg class="crop-svg" viewBox="${cx.toFixed(1)} ${cy.toFixed(1)} ${cw.toFixed(1)} ${ch.toFixed(1)}" aria-hidden="true">
        <defs><mask id="${mid}"><rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/><g fill="#000">${holes}</g></mask></defs>
        <rect class="crop-dim" x="0" y="0" width="${W}" height="${H}" mask="url(#${mid})"/>
        <g class="crop-sec">${holes}</g>
        <g class="crop-marks"></g>
      </svg>
      <a class="ms-crop__open" href="#page/${n}?s=${encodeURIComponent(t.sectionId)}" title="Seite im großen Handschriften-Viewer öffnen">${esc(p.displayLabel || "S. " + n)} ↗</a>
    </figure>`;
  }
  return out;
}

/** Gelbe Markierungen in die Ausschnitte eines Paragraphen zeichnen. */
export function paintCropMarks(row, byPage, range) {
  for (const fig of row.querySelectorAll(".ms-crop")) {
    const g = fig.querySelector(".crop-marks");
    const n = Number(fig.dataset.page);
    const reg = byPage.get(n);
    if (!g || !reg) continue;
    // Seitenmaße in Pixeln trägt das Abdunkelungs-Rechteck.
    const full = fig.querySelector(".crop-dim");
    const W = Number(full.getAttribute("width"));
    const H = Number(full.getAttribute("height"));
    const rects = range ? rangeRects(reg, range.start, range.end) : [];
    g.innerHTML = rects.map(([x, y, w, h]) => `<rect class="mk" x="${x * W}" y="${y * H - h * H * 0.15}" width="${w * W}" height="${h * H * 1.3}" rx="3"/>`).join("");
  }
}
