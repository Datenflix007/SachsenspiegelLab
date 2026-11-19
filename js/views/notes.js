// Ansicht „Notizen“: alle eigenen Annotationen, Filter, Export/Import.

import { html, toHtml, $, toast, download } from "../util.js";
import { noteItem } from "../components/notes.js";

export function renderNotes(ctx) {
  const { store } = ctx;
  const view = html`<div class="page page--narrow">
    <div class="section-head" style="margin-top:0">
      <h2>Eigene Annotationen</h2>
      <p>Gespeichert nur in diesem Browser (localStorage). Für Sicherung und Austausch: Export.</p>
    </div>
    <div class="art-tools">
      <button type="button" class="btn btn--primary" data-export>⤓ Alle exportieren (JSON)</button>
      <label class="btn" tabindex="0" role="button" for="importFile">⤒ Importieren …</label>
      <input id="importFile" type="file" accept="application/json,.json" class="visually-hidden" data-import />
      <span class="spacer"></span>
      <button type="button" class="btn btn--ghost" data-clear>Alle löschen</button>
    </div>
    <div class="toc-filter" style="margin-top:6px">
      <label class="visually-hidden" for="noteFilter">Notizen filtern</label>
      <input id="noteFilter" type="search" placeholder="Filtern nach Text oder #Tag …" autocomplete="off" />
    </div>
    <div data-list></div>
  </div>`;

  function mount(root) {
    const list = $("[data-list]", root);
    const filterEl = $("#noteFilter", root);
    function render() {
      const q = filterEl.value.trim().toLowerCase();
      const all = store.all().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      const items = all.filter((a) => !q || a.text.toLowerCase().includes(q) || a.tags.some((t) => ("#" + t.toLowerCase()).includes(q)));
      const tags = [...new Set(all.flatMap((a) => a.tags))].sort((a, b) => a.localeCompare(b, "de"));
      list.innerHTML = toHtml(html`
        ${tags.length ? html`<div class="row" style="display:flex;flex-wrap:wrap;gap:6px;margin:10px 0">${tags.map((t) => html`<button type="button" class="chip chip--link" data-tag="${t}">#${t}</button>`)}</div>` : ""}
        <p class="search-info">${items.length} von ${all.length} Notizen</p>
        ${items.length ? html`<div class="notes">${items.map((a) => noteItem(a, { showTarget: true }))}</div>` : html`<p class="notice">Noch keine Notizen. In der Artikelansicht lässt sich zu jedem § eine Notiz anlegen, im Viewer auch eine Markierung auf der Handschrift.</p>`}`);
    }
    filterEl.addEventListener("input", render);
    list.addEventListener("click", (e) => {
      const t = e.target.closest("[data-tag]");
      if (t) {
        filterEl.value = "#" + t.dataset.tag;
        render();
      }
    });
    $("[data-export]", root).addEventListener("click", () => {
      const stamp = new Date().toISOString().slice(0, 10);
      download(`sachsenspiegellab-annotationen-${stamp}.json`, store.exportJson());
      toast(`${store.count()} Notizen exportiert`);
    });
    $("[data-import]", root).addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) return toast("Datei zu groß (max. 5 MB)", 4000);
      const res = store.parseImport(await file.text());
      if (!res.ok) {
        await ctx.formDialog({ title: "Import nicht möglich", intro: res.errors.slice(0, 8).join("\n"), fields: [], submitLabel: "OK", cancel: false });
        return;
      }
      const choice = await ctx.formDialog({
        title: "Annotationen importieren",
        intro: `${res.annotations.length} gültige Notizen in der Datei${res.total !== res.annotations.length ? ` (${res.total - res.annotations.length} fehlerhafte werden übersprungen)` : ""}. Aktuell gespeichert: ${store.count()}.`,
        details: res.errors.slice(0, 6),
        fields: [
          {
            name: "mode",
            type: "radio",
            label: "Vorgehen",
            options: [
              ["merge", "Zusammenführen – bei gleicher ID gewinnt die neuere Fassung"],
              ["replace", "Ersetzen – vorhandene Notizen werden verworfen"],
            ],
            value: "merge",
          },
        ],
        submitLabel: "Importieren",
      });
      if (!choice) return;
      const n = store.applyImport(res.annotations, choice.mode);
      toast(`Import abgeschlossen – jetzt ${n} Notizen`);
      render();
    });
    $("[data-clear]", root).addEventListener("click", () => {
      if (!store.count()) return;
      if (!confirm(`Alle ${store.count()} Notizen unwiderruflich löschen? Vorher exportieren!`)) return;
      store.clearAll();
      render();
    });
    const onChanged = () => render();
    document.addEventListener("ssl:notes-changed", onChanged);
    const off = store.onChange(() => {});
    render();
    window.scrollTo(0, 0);
    return () => {
      document.removeEventListener("ssl:notes-changed", onChanged);
      off();
    };
  }
  return { html: view, mount, title: "Notizen" };
}
