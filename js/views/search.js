// Ansicht „Suche“: Volltext + Regex, Synonyme, Schreibvarianten, Treffer mit Kontext.

import { html, raw, esc, $, debounce } from "../util.js";
import { search, snippet, FIELD_LABEL } from "../search.js";

const LIMIT = 200;

export function renderSearch(ctx) {
  const { data, params } = ctx;
  const q = params.get("q") || "";
  const opts = {
    q,
    mode: params.get("mode") === "regex" ? "regex" : "text",
    synonyms: params.get("syn") !== "0",
    variants: params.get("var") === "1",
    wholeWord: params.get("ww") === "1",
    field: params.get("field") || "all",
    book: params.get("book") || "all",
    includeNotes: params.get("notes") === "1",
  };

  const view = html`<div class="page page--narrow">
    <div class="section-head" style="margin-top:0">
      <h2>Volltextsuche</h2>
      <p>Durchsucht Originaltexte, Übertragungen, Titel, Kernpunkte, Schlagworte und Synonyme.</p>
    </div>
    <form class="search-form" data-search-form role="search">
      <div class="search-form__main">
        <label class="visually-hidden" for="q">Suchbegriff</label>
        <input id="q" name="q" type="search" value="${q}" placeholder="${opts.mode === "regex" ? "Regulärer Ausdruck, z. B. herw[ae]de|heergew" : "z. B. Gewere, Heerschild, swert …"}" autocomplete="off" spellcheck="false" />
        <button class="btn btn--primary" type="submit">Suchen</button>
      </div>
      <div class="search-opts">
        <label><input type="radio" name="mode" value="text" ${opts.mode === "text" ? html`checked` : ""} /> Text</label>
        <label><input type="radio" name="mode" value="regex" ${opts.mode === "regex" ? html`checked` : ""} /> Regex</label>
        <label title="Findet auch Begriffe derselben Synonymgruppe (z. B. Gewere ↔ Besitz, Heergewäte ↔ herwede)"><input type="checkbox" name="syn" ${opts.synonyms ? html`checked` : ""} ${opts.mode === "regex" ? html`disabled` : ""} /> Synonyme</label>
        <label title="Toleriert mittelalterliche Schreibvarianten: u/v/w, i/j/y, c/k/ch, g/gh, t/th/d, Doppelbuchstaben"><input type="checkbox" name="var" ${opts.variants ? html`checked` : ""} ${opts.mode === "regex" ? html`disabled` : ""} /> Schreibvarianten</label>
        <label><input type="checkbox" name="ww" ${opts.wholeWord ? html`checked` : ""} ${opts.mode === "regex" ? html`disabled` : ""} /> ganze Wörter</label>
        <label>Feld
          <select name="field">
            ${[["all", "alle"], ["plainText", "Originaltext"], ["translation", "Übertragung"], ["meta", "Titel, Kernpunkte, Schlagworte"]].map(([v, l]) => html`<option value="${v}" ${opts.field === v ? html`selected` : ""}>${l}</option>`)}
          </select>
        </label>
        <label>Buch
          <select name="book">
            <option value="all">alle</option>
            ${data.books.map((b) => html`<option value="${b.id}" ${opts.book === b.id ? html`selected` : ""}>${b.label}</option>`)}
          </select>
        </label>
        <label><input type="checkbox" name="notes" ${opts.includeNotes ? html`checked` : ""} /> eigene Notizen</label>
      </div>
    </form>
    <div data-results aria-live="polite"></div>
    <details class="card" style="margin-top:20px">
      <summary><b>Hilfe zur Suche</b></summary>
      <ul style="color:var(--text-2);font-size:.92rem">
        <li><b>Text</b>: Groß-/Kleinschreibung egal. Mit <i>Synonyme</i> findet „Gewere“ auch „Besitz“ und „were“.</li>
        <li><b>Schreibvarianten</b>: „herwede“ findet auch „herwedde“, „swert“ auch „suert“, „lenrecht“ auch „lehnrecht“.</li>
        <li><b>Regex</b>: JavaScript-Syntax, z. B. <code>\\bvor(e)?munde?\\b</code>, <code>her[e]?sc?hilt</code>, <code>(gew|w)ere</code>. Groß-/Kleinschreibung wird ignoriert.</li>
        <li>Gesucht wird nur in vorhandenen Texten. Artikel ohne Transkription liefern keine Treffer.</li>
      </ul>
    </details>
  </div>`;

  function resultHtml(r) {
    const a = r.articleId ? data.articleById.get(r.articleId) : null;
    const hlParams = new URLSearchParams({ hl: opts.q, mode: opts.mode, syn: opts.synonyms ? "1" : "0", var: opts.variants ? "1" : "0", ww: opts.wholeWord ? "1" : "0" });
    let href = "#search";
    if (a) href = `#article/${a.id}?${r.section ? `s=${r.section}&` : ""}${hlParams}`;
    else if (r.pageNumber) href = `#page/${r.pageNumber}`;
    const where = a ? `${a.label}${r.section ? (a.id === "lr-prolog" ? ` · Teil ${r.section}` : ` § ${r.section}`) : ""}` : r.pageNumber ? `Seite ${r.pageNumber}` : "Notiz";
    return html`<a class="result" href="${href}">
      <div class="result__head">
        <b>${where}</b>
        ${a?.title && a.status !== "missing" ? html`<span>${a.title}</span>` : ""}
        <span class="result__field">${FIELD_LABEL[r.field]}</span>
        ${r.count > 1 ? html`<span class="chip">${r.count} Treffer</span>` : ""}
      </div>
      <div class="result__ctx${r.field === "plainText" ? " src" : ""}">${raw(snippet(r.text, r.ranges, esc))}</div>
    </a>`;
  }

  function run(root, limit = LIMIT) {
    const out = $("[data-results]", root);
    if (!opts.q.trim()) {
      out.innerHTML = `<p class="search-info">Suchbegriff eingeben. Beispiele: <a href="#search?q=Gewere">Gewere</a> · <a href="#search?q=swert&var=1">swert (Varianten)</a> · <a href="#search?q=herw%5Bea%5Dde%7Cheergew&mode=regex">herw[ea]de|heergew (Regex)</a></p>`;
      return;
    }
    const t0 = performance.now();
    const { results, total, error } = search(data, ctx.index, opts);
    if (error) {
      out.innerHTML = `<p class="search-error" role="alert">${esc(error)}</p>`;
      return;
    }
    const ms = Math.round(performance.now() - t0);
    const sections = new Set(results.filter((r) => r.kind === "section").map((r) => r.sectionId)).size;
    const shown = results.slice(0, limit);
    out.innerHTML = "";
    out.insertAdjacentHTML(
      "beforeend",
      `<p class="search-info">${total} Treffer in ${results.length} Feldern (${sections} Paragraphen) · ${ms} ms</p>`
    );
    const list = document.createElement("div");
    list.className = "results";
    list.innerHTML = shown.map((r) => resultHtml(r).html).join("");
    out.append(list);
    if (results.length > limit) {
      const more = document.createElement("button");
      more.className = "btn";
      more.style.marginTop = "12px";
      more.textContent = `Weitere ${results.length - limit} anzeigen`;
      more.addEventListener("click", () => run(root, limit + LIMIT));
      out.append(more);
    }
    if (!results.length) out.insertAdjacentHTML("beforeend", `<p class="notice">Keine Treffer. Tipp: <i>Schreibvarianten</i> oder <i>Synonyme</i> aktivieren oder einen Regex verwenden.</p>`);
  }

  function mount(root) {
    const form = $("[data-search-form]", root);
    const apply = () => {
      const fd = new FormData(form);
      const p = new URLSearchParams();
      const qq = String(fd.get("q") || "");
      if (qq) p.set("q", qq);
      if (fd.get("mode") === "regex") p.set("mode", "regex");
      if (!fd.get("syn") && fd.get("mode") !== "regex") p.set("syn", "0");
      if (fd.get("var")) p.set("var", "1");
      if (fd.get("ww")) p.set("ww", "1");
      if (fd.get("field") !== "all") p.set("field", fd.get("field"));
      if (fd.get("book") !== "all") p.set("book", fd.get("book"));
      if (fd.get("notes")) p.set("notes", "1");
      const target = `#search${p.toString() ? "?" + p : ""}`;
      if (location.hash !== target) location.hash = target;
    };
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      apply();
    });
    form.addEventListener("change", (e) => {
      if (e.target.name !== "q") apply();
    });
    const live = debounce(() => {
      opts.q = $("#q", root).value;
      run(root);
    }, 220);
    $("#q", root).addEventListener("input", live);
    run(root);
    const input = $("#q", root);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  return { html: view, mount, title: q ? `Suche: ${q}` : "Suche" };
}
