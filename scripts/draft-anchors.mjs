#!/usr/bin/env node
/**
 * draft-anchors.mjs – erzeugt Anker-Entwürfe aus der automatischen Gliederung
 * (DEBUG_STREAM-Ausgabe von import-luebben.mjs) und wendet manuelle Korrekturen an.
 *
 * Aufruf:
 *   node scripts/draft-anchors.mjs <stream.txt> <idPrefix> <fixes.json>
 *     idPrefix: z. B. "lr-ii-" – alle Abschnitte dieses Buchs in Stream-Reihenfolge
 *
 * fixes.json:
 *   { "set":    { "lr-ii-6#4": "Swelke gaue de man" },          // Anker ersetzen
 *     "drop":   ["lr-ii-9#3"],                                    // Anker entfernen
 *     "insert": { "lr-ii-12#5": [{ "id": "lr-ii-12", "s": 6, "a": "Nynes beschuldenen" }] }, // nach … einfügen
 *     "renumber": { "lr-ii-20#2": 3 } }                           // § ändern
 *
 * Ausgabe (stdout): JSON-Array von {id, s, a}.
 */
import { readFileSync } from "node:fs";

const [streamFile, prefix, fixesFile] = process.argv.slice(2);
const fixes = fixesFile ? JSON.parse(readFileSync(fixesFile, "utf8")) : {};
const LEAD = /^(?:[IVX][IVXLUTYF1ln]{0,7}[.,»]|[IVX][IVXLUTYF1]{1,7}|XL|IL)\s+/;

const out = [];
for (const line of readFileSync(streamFile, "utf8").split("\n")) {
  const m = line.match(/^⟦(\S+) §(\d+)(?: A)?⟧ (.*)$/);
  if (!m || !m[1].startsWith(prefix) || /^lr-iii-/.test(m[1]) && prefix === "lr-ii-") continue;
  const [, id, s, text] = m;
  const key = `${id}#${s}`;
  if ((fixes.drop || []).includes(key)) continue;
  const words = text.replace(LEAD, "").split(/\s+/).slice(0, 5).join(" ");
  const a = fixes.set?.[key] ?? words;
  const sec = fixes.renumber?.[key] ?? Number(s);
  out.push({ id, s: sec, a });
  for (const ins of fixes.insert?.[key] || []) out.push(ins);
}
console.log(JSON.stringify(out, null, 0).replace(/\},\{/g, "},\n{"));
