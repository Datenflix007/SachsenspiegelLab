#!/usr/bin/env node
/**
 * draft-anchors.mjs – erzeugt Anker-Entwürfe aus der automatischen Gliederung
 * (DEBUG_STREAM-Ausgabe von import-luebben.mjs) und wendet manuelle Korrekturen an.
 *
 * Aufruf:
 *   node scripts/draft-anchors.mjs <stream.txt> <präfix[,präfix…]> <fixes.json>
 *     präfix: z. B. "lr-iii-" oder "lr-ii-73,lr-iii-" – Abschnitte in Stream-Reihenfolge
 *
 * fixes.json – Schlüssel „id#§“ oder, bei mehrfach vorkommender Kennung, „id#§@n“ (n = 0, 1, …):
 *   { "set":      { "lr-ii-6#4": "Swelke gaue de man" },                 // Anfangsworte ersetzen
 *     "drop":     ["lr-ii-9#3"],                                         // Anker entfernen
 *     "insert":   { "lr-ii-12#5": [{ "id": "lr-ii-12", "s": 6, "a": "Nynes" }] }, // danach einfügen
 *     "renumber": { "lr-ii-20#2": 3 },                                   // § ändern
 *     "reid":     { "lr-iii-85#1@0": { "id": "lr-iii-78", "s": 1 } } }   // Kennung ändern
 *
 * Ausgabe (stdout): JSON-Array von {id, s, a}.
 */
import { readFileSync } from "node:fs";

const [streamFile, prefixArg, fixesFile] = process.argv.slice(2);
const prefixes = prefixArg.split(",");
const fixes = fixesFile ? JSON.parse(readFileSync(fixesFile, "utf8")) : {};
const LEAD = /^(?:[IVX][IVXLUTYF1ln]{0,7}[.,»]|[IVX][IVXLUTYF1]{1,7}|XL|IL)\s+/;
const pick = (map, key, occKey) => (map && (occKey in map ? map[occKey] : map[key]));

const seen = new Map();
const out = [];
for (const line of readFileSync(streamFile, "utf8").split("\n")) {
  const m = line.match(/^⟦(\S+) §(\d+)(?: A)?⟧ (.*)$/);
  if (!m || !prefixes.some((p) => m[1] === p || (p.endsWith("-") && m[1].startsWith(p)))) continue;
  const [, id, s, text] = m;
  const key = `${id}#${s}`;
  const occ = seen.get(key) ?? 0;
  seen.set(key, occ + 1);
  const occKey = `${key}@${occ}`;
  if ((fixes.drop || []).includes(key) || (fixes.drop || []).includes(occKey)) continue;
  const words = text.replace(LEAD, "").split(/\s+/).slice(0, 5).join(" ");
  const re = pick(fixes.reid, key, occKey);
  out.push({
    id: re?.id ?? id,
    s: re?.s ?? pick(fixes.renumber, key, occKey) ?? Number(s),
    a: pick(fixes.set, key, occKey) ?? words,
  });
  for (const ins of pick(fixes.insert, key, occKey) || []) out.push(ins);
}
console.log(JSON.stringify(out, null, 0).replace(/\},\{/g, "},\n{"));
