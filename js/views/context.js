// Ansicht „Kontext“: Schaubilder der Tafelbilder als HTML/SVG nachgebaut.

import { html, raw, $, $$ } from "../util.js";

const art = (data, id, label) => {
  const a = data.articleById.get(id);
  return html`<a class="chip chip--link" href="#article/${id}">${label || a?.label || id}</a>`;
};
const links = (data, items) => html`<div class="diagram__links"><span>Zum Text:</span>${items.map(([id, l]) => art(data, id, l))}</div>`;

// ---------- A · Lehnrecht / Heerschilde ----------
function heerschild(data) {
  const steps = [
    ["König", "Spitze der lehnrechtlichen Ordnung"],
    ["Geistliche Fürsten", "z. B. Bischöfe, Äbte, Äbtissinnen"],
    ["Weltliche Fürsten", "weltliche Fürsten des Reichs"],
    ["Freie Herren", "edelfreie Herren unterhalb der Fürsten"],
    ["Mannen freier Herren", "Vasallen freier Herren; teils mit Schöffenbarfreien verbunden"],
    ["Deren Mannen", "weitere nachgeordnete Lehnsleute"],
    ["Stufe nicht eindeutig besetzt", "in der Quelle nicht klar einer festen Gruppe zugewiesen"],
  ];
  const shields = data.pageByNumber.get(16);
  return html`<section class="diagram" id="heerschild" aria-labelledby="dA">
    <div class="diagram__head"><h2 id="dA">A · Lehnrecht / Heerschilde</h2><span class="flag flag--heuristic">schematisch</span></div>
    <p class="diagram__sub">Rang im Lehensverband – nicht Bevölkerungspyramide</p>
    <div class="ladder" role="list">
      ${steps.map(
        ([t, n], i) => html`<div class="ladder__step${i === steps.length - 1 ? " is-last is-open" : ""}" role="listitem">${i + 1} ${t}</div><div class="ladder__note">${n}</div>`
      )}
      <div class="ladder__foot">Lehen / Treue / Dienste: Herr-Mann-Beziehung</div>
    </div>
    <p class="meta-source">Pfeile: lehnrechtliche Rangfolge (schematisch).</p>
    <figure style="margin:18px 0 0">
      <a href="#page/16" aria-label="Seite 16 (Bl. 4v) mit den sieben Heerschilden im Viewer öffnen">
        <img src="${shields.imageServiceUrl}/pct:5,63,68,30/900,/0/default.jpg" alt="Die sieben Heerschilde im Bildstreifen der Dresdner Bilderhandschrift, Bl. 4v: Adler, Bischof, Löwe; Andreaskreuz, Löwe mit Schrägbalken, rot-silberner Schild, leerer Schild" loading="lazy" style="border-radius:12px;border:1px solid var(--line);max-width:640px;width:100%" />
      </a>
      <figcaption class="meta-source">Die Heerschilde in der Dresdner Bilderhandschrift, Bl. 4v (S. 16) – mit Markierungen im <a href="#page/16">Viewer</a>.</figcaption>
    </figure>
    ${links(data, [["lr-i-3", "LR I 3"], ["lehnrecht-1", "Lehnrecht 1"], ["lehnrecht-2", "Lehnrecht 2"]])}
  </section>`;
}

function grenzen(data) {
  return html`<section class="diagram" id="grenzen" aria-labelledby="dG">
    <div class="diagram__head"><h2 id="dG">Grenzen der Heerschildordnung</h2></div>
    <p class="diagram__sub">Lehnsrechtliche Rangordnung – keine vollständige Sozialordnung</p>
    <div class="box-grid">
      <div class="box box--lehn"><h3>Die Heerschilde erfassen vor allem:</h3><ul><li>den Lehensverband</li><li>König, geistliche und weltliche Fürsten</li><li>freie Herren und ihre Lehnsleute</li><li>Rangbeziehungen im Lehnrecht</li></ul></div>
      <div class="box box--lehn"><h3>Nur begrenzt oder gar nicht erfasst:</h3><ul><li>Frauen</li><li>Juden</li><li>Bauern und grundherrlich Abhängige</li><li>städtische Handwerker und Kaufleute</li><li>Patrizier / Ratsfamilien</li></ul></div>
      <div class="box box--key"><h3>Kernaussage</h3><p>Die Heerschildordnung bildet nur einen Teil der mittelalterlichen Gesellschaft ab. Für soziale Schichtung müssen auch Landrecht, Freiheit, Grundherrschaft, Religion und Stadt-Land-Unterschiede berücksichtigt werden.</p></div>
    </div>
    ${links(data, [["lr-i-3", "LR I 3"], ["lehnrecht-2", "Lehnrecht 2"]])}
  </section>`;
}

// ---------- B · Landrecht / Rechtsstellungen ----------
function landrecht(data) {
  return html`<section class="diagram" id="landrecht" aria-labelledby="dB">
    <div class="diagram__head"><h2 id="dB">B · Landrecht / Rechtsstellungen</h2><span class="flag flag--recon" title="Hauptteil aus dem Wortlaut von LR I 2 rekonstruiert; die Vorlage lag nur teilweise vor">rekonstruiert</span></div>
    <p class="diagram__sub">Drei Arten der Freiheit nach LR I 2 – unterschieden nach Gerichtszugehörigkeit</p>
    <div class="box-grid">
      <div class="box box--land"><h3>Schöffenbare</h3><p>volle Freie, schöffenbar; besuchen das Send des Bischofs und das Grafending unter Königsbann.</p></div>
      <div class="box box--land"><h3>Pfleghafte</h3><p>Freie mit Eigen; besuchen das Send der Dompröpste und das Ding des Schultheißen; aus ihnen wird der Fronbote gewählt.</p></div>
      <div class="box box--land"><h3>Landsassen</h3><p>Freie ohne Eigen im Land; besuchen das Send der Erzpriester und das Ding des Gografen.</p></div>
    </div>
    <p class="eyebrow" style="margin:20px 0 8px">Nicht vollständig erfasst:</p>
    <div class="box-grid">
      <div class="box box--heck"><h3>Laten / Eigenleute</h3><p>persönliche Abhängigkeit</p></div>
      <div class="box box--heck"><h3>Ministeriale</h3><p>unfrei, aber oft sozial aufstiegsfähig</p></div>
      <div class="box box--land"><h3>Frauen / Familien</h3><p>Rechte nach Geschlecht und Familienstand</p></div>
      <div class="box box--land"><h3>Stadt / Dorf / Religion</h3><p>weitere rechtliche Zuordnungen</p></div>
    </div>
    <p style="text-align:center;font-weight:600;margin:16px 0 0">Landrecht I 2 beschreibt Freie – nicht die ganze Gesellschaft.</p>
    ${links(data, [["lr-i-2", "LR I 2"], ["lr-i-16", "LR I 16"], ["lr-i-3", "LR I 3"]])}
  </section>`;
}

function freiheitTabelle(data) {
  const rows = [
    ["Schöffenbare", "Send des Bischofs", "Grafending unter Königsbann", "alle 18 Wochen; bei Ungericht auch das nach 14 Nächten angesetzte Ding", "§ 1, § 2"],
    ["Pfleghafte", "Send der Dompröpste", "Ding des Schultheißen (von ihrem Eigen)", "alle 6 Wochen; Wahl des Fronboten aus ihrem Kreis", "§ 1, § 3"],
    ["Landsassen (ohne Eigen im Land)", "Send der Erzpriester", "Ding des Gografen", "alle 6 Wochen; Rügepflicht des Bauermeisters im Vogtding", "§ 1, § 4"],
  ];
  return html`<section class="diagram" id="freiheit" aria-labelledby="dT">
    <div class="diagram__head"><h2 id="dT">Freiheit und Gerichtszugehörigkeit</h2><span class="flag flag--recon">aus dem Wortlaut rekonstruiert</span></div>
    <p class="diagram__sub">Landrecht I 2 §§ 1–4: geistliches und weltliches Gericht der drei Freiengruppen</p>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th scope="col">Gruppe</th><th scope="col">geistlich (Send)</th><th scope="col">weltliches Gericht</th><th scope="col">Turnus / Besonderheit</th><th scope="col">LR I 2</th></tr></thead>
        <tbody>${rows.map((r) => html`<tr><th scope="row" style="background:none;color:var(--heading)">${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td><a href="#article/lr-i-2?s=${r[4].match(/\d/)[0] === "1" ? r[4].split(", ")[1].replace("§ ", "") : 1}">${r[4]}</a></td></tr>`)}</tbody>
      </table>
    </div>
    <p class="meta-source">Jeder Christ besucht ab Mündigkeit dreimal jährlich das Send seines Bistums (§ 1). Die Bauermeister rügen Gerüfte, blutende Wunden, gezückte Schwerter, Dingversäumnis und Ungericht an Leib oder Hand (§ 4).</p>
    ${links(data, [["lr-i-2", "LR I 2"]])}
  </section>`;
}

// ---------- Hecks Deutungsmodell ----------
function heck(data) {
  return html`<section class="diagram" id="heck" aria-labelledby="dH">
    <div class="diagram__head"><h2 id="dH">Hecks Deutungsmodell</h2><span class="flag flag--research">Forschungsdeutung, nicht Wortlaut Eikes</span></div>
    <div class="heck-grid" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;align-items:stretch">
      <div style="display:grid;gap:10px">
        <div class="bar" style="text-align:center;margin:0">Ausgangspunkt im Sachsenspiegel (LR I 2)</div>
        <div class="box box--lehn"><h3>Schöffenbarfreie</h3><p>voll frei, schöffenbar, eigener Gerichtsstand</p></div>
        <div class="box box--lehn"><h3>Pfleghafte</h3><p>frei, aber mit Schutz-/Abhängigkeitsbezügen</p></div>
        <div class="box box--lehn"><h3>Landsassen</h3><p>Freie minderen Ranges, ohne gleiche Vorrechte</p></div>
      </div>
      <div style="display:grid;gap:10px;align-content:start">
        <div class="bar" style="text-align:center;margin:0;background:color-mix(in srgb,var(--c-land) 18%,var(--surface));border-color:var(--c-land)">Kriterien der Unterscheidung</div>
        <div class="box box--land" style="display:grid;gap:8px">
          ${["Gerichtsstand", "Geburt / Herkunft", "Besitz", "Herrschaftsbindung", "soziale Geltung"].map((k) => html`<div style="text-align:center;font-weight:700;padding:6px;border-radius:8px;border:1px solid var(--c-land)">${k}</div>`)}
        </div>
        <svg class="svg-diagram" viewBox="0 0 300 60" aria-hidden="true"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"/></marker></defs><line x1="10" y1="20" x2="290" y2="20" stroke="var(--accent)" stroke-width="2.5" marker-end="url(#ah)"/><line x1="10" y1="45" x2="290" y2="45" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6 5" marker-end="url(#ah)"/></svg>
      </div>
      <div style="display:grid;gap:10px;align-content:start">
        <div class="bar" style="text-align:center;margin:0;background:color-mix(in srgb,var(--c-heck) 18%,var(--surface));border-color:var(--c-heck)">Hecks Deutungsmodell</div>
        <div class="box box--heck"><h3>Alte Freie</h3><ul><li>ältere Geburtsfreie</li><li>stärker mit den Schöffenbarfreien verbunden</li><li>volle / ältere Freiheitsqualität</li></ul></div>
        <div class="box box--heck"><h3>Neue Freie</h3><ul><li>später freigewordene oder geschützte Freie</li><li>Freiheit mit Bindungen</li><li>näher an Pfleghaften und Teilen der Landsassen</li></ul></div>
      </div>
    </div>
    <p class="meta-source" style="text-align:center;font-style:italic">Heuristische Zuordnung nach Heck – nicht der Wortlaut Eikes. Durchgezogen: Schöffenbarfreie → Alte Freie; Pfleghafte → Neue Freie; gestrichelt: Landsassen (teilweise) → Neue Freie.</p>
    ${links(data, [["lr-i-2", "LR I 2"], ["lr-i-3", "LR I 3"]])}
  </section>`;
}

// ---------- Gesamtmodell ----------
function gesamt(data) {
  const dims = [
    ["Lehnsrang / Heerschild", "var(--c-lehn)"],
    ["Freiheit / Unfreiheit", "var(--c-heck)"],
    ["Besitz / Herkunft / Gerichtsstand", "var(--c-land)"],
    ["Herrschaftsbindung / Dienst", "var(--c-violet)"],
    ["Rechtsstatus im Landrecht", "var(--c-land)"],
  ];
  const cx = 210, cy = 170, R = 125;
  const nodes = dims.map(([l, c], i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / dims.length;
    return { l, c, x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) };
  });
  const wrap = (s) => s.split(" / ").reduce((lines, w, i, arr) => (i < arr.length - 1 ? [...lines, w + " /"] : [...lines, w]), []);
  const svg = `<svg class="svg-diagram" viewBox="0 0 420 340" role="img" aria-labelledby="gmT"><title id="gmT">Soziale Stellung als Zusammenspiel von fünf Dimensionen</title>
    <defs><marker id="ah2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--text-2)"/></marker></defs>
    ${nodes.map((n) => { const dx = cx - n.x, dy = cy - n.y, d = Math.hypot(dx, dy); return `<line x1="${n.x + (dx / d) * 52}" y1="${n.y + (dy / d) * 36}" x2="${cx - (dx / d) * 62}" y2="${cy - (dy / d) * 62}" stroke="var(--text-2)" stroke-width="2" marker-end="url(#ah2)"/>`; }).join("")}
    <circle cx="${cx}" cy="${cy}" r="60" fill="var(--bar)" stroke="var(--bar-line)" stroke-width="3"/>
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="22" font-weight="700" style="fill:var(--heading)">soziale</text>
    <text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="22" font-weight="700" style="fill:var(--heading)">Stellung</text>
    ${nodes.map((n) => { const lines = wrap(n.l); return `<ellipse cx="${n.x}" cy="${n.y}" rx="62" ry="38" fill="color-mix(in srgb, ${n.c} 18%, var(--surface))" stroke="${n.c}" stroke-width="2"/>${lines.map((t, k) => `<text x="${n.x}" y="${n.y + (k - (lines.length - 1) / 2) * 14 + 4}" text-anchor="middle" font-size="11.5" font-weight="600">${t}</text>`).join("")}`; }).join("")}
  </svg>`;
  const examples = [
    ["Schöffenbarfreie", "hoher landrechtlicher Freiheitsrang"],
    ["Pfleghafte / Landsassen", "frei, aber abgestufte Rechtsstellung"],
    ["Ritter / Ministeriale", "lehnrechtlich wichtig, sozial aufstiegsfähig"],
    ["Laten / Eigenleute", "stärkere Abhängigkeit / Unfreiheit"],
    ["König / Fürsten", "Spitze der lehnrechtlichen Ordnung"],
  ];
  return html`<section class="diagram" id="gesamtmodell" aria-labelledby="dM">
    <div class="diagram__head"><h2 id="dM">Gesamtmodell der sozialen Stellung</h2><span class="flag flag--heuristic">heuristisch</span></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;align-items:start">
      <div style="display:grid;gap:10px">
        <div class="bar" style="margin:0">1. Teilmodelle</div>
        <div class="box box--lehn"><h3>Modul A: Lehnrecht / Heerschildordnung</h3><ul><li>König</li><li>geistliche und weltliche Fürsten</li><li>freie Herren / Vasallen</li><li>Ritter / Ministeriale</li></ul><p style="margin-top:6px">ordnet lehnrechtlichen Rang und Dienstbindungen</p></div>
        <div class="box box--land"><h3>Modul B: Landrechtliche Gruppen</h3><ul><li>Schöffenbarfreie</li><li>Pfleghafte</li><li>Landsassen</li><li>Laten / Eigenleute / Unfreie</li></ul><p style="margin-top:6px">ordnet Rechtsstatus im Landrecht</p></div>
        <div class="box box--heck"><h3>Modul C: Bestimmung der Freien (Heck)</h3><ul><li>Alte Freie</li><li>Neue Freie</li></ul><p style="margin-top:6px"><span class="flag flag--research">Forschungsdeutung, nicht Wortlaut Eikes</span></p></div>
      </div>
      <div style="display:grid;gap:10px">
        <div class="bar" style="margin:0;background:color-mix(in srgb,var(--c-land) 16%,var(--surface));border-color:var(--c-land)">2. Überführung / Verknüpfung</div>
        ${[
          ["Heerschild", "= lehnrechtlicher Rang, nicht allgemeine Sozialpyramide.", "A ergänzt"],
          ["Landrecht", "= Freiheit / Unfreiheit und Gerichtsstand.", "B präzisiert"],
          ["Heck", "differenziert die Freien zusätzlich in alte und neue Freie.", "C überlagert sich"],
          ["Mehrfachzugehörigkeit", ": Eine Person kann mehreren Ordnungen zugleich angehören.", ""],
        ].map(([b, t, tag], i) => html`<div class="box box--land" style="display:flex;gap:10px;align-items:flex-start"><b style="display:grid;place-items:center;min-width:28px;height:28px;border-radius:50%;background:var(--c-land);color:#fff">${i + 1}</b><p style="margin:0"><b>${b}</b> ${t}${tag ? html`<br /><small style="color:var(--muted)">${tag}</small>` : ""}</p></div>`)}
      </div>
      <div style="display:grid;gap:10px">
        <div class="bar" style="margin:0">3. Gesamtmodell</div>
        <div class="box" style="padding:8px">${raw(svg)}</div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Beispiel</th><th>zuordnend aus den Kriterien</th></tr></thead>
        <tbody>${examples.map(([a, b]) => html`<tr><td><b>${a}</b></td><td>${b}</td></tr>`)}</tbody></table></div>
      </div>
    </div>
    ${links(data, [["lr-i-2", "LR I 2"], ["lr-i-3", "LR I 3"], ["lehnrecht-1", "Lehnrecht 1"], ["lehnrecht-2", "Lehnrecht 2"]])}
  </section>`;
}

// ---------- Netzdiagramm ----------
const AXES = ["Lehnsrang / Heerschild", "Freiheit / Unfreiheit", "Besitz / Herkunft / Gerichtsstand", "Herrschaftsbindung / Dienst", "Rechtsstatus im Landrecht"];
// Werte 0–10, nach dem Tafelbild (Bild12) abgelesen – heuristisch
const GROUPS = [
  ["König", "#2563eb", [10, 10, 10, 1, 10]],
  ["Fürsten / hoher Adel", "#dc2626", [8, 9, 9, 3, 9]],
  ["Ritter / Ministeriale", "#16a34a", [7, 5, 6, 8, 5]],
  ["Geistliche", "#9333ea", [6, 8, 7, 3, 8]],
  ["Schöffenbarfreie", "#eab308", [4, 9, 8, 2, 9]],
  ["Pfleghafte", "#0d9488", [3, 6, 5, 4, 6]],
  ["Landsassen", "#ea580c", [1, 5, 3, 7, 4]],
  ["Laten / Eigenleute", "#78350f", [0.5, 1, 2, 10, 2]],
];
function radar(data) {
  const cx = 250, cy = 215, R = 150;
  const pt = (i, v) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length;
    return [cx + (R * v) / 10 * Math.cos(ang), cy + (R * v) / 10 * Math.sin(ang)];
  };
  const grid = [2, 4, 6, 8, 10].map((v) => `<polygon points="${AXES.map((_, i) => pt(i, v).join(",")).join(" ")}" fill="none" stroke="var(--line-strong)" stroke-width="1"/>`).join("");
  const spokes = AXES.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, 10)[0]}" y2="${pt(i, 10)[1]}" stroke="var(--line-strong)"/>`).join("");
  const ticks = [0, 2, 4, 6, 8, 10].map((v) => `<text x="${cx - 8}" y="${cy - (R * v) / 10 + 4}" text-anchor="end" font-size="11" class="muted">${v}</text>`).join("");
  const labels = AXES.map((l, i) => {
    const [x, y] = pt(i, 12.2);
    const anchor = Math.abs(x - cx) < 10 ? "middle" : x > cx ? "start" : "end";
    const parts = l.split(" / ");
    return parts.map((t, k) => `<text x="${x}" y="${y + (k - (parts.length - 1) / 2) * 15 + 4}" text-anchor="${anchor}" font-size="13" font-weight="700">${t}${k < parts.length - 1 ? " /" : ""}</text>`).join("");
  }).join("");
  const series = GROUPS.map(([name, color, vals], gi) => `<g data-series="${gi}"><polygon points="${vals.map((v, i) => pt(i, v).join(",")).join(" ")}" fill="${color}" fill-opacity=".06" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>${vals.map((v, i) => `<circle cx="${pt(i, v)[0]}" cy="${pt(i, v)[1]}" r="4" fill="${color}"><title>${name}: ${AXES[i]} ≈ ${v}</title></circle>`).join("")}</g>`).join("");
  const svg = `<svg class="svg-diagram" viewBox="-40 0 580 440" role="img" aria-labelledby="rdT rdD" style="max-width:720px;margin:0 auto"><title id="rdT">Netzdiagramm der sozialen Stellung</title><desc id="rdD">Acht soziale Gruppen auf fünf Dimensionen (0–10, außen stärkere Ausprägung). Heuristische Werte nach dem Tafelbild.</desc>${grid}${spokes}${ticks}${series}${labels}</svg>`;
  return html`<section class="diagram" id="netz" aria-labelledby="dN">
    <div class="diagram__head"><h2 id="dN">Netzdiagramm der sozialen Stellung</h2><span class="flag flag--heuristic">heuristisch</span></div>
    <p class="diagram__sub">Außen = stärkere Ausprägung der jeweiligen Dimension. Gruppen über die Legende ein-/ausblenden.</p>
    ${raw(svg)}
    <div class="legend" role="group" aria-label="Soziale Gruppen (im Sachsenspiegel)">
      ${GROUPS.map(([n, c], i) => html`<button type="button" aria-pressed="true" data-series-toggle="${i}"><i style="background:${c}"></i>${n}</button>`)}
    </div>
    <details style="margin-top:10px"><summary class="meta-source">Werte als Tabelle</summary>
      <div class="table-wrap"><table class="data-table" style="margin-top:8px"><thead><tr><th>Gruppe</th>${AXES.map((a) => html`<th>${a}</th>`)}</tr></thead>
      <tbody>${GROUPS.map(([n, , v]) => html`<tr><td><b>${n}</b></td>${v.map((x) => html`<td>${x}</td>`)}</tr>`)}</tbody></table></div>
    </details>
    <p style="text-align:center;font-weight:600;margin:14px 0 0">Die soziale Stellung ergibt sich aus dem Zusammenspiel mehrerer rechtlicher und sozialer Dimensionen.</p>
    ${links(data, [["lr-i-2", "LR I 2"], ["lr-i-3", "LR I 3"], ["lr-i-16", "LR I 16"], ["lehnrecht-2", "Lehnrecht 2"]])}
  </section>`;
}

export function renderContext(ctx, anchor) {
  const { data } = ctx;
  const nav = [["heerschild", "A · Heerschilde"], ["grenzen", "Grenzen"], ["landrecht", "B · Landrecht"], ["freiheit", "Tabelle LR I 2"], ["heck", "Heck"], ["gesamtmodell", "Gesamtmodell"], ["netz", "Netzdiagramm"]];
  const view = html`<div class="page">
    <div class="section-head" style="margin-top:0">
      <h2>Kontext: Schaubilder</h2>
      <p>Nach den Tafelbildern, als HTML/SVG nachgebaut. Kennzeichnungen beachten.</p>
    </div>
    <nav class="art-tools" aria-label="Schaubilder">${nav.map(([id, l]) => html`<a class="chip chip--link" href="#context/${id}">${l}</a>`)}</nav>
    <div class="diagram-list">
      ${heerschild(data)}${grenzen(data)}${landrecht(data)}${freiheitTabelle(data)}${heck(data)}${gesamt(data)}${radar(data)}
    </div>
  </div>`;
  function mount(root) {
    $$("[data-series-toggle]", root).forEach((b) =>
      b.addEventListener("click", () => {
        const on = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", String(on));
        const g = $(`[data-series="${b.dataset.seriesToggle}"]`, root);
        if (g) g.style.display = on ? "" : "none";
      })
    );
    const mq = matchMedia("(max-width: 900px)");
    const heckGrid = $(".heck-grid", root);
    const fit = () => (heckGrid.style.gridTemplateColumns = mq.matches ? "1fr" : "1fr 1fr 1fr");
    fit();
    mq.addEventListener?.("change", fit);
    if (anchor) requestAnimationFrame(() => $(`#${CSS.escape(anchor)}`, root)?.scrollIntoView({ block: "start" }));
    else window.scrollTo(0, 0);
    return () => mq.removeEventListener?.("change", fit);
  }
  return { html: view, mount, title: "Kontext" };
}
