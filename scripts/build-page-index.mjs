#!/usr/bin/env node
/**
 * build-page-index.mjs
 *
 * Liest das IIIF-Manifest (Presentation API 2) der Dresdner Bilderhandschrift
 * des Sachsenspiegels (SLUB Dresden, Mscr.Dresd.M.32) und erzeugt
 * data/manuscript-pages.json mit allen Seiten (Canvases).
 *
 * Aufruf: node scripts/build-page-index.mjs [lokale-manifest.json]
 *
 * Es werden keine Bilder heruntergeladen; die Bild-URLs zeigen direkt auf den
 * IIIF-Image-Service der SLUB.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_URL = "https://iiif.slub-dresden.de/iiif/2/272362328/manifest.json";
const OUT = resolve(ROOT, "data/manuscript-pages.json");
const WORK_URL = (n) => `https://sachsen.digital/werk/6439/${n}`;

async function loadManifest() {
  if (process.argv[2]) return JSON.parse(await readFile(process.argv[2], "utf8"));
  const res = await fetch(MANIFEST_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Manifest nicht ladbar: ${res.status}`);
  return res.json();
}

function sectionFor(structures, canvasId) {
  // Kleinster Strukturabschnitt, der die Seite enthält (ohne Gesamtwerk).
  const hits = (structures || [])
    .filter((s) => (s.canvases || []).includes(canvasId))
    .sort((a, b) => a.canvases.length - b.canvases.length);
  return hits.length && hits[0].canvases.length < 150 ? hits.map((h) => h.label).filter((l) => !/Bilderhandschrift/.test(l)) : [];
}

async function main() {
  const m = await loadManifest();
  const canvases = m.sequences?.[0]?.canvases || [];
  if (!canvases.length) throw new Error("Keine Canvases im Manifest gefunden");

  const pages = canvases.map((c, i) => {
    const pageNumber = i + 1;
    const rawLabel = String(c.label ?? "").replace(/^Seite\s*/, "").trim();
    const label = rawLabel && rawLabel !== "-" ? rawLabel : null;
    const service = c.images?.[0]?.resource?.service?.["@id"];
    if (!service) throw new Error(`Seite ${pageNumber}: kein Image-Service`);
    const sections = sectionFor(m.structures, c["@id"]);
    return {
      pageNumber,
      label,
      displayLabel: label ? `Bl. ${label}` : sections.find((s) => /Einband/.test(s)) || "ohne Blattzählung",
      canvasId: c["@id"],
      width: c.width,
      height: c.height,
      imageServiceUrl: service,
      thumbnailUrl: `${service}/full/250,/0/default.jpg`,
      previewUrl: `${service}/full/500,/0/default.jpg`,
      sachsenDigitalUrl: WORK_URL(pageNumber),
      sections,
    };
  });

  const structures = (m.structures || [])
    .filter((s) => (s.canvases || []).length && (s.canvases || []).length < canvases.length)
    .map((s) => {
      const nums = s.canvases.map((id) => canvases.findIndex((c) => c["@id"] === id) + 1).filter((n) => n > 0);
      return { label: s.label, firstPage: Math.min(...nums), lastPage: Math.max(...nums) };
    });

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(
    OUT,
    JSON.stringify(
      {
        title: typeof m.label === "string" ? m.label : "Die Dresdner Bilderhandschrift des Sachsenspiegels",
        manifestUrl: MANIFEST_URL,
        // Attribution kommt als HTML; nur Text übernehmen.
        attribution: String(m.attribution || "SLUB Dresden")
          .replace(/<br\s*\/?>/gi, " · ")
          .replace(/<[^>]+>/g, "")
          .replace(/(\s*·\s*)+/g, " · ")
          .replace(/^\s*·\s*|\s*·\s*$/g, "")
          .trim(),
        license: m.license || (/publicdomain\/mark\/1\.0/.test(m.attribution || "") ? "https://creativecommons.org/publicdomain/mark/1.0/" : null),
        workUrl: "https://sachsen.digital/werk/6439",
        generatedAt: new Date().toISOString(),
        pageCount: pages.length,
        structures,
        pages,
      },
      null,
      1
    ),
    "utf8"
  );
  console.log(`${pages.length} Seiten → ${OUT}`);
  for (const s of structures) console.log(`  ${s.label}: S. ${s.firstPage}–${s.lastPage}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
