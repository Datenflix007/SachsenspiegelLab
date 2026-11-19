#!/usr/bin/env python3
"""
detect-lines.py – Zeilenerkennung für die Dresdner Bilderhandschrift.

Für jede Seite (IIIF-Bild, 1000 px breit) werden die Textspalte und die Textzeilen
geschätzt und als Anteile (0..1) der Bildbreite/-höhe nach data/line-regions.json geschrieben.

Verfahren (ohne OCR, nur Bildanalyse mit PIL + numpy):
  1. Tinte = Pixel deutlich dunkler als der Pergamentgrund, dazu rote Rubriken.
  2. Textspalte = zusammenhängender Bereich, dessen Zeilenprofil eine starke
     Periodizität (Zeilenabstand 20–48 px) zeigt; Bildstreifen sind aperiodisch.
  3. Zeilen = Läufe im horizontalen Projektionsprofil innerhalb der Spalte;
     zu hohe Läufe werden geteilt, zu flache verworfen.

Aufruf:
  python scripts/detect-lines.py <ordner-mit-pNNN.jpg> [--debug <ausgabeordner>] [--pages 15,16]

Die Bilder werden nicht ins Repository übernommen (lokal laden, z. B. über die
imageServiceUrl in data/manuscript-pages.json mit /full/full/0/default.jpg).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent


def smooth(a, k):
    if k <= 1:
        return a
    kernel = np.ones(k) / k
    return np.convolve(a, kernel, mode="same")


def ink_mask(img):
    rgb = np.asarray(img.convert("RGB"), dtype=np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    bg = np.median(lum)
    dark = lum < bg * 0.6
    red = (r - g > 45) & (r - b > 45) & (lum < bg * 0.9)
    return dark | red


def periodicity(profile):
    p = profile - profile.mean()
    denom = (p * p).sum()
    if denom <= 1e-6:
        return 0.0
    best = 0.0
    for lag in range(20, 49):
        c = (p[:-lag] * p[lag:]).sum() / denom
        best = max(best, c)
    return best


def find_column(ink, h, w):
    """Textspalte über die Seitengeometrie: scharfer rechter Rand (dahinter kaum Tinte),
    Breite ca. 28–42 % der Bildbreite, links ein tintenarmer Steg zum Bildstreifen."""
    body = ink[int(h * 0.03): int(h * 0.93)]
    dens = smooth(body.mean(axis=0), 15)
    cand = [x for x in range(int(w * 0.5), int(w * 0.97)) if dens[x] > 0.06]
    if not cand:
        return None
    right = cand[-1] + 4
    x0p = max(0, right - int(w * 0.30))
    prov = find_lines(ink, h, w, x0p, right)
    if len(prov) < 5:
        return None
    rows = np.zeros(h, dtype=bool)
    for _, a, _, b in prov:
        rows[a:b] = True
    cd = smooth(ink[rows].mean(axis=0), 9)
    lo, hi = max(0, right - int(w * 0.43)), max(1, right - int(w * 0.27))
    left = lo + int(np.argmin(cd[lo:hi]))
    return left, min(w, right)


def find_column_periodic(ink, h, w):
    # (ältere Variante, nicht mehr verwendet) Periodizität des Zeilenprofils
    body = ink[int(h * 0.03): int(h * 0.93)]
    step, win = 20, 50
    scores = []
    for x in range(0, w - win, step):
        prof = smooth(body[:, x:x + win].mean(axis=1), 3)
        dens = body[:, x:x + win].mean()
        scores.append((x, periodicity(prof) if 0.02 < dens < 0.35 else 0.0))
    if not scores:
        return None
    best = max(s for _, s in scores)
    if best < 0.25:
        return None
    good = [x for x, s in scores if s > best * 0.55]
    # größter zusammenhängender Block
    blocks, cur = [], [good[0]]
    for x in good[1:]:
        if x - cur[-1] <= step * 2:
            cur.append(x)
        else:
            blocks.append(cur)
            cur = [x]
    blocks.append(cur)
    blk = max(blocks, key=len)
    x0, x1 = blk[0], blk[-1] + win
    if x1 - x0 < w * 0.18:
        return None
    return max(0, x0 - 6), min(w, x1 + 6)


def find_lines(ink, h, w, x0, x1):
    col = ink[:, x0:x1]
    prof = smooth(col.mean(axis=1), 3)
    top, bottom = int(h * 0.02), int(h * 0.94)
    prof[:top] = 0
    prof[bottom:] = 0
    thr = max(0.02, np.percentile(prof[top:bottom], 90) * 0.32)
    on = prof > thr
    runs, start = [], None
    for y in range(h):
        if on[y] and start is None:
            start = y
        elif not on[y] and start is not None:
            runs.append([start, y])
            start = None
    # kleine Lücken schließen
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] <= 2:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    if not merged:
        return []
    heights = np.array([b - a for a, b in merged])
    med = float(np.median(heights[heights > 4])) if (heights > 4).any() else 18.0
    lines = []
    for a, b in merged:
        hgt = b - a
        if hgt < med * 0.45:
            continue
        n = int(round(hgt / (med * 1.15))) if hgt > med * 1.7 else 1
        for k in range(max(1, n)):
            ya = a + (hgt * k) // max(1, n)
            yb = a + (hgt * (k + 1)) // max(1, n)
            lines.append([ya, yb])
    # Abstand der Zeilen gleichmäßig auf Ober-/Unterlängen erweitern
    out = []
    for i, (a, b) in enumerate(lines):
        pad = max(2, int((b - a) * 0.25))
        a2, b2 = max(0, a - pad), min(h, b + pad)
        seg = col[a:b]
        xs = np.where(seg.mean(axis=0) > 0.02)[0]
        lx0 = x0 + (int(xs[0]) if xs.size else 0)
        lx1 = x0 + (int(xs[-1]) + 1 if xs.size else x1 - x0)
        if lx1 - lx0 < (x1 - x0) * 0.12:
            continue
        out.append([lx0, a2, lx1, b2, float(seg.mean()) if seg.size else 0.0])
    if len(out) >= 5:
        # Ausreißer: geringe Tintendichte oder deutlich abgesetzt am oberen/unteren Rand
        dens = np.array([o[4] for o in out])
        md = float(np.median(dens))
        out = [o for o in out if o[4] >= md * 0.4]
        if len(out) >= 5:
            mids = np.array([(o[1] + o[3]) / 2 for o in out])
            pitch = float(np.median(np.diff(mids)))
            while len(out) > 5 and (out[-1][1] + out[-1][3]) / 2 - (out[-2][1] + out[-2][3]) / 2 > pitch * 2.2:
                out.pop()
            while len(out) > 5 and (out[1][1] + out[1][3]) / 2 - (out[0][1] + out[0][3]) / 2 > pitch * 2.2:
                out.pop(0)
    return [o[:4] for o in out]


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    folder = Path(args[0])
    debug = Path(args[args.index("--debug") + 1]) if "--debug" in args else None
    only = None
    if "--pages" in args:
        only = {int(x) for x in args[args.index("--pages") + 1].split(",")}
    manifest = json.loads((ROOT / "data/manuscript-pages.json").read_text(encoding="utf8"))
    result = {}
    for p in manifest["pages"]:
        n = p["pageNumber"]
        if only and n not in only:
            continue
        f = folder / f"p{n}.jpg"
        if not f.exists():
            continue
        img = Image.open(f)
        w, h = img.size
        ink = ink_mask(img)
        col = find_column(ink, h, w)
        lines = find_lines(ink, h, w, *col) if col else []
        r4 = lambda v: round(v, 4)
        result[str(n)] = {
            "width": w,
            "height": h,
            "column": [r4(col[0] / w), r4(col[1] / w)] if col else None,
            "lines": [[r4(a / w), r4(b / h), r4((c - a) / w), r4((d - b) / h)] for a, b, c, d in lines],
        }
        if debug:
            debug.mkdir(parents=True, exist_ok=True)
            im = img.convert("RGB")
            dr = ImageDraw.Draw(im)
            if col:
                dr.rectangle([col[0], 0, col[1], h - 1], outline=(0, 160, 255), width=2)
            for i, (a, b, c, d) in enumerate(lines):
                dr.rectangle([a, b, c, d], outline=(255, 0, 0) if i % 2 else (0, 170, 0), width=2)
            im.thumbnail((700, 1000))
            im.save(debug / f"d{n}.jpg", quality=70)
        print(f"S. {n:3d}: Spalte {col}, {len(lines)} Zeilen", file=sys.stderr)
    if only:
        return
    out = {
        "_info": "Automatisch erkannte Textspalte und Zeilen je Seite (Anteile 0..1: x, y, w, h). "
        "Bildanalyse ohne OCR (scripts/detect-lines.py) – Näherung, nicht manuell geprüft.",
        "pages": result,
    }
    (ROOT / "data/line-regions.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf8")
    print(f"{len(result)} Seiten → data/line-regions.json", file=sys.stderr)


if __name__ == "__main__":
    main()
