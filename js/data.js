// Lädt alle Projektdaten und baut Indizes für schnelle Zugriffe.

const FILES = {
  articles: "data/articles.json",
  transcriptions: "data/transcriptions.json",
  pages: "data/manuscript-pages.json",
  themes: "data/themes.json",
  synonyms: "data/synonyms.json",
  projectAnnotations: "data/project-annotations.json",
};

async function getJson(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export async function loadData() {
  const entries = await Promise.all(Object.entries(FILES).map(async ([k, url]) => [k, await getJson(url)]));
  const raw = Object.fromEntries(entries);

  const articles = raw.articles.articles;
  const books = raw.articles.books;
  const articleById = new Map(articles.map((a) => [a.id, a]));
  const articleIndex = new Map(articles.map((a, i) => [a.id, i]));

  const transcriptions = raw.transcriptions.transcriptions;
  const sectionsByArticle = new Map();
  for (const t of transcriptions) {
    if (!sectionsByArticle.has(t.articleId)) sectionsByArticle.set(t.articleId, []);
    sectionsByArticle.get(t.articleId).push(t);
  }
  for (const list of sectionsByArticle.values()) list.sort((a, b) => a.section - b.section);

  const pages = raw.pages.pages;
  const pageByNumber = new Map(pages.map((p) => [p.pageNumber, p]));
  // Seite → Artikel (aus den Artikel-Seitenzuordnungen)
  const articlesByPage = new Map();
  for (const a of articles) {
    for (const p of a.pages) {
      if (!articlesByPage.has(p.pageNumber)) articlesByPage.set(p.pageNumber, []);
      articlesByPage.get(p.pageNumber).push({ article: a, mapping: p });
    }
  }

  const synonymGroups = raw.synonyms.groups.map((g) => g.map((w) => w.toLowerCase()));

  return {
    meta: { pagesTitle: raw.pages.title, attribution: raw.pages.attribution, license: raw.pages.license, structures: raw.pages.structures, counts: raw.articles.counts },
    books,
    articles,
    articleById,
    articleIndex,
    transcriptions,
    sectionsByArticle,
    pages,
    pageByNumber,
    articlesByPage,
    themes: raw.themes.themes,
    synonymGroups,
    projectAnnotations: raw.projectAnnotations.annotations || [],
  };
}

/** Artikel, die zu einem Themen-Intervall gehören. */
export function articlesForTheme(data, theme) {
  const out = [];
  for (const ref of theme.refs) {
    for (let n = ref.from; n <= ref.to; n++) {
      const a = data.articleById.get(`${ref.book}-${n}`);
      if (a && !out.some((x) => x.article.id === a.id)) out.push({ article: a, sections: ref.sections || null });
    }
  }
  return out;
}

/** Kurzlabel für Seiten: "S. 15 · Bl. 4r" */
export const pageLabel = (p) => (p ? `S. ${p.pageNumber}${p.label ? ` · Bl. ${p.label}` : ""}` : "");
