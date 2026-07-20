const PACKAGE_FIELDS = [
  "title", "author", "format", "language", "publicationInformation", "isbn", "description", "additionalNotes", "contents"
];

export const OFFLINE_ISBN = "9780141439518";

export const OFFLINE_OPEN_LIBRARY_FIXTURE = Object.freeze({
  title: "Pride and prejudice",
  authors: Object.freeze([{ name: "Austen, Jane" }]),
  publish_places: Object.freeze([{ name: "London" }]),
  publishers: Object.freeze([{ name: "Penguin Books" }]),
  publish_date: "2003",
  description: "A bundled metadata snapshot for deterministic offline ISBN demonstration and human verification.",
  number_of_pages: 480
});

export function normalizeIsbn(input) {
  return String(input || "").toUpperCase().replace(/^\s*ISBN(?:-1[03])?\s*:?\s*/i, "").replace(/[^0-9X]/g, "");
}

export function validateIsbn10(input) {
  const isbn = normalizeIsbn(input);
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  const total = [...isbn].reduce((sum, char, index) =>
    sum + (char === "X" ? 10 : Number(char)) * (10 - index), 0);
  return total % 11 === 0;
}

export function validateIsbn13(input) {
  const isbn = normalizeIsbn(input);
  if (!/^97[89]\d{10}$/.test(isbn)) return false;
  const total = [...isbn.slice(0, 12)].reduce((sum, char, index) =>
    sum + Number(char) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (total % 10)) % 10 === Number(isbn[12]);
}

export function detectSourceInput(input) {
  const original = String(input || "").trim();
  const normalized = normalizeIsbn(original);
  const isbnLike = /^(?:ISBN(?:-1[03])?\s*:?\s*)?[0-9Xx][0-9Xx\s-]{8,20}$/i.test(original);
  if (!isbnLike) return { type: "text", value: original };
  const version = normalized.length === 10 ? "ISBN-10" : normalized.length === 13 ? "ISBN-13" : "ISBN";
  const valid = version === "ISBN-10" ? validateIsbn10(normalized) : version === "ISBN-13" ? validateIsbn13(normalized) : false;
  return { type: "isbn", original, normalized, version, valid };
}

function descriptionValue(value) {
  if (typeof value === "string") return value.trim();
  return typeof value?.value === "string" ? value.value.trim() : "";
}

export function mapRetrievedMetadata(data, isbn, { provider = "Open Library", sourceUrl = "", retrievedAt = new Date().toISOString(), offline = false } = {}) {
  const title = String(data?.title || "").trim();
  const author = Array.isArray(data?.authors) ? data.authors.map(({ name }) => name).filter(Boolean).join("; ") : "";
  const place = data?.publish_places?.[0]?.name || "";
  const publisher = data?.publishers?.[0]?.name || "";
  const date = String(data?.publish_date || "").trim();
  const publicationInformation = [place, publisher].filter(Boolean).join(" : ") + (date ? `${place || publisher ? ", " : ""}${date}` : "");
  const description = descriptionValue(data?.description);
  const pages = data?.number_of_pages ? `${data.number_of_pages} pages` : "";
  const sourcePackage = {
    title, author, format: "Print book", language: "", publicationInformation, isbn,
    description, additionalNotes: pages ? `Physical extent reported by retrieved metadata: ${pages}.` : "", contents: ""
  };
  const warnings = [];
  for (const [field, label] of [["title", "title"], ["author", "author/creator"], ["publicationInformation", "publication information"], ["description", "description/summary"]]) {
    if (!sourcePackage[field]) warnings.push(`Retrieved metadata did not provide ${label}.`);
  }
  const fieldProvenance = {};
  for (const field of PACKAGE_FIELDS) {
    if (!sourcePackage[field]) continue;
    fieldProvenance[field] = {
      classification: "retrieved_metadata",
      provider: offline ? "Offline deterministic ISBN fixture" : provider,
      label: offline ? "Offline fixture · retrieved metadata" : `${provider} · retrieved metadata`,
      sourceUrl: offline ? null : sourceUrl,
      retrievedAt
    };
  }
  return {
    sourcePackage,
    retrieval: {
      inputType: "isbn", isbn, provider: offline ? "Offline deterministic ISBN fixture" : provider,
      metadataClassification: "retrieved_metadata", authoritative: false, sourceUrl: offline ? null : sourceUrl,
      retrievedAt, offlineFixtureUsed: offline, fieldProvenance, warnings
    }
  };
}

export function findMetadataConflicts(existingPackage, retrievedPackage) {
  const labels = {
    title: "title", author: "author/creator", format: "format", language: "language",
    publicationInformation: "publication information", isbn: "ISBN",
    description: "description/summary", additionalNotes: "additional source notes", contents: "contents"
  };
  return PACKAGE_FIELDS.filter((field) => {
    const existing = String(existingPackage?.[field] || "").trim();
    const retrieved = String(retrievedPackage?.[field] || "").trim();
    return existing && retrieved && existing !== retrieved;
  }).map((field) => `Retrieved ${labels[field]} conflicts with the existing visible value; verify which value to retain.`);
}

export async function fetchOpenLibraryByIsbn(isbn, fetchImpl = fetch) {
  const booksUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`;
  const response = await fetchImpl(booksUrl);
  if (!response.ok) throw new Error(`Open Library Books API returned HTTP ${response.status}.`);
  const object = await response.json();
  if (object?.[`ISBN:${isbn}`]) return { data: object[`ISBN:${isbn}`], sourceUrl: booksUrl, lookupMethod: "books_api" };
  const searchUrl = `https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}`;
  const searchResponse = await fetchImpl(searchUrl);
  if (!searchResponse.ok) throw new Error(`Open Library search API returned HTTP ${searchResponse.status}.`);
  const search = await searchResponse.json();
  if (!search?.docs?.length) throw new Error("No Open Library match was found for that ISBN.");
  const record = search.docs[0];
  return {
    data: {
      title: record.title || "", authors: (record.author_name || []).slice(0, 3).map((name) => ({ name })),
      publish_date: record.first_publish_year ? String(record.first_publish_year) : "",
      publishers: (record.publisher || []).slice(0, 2).map((name) => ({ name })),
      description: record.subtitle || ""
    },
    sourceUrl: searchUrl, lookupMethod: "search_fallback"
  };
}
