function escapeSubfield(value) {
  return String(value || "").replaceAll("$", "＄").trim();
}

function finalPeriod(value) {
  const text = String(value || "").trim();
  return !text || /[.!?)-]$/.test(text) ? text : `${text}.`;
}

function subjectSubfields(heading, detail = null) {
  const parts = String(heading || "").split(/\s*(?:—|--)\s*/).filter(Boolean);
  const formSubdivisions = new Set(["fiction", "biography", "juvenile literature"]);
  return parts.map((part, index) => {
    if (index === 0) return `$a${escapeSubfield(part)}`;
    if (index === 1 && detail?.value === heading && ["x", "y", "z", "v"].includes(detail.subdivisionMarcCode)) {
      return `$${detail.subdivisionMarcCode}${escapeSubfield(part)}`;
    }
    const code = formSubdivisions.has(part.toLowerCase()) ? "v" : "x";
    return `$${code}${escapeSubfield(part)}`;
  }).join("");
}

function provisionalSubjectField(heading) {
  return `=653  \\$a${finalPeriod(escapeSubfield(heading))}`;
}

function authorSubfields(author, relationship = "author") {
  const value = escapeSubfield(author);
  const role = escapeSubfield(relationship || "author").replace(/[.,;:]$/, "");
  const dateMatch = value.match(/^(.*?),\s*((?:\d{4}|[?u]{4})-(?:\d{4})?)$/i);
  if (!dateMatch) return `$a${value.replace(/[.]$/, "")},$e${role}.`;
  const name = dateMatch[1].trim().replace(/,$/, "");
  return `$a${name},$d${dateMatch[2].replace(/[.]$/, "")},$e${role}.`;
}

function contributorSubfields(contributor) {
  const item = typeof contributor === "string"
    ? { name: contributor, relationship: "" }
    : contributor || {};
  const name = escapeSubfield(item.name);
  const relationship = escapeSubfield(item.relationship).replace(/[.,;:]$/, "");
  return `$a${relationship ? `${name},` : finalPeriod(name)}${relationship ? `$e${finalPeriod(relationship)}` : ""}`;
}

function corporateContributorSubfields(contributor) {
  const item = typeof contributor === "string" ? { name: contributor, relationship: "" } : contributor || {};
  const name = escapeSubfield(item.name);
  const relationship = escapeSubfield(item.relationship).replace(/[.,;:]$/, "");
  return `$a${relationship ? `${name},` : finalPeriod(name)}${relationship ? `$e${finalPeriod(relationship)}` : ""}`;
}

function titleParts(value) {
  const text = escapeSubfield(value).replace(/[.\s]+$/, "");
  const separator = text.indexOf(" : ");
  return separator < 0
    ? { title: text, remainder: "" }
    : { title: text.slice(0, separator), remainder: text.slice(separator + 3) };
}

function nonfilingCharacters(title) {
  const match = String(title).match(/^(A|An|The)\s+/i);
  return match ? match[0].length : 0;
}

function titleStatement(record) {
  const { title, remainder } = titleParts(record.title);
  const hasMainEntry = Boolean(String(record.author || "").trim());
  const indicator2 = Math.min(nonfilingCharacters(title), 9);
  let data = `$a${title}${remainder ? ` :$b${remainder}` : ""}`;
  const explicitResponsibility = escapeSubfield(record.statementOfResponsibility);
  if (explicitResponsibility) data += ` /$c${explicitResponsibility}`;
  const contributors = Array.isArray(record.contributors) ? record.contributors : [];
  const statementNames = contributors.map((item) => escapeSubfield(item.statementName || item.name)).filter(Boolean);
  const relationships = new Set(contributors.map((item) => String(item.relationship || "").toLowerCase()));
  if (!explicitResponsibility && statementNames.length && relationships.size === 1 && relationships.has("editor")) {
    data += ` /$cedited by ${statementNames.join(", ")}`;
  }
  return `=245  ${hasMainEntry ? "1" : "0"}${indicator2}${finalPeriod(data)}`;
}

function publicationSubfields(value) {
  let text = escapeSubfield(value).replace(/[.\s]+$/, "");
  let date = "";
  const dateMatch = text.match(/,\s*(\[?\d{4}[^,;]*\]?)$/);
  if (dateMatch) {
    date = dateMatch[1];
    text = text.slice(0, dateMatch.index);
  }
  const statements = text.split(/\s*;\s*/).filter(Boolean);
  const encoded = statements.map((statement, index) => {
    const [place, ...publisherParts] = statement.split(/\s*:\s*/);
    const publisher = publisherParts.join(" : ");
    const separator = index < statements.length - 1 ? " ;" : date ? "," : "";
    return `$a${escapeSubfield(place)}${publisher ? ` :$b${escapeSubfield(publisher)}${separator}` : separator}`;
  }).join("");
  return `${encoded}${date ? `$c${finalPeriod(date)}` : ""}`;
}

function physicalDescriptionSubfields(value) {
  const text = escapeSubfield(value).replace(/[.\s]+$/, "");
  const semicolon = text.indexOf(" ; ");
  const description = semicolon < 0 ? text : text.slice(0, semicolon);
  const dimensions = semicolon < 0 ? "" : text.slice(semicolon + 3).trim();
  const colon = description.indexOf(" : ");
  const extent = (colon < 0 ? description : description.slice(0, colon)).trim();
  const otherDetails = colon < 0 ? "" : description.slice(colon + 3).trim();
  return [
    `$a${extent}${otherDetails ? " :" : dimensions ? " ;" : ""}`,
    otherDetails ? `$b${otherDetails}${dimensions ? " ;" : ""}` : "",
    dimensions ? `$c${dimensions}` : "",
  ].join("");
}

function classificationSubfields(value) {
  const text = escapeSubfield(value).replace(/[.\s]+$/, "");
  const parts = text.split(/\s+/);
  const cutterIndex = parts.findIndex((part, index) => index > 0 && /^[A-Z]\d/i.test(part));
  if (cutterIndex < 0) return `$a${text}`;
  return `$a${parts.slice(0, cutterIndex).join(" ")}$b${parts.slice(cutterIndex).join(" ")}`;
}

function books008(record) {
  const fixed = Array(40).fill(" ");
  const put = (offset, value, width) => String(value || "").padEnd(width, " ").slice(0, width).split("").forEach((character, index) => {
    fixed[offset + index] = character;
  });
  put(0, record.dateEntered || "000000", 6);
  fixed[6] = "s";
  const dateMatch = String(record.publication || "").match(/(?:^|\D)(\d{4})(?:\D|$)/);
  put(7, dateMatch?.[1] || "||||", 4);
  put(11, "    ", 4);
  put(15, record.placeCode || "xx#", 3);
  if (/illustrations?/i.test(String(record.extent || ""))) fixed[18] = "a";
  if (record.bibliographyNote) fixed[24] = "b";
  fixed[29] = "0";
  fixed[30] = "0";
  fixed[31] = record.hasIndex ? "1" : "0";
  const genre = String(record.genre || "").toLowerCase();
  fixed[33] = /novel|fiction/.test(genre) ? "1" : /nonfiction/.test(genre) ? "0" : "u";
  put(35, record.languageCode || "|||", 3);
  fixed[39] = "d";
  return fixed.join("");
}

export function buildMarcField(fieldPath, value, options = {}) {
  if (fieldPath === "isbn") return `=020  \\\\$a${escapeSubfield(value)}`;
  if (fieldPath === "classificationNumber") return `=050  \\4${classificationSubfields(value)}`;
  if (fieldPath === "geographicAreaCode") return `=043  \\\\$a${escapeSubfield(value)}`;
  if (fieldPath === "author") return `=100  1\\${authorSubfields(value, options.relationship)}`;
  if (fieldPath === "title") return titleStatement({ title: value, author: "", contributors: [] });
  if (fieldPath === "publication") return `=264  \\1${publicationSubfields(value)}`;
  if (fieldPath === "extent") return `=300  \\\\${physicalDescriptionSubfields(value)}`;
  if (fieldPath === "contentType") return `=336  \\\\$a${escapeSubfield(value)}$btxt$2rdacontent`;
  if (fieldPath === "mediaType") return `=337  \\\\$a${escapeSubfield(value)}$bn$2rdamedia`;
  if (fieldPath === "carrierType") return `=338  \\\\$a${escapeSubfield(value)}$bnc$2rdacarrier`;
  if (fieldPath === "summary") return `=520  \\\\$a${finalPeriod(escapeSubfield(value))}`;
  if (fieldPath === "bibliographyNote") return `=504  \\\\$a${finalPeriod(escapeSubfield(value))}`;
  if (fieldPath === "contentsNote") return `=505  0\\$a${finalPeriod(escapeSubfield(value))}`;
  if (fieldPath.startsWith("subjects.")) return `=650  \\0${finalPeriod(subjectSubfields(value, options.subjectDetail))}`;
  if (fieldPath === "genre") return `=655  \\7$a${finalPeriod(escapeSubfield(value))}$2lcgft`;
  if (fieldPath.startsWith("contributors.")) return `=700  1\\${contributorSubfields(value)}`;
  if (fieldPath.startsWith("corporateContributors.")) return `=710  2\\${corporateContributorSubfields(value)}`;
  throw new Error(`Unsupported MARC field path: ${fieldPath}`);
}

export function parseMarcField(fieldPath, marcLine) {
  const line = String(marcLine || "").trim();
  const expectedTag = {
    isbn: "020", classificationNumber: "050", geographicAreaCode: "043", author: "100", title: "245", publication: "264", extent: "300",
    contentType: "336", mediaType: "337", carrierType: "338", bibliographyNote: "504", contentsNote: "505", summary: "520", genre: "655"
  }[fieldPath] || (fieldPath.startsWith("subjects.") ? "650" : fieldPath.startsWith("contributors.") ? "700" : "");
  if (!line.startsWith(`=${expectedTag}  `)) throw new Error(`MARC field must begin with =${expectedTag}.`);
  const subfields = [...line.matchAll(/\$([a-z0-9])([^$]*)/gi)].map((match) => ({ code: match[1], value: match[2].trim() }));
  if (fieldPath === "summary") return subfields.find(({ code }) => code === "a")?.value || "";
  if (fieldPath === "author") {
    const name = subfields.find(({ code }) => code === "a")?.value || "";
    const date = subfields.find(({ code }) => code === "d")?.value || "";
    return date ? `${name.replace(/,$/, "")}, ${date}` : name;
  }
  if (fieldPath.startsWith("subjects.")) return subfields.filter(({ code }) => ["a", "x", "y", "z", "v"].includes(code)).map(({ value }) => value.replace(/[.]$/, "")).join("—");
  return subfields.find(({ code }) => code === "a")?.value || "";
}

export function buildMarcPreview(record) {
  if (!record) return "Final record will appear after the Creator produces a draft.";

  const lines = ["=LDR  00000nam a2200000 i 4500"];
  if (record.field005) lines.push(`=005  ${record.field005}`);
  if (record.books008) lines.push(`=008  ${books008(record)}`);
  for (const field of ["isbn", "classificationNumber", "geographicAreaCode", "author"]) {
    if (String(record[field] || "").trim()) lines.push(record.marcOverrides?.[field] || buildMarcField(field, record[field], {
      relationship: field === "author" ? record.creatorRelationship : ""
    }));
  }
  if (String(record.title || "").trim()) lines.push(record.marcOverrides?.title || titleStatement(record));
  for (const field of ["publication", "extent", "contentType", "mediaType", "carrierType", "bibliographyNote", "contentsNote", "summary"]) {
    if (String(record[field] || "").trim()) lines.push(record.marcOverrides?.[field] || buildMarcField(field, record[field]));
  }
  for (const [index, subject] of (record.subjects || []).entries()) {
    if (!String(subject || "").trim()) continue;
    const fieldPath = `subjects.${index}`;
    const subjectDetail = record.subjectDetails?.[index];
    const constructed = String(subject).split(/\s*(?:—|--)\s*/).filter(Boolean).length > 1;
    const unresolvedCode = subjectDetail?.value === subject && constructed && !["x", "y", "z", "v"].includes(subjectDetail.subdivisionMarcCode);
    lines.push(record.marcOverrides?.[fieldPath] || (unresolvedCode
      ? provisionalSubjectField(subject)
      : buildMarcField(fieldPath, subject, { subjectDetail })));
  }
  if (record.genre) lines.push(record.marcOverrides?.genre || buildMarcField("genre", record.genre));
  for (const [index, contributor] of (record.contributors || []).entries()) {
    if (!String(contributor?.name || contributor || "").trim()) continue;
    const fieldPath = `contributors.${index}`;
    lines.push(record.marcOverrides?.[fieldPath] || buildMarcField(fieldPath, contributor));
  }
  for (const [index, contributor] of (record.corporateContributors || []).entries()) {
    if (!String(contributor?.name || contributor || "").trim()) continue;
    const fieldPath = `corporateContributors.${index}`;
    lines.push(record.marcOverrides?.[fieldPath] || buildMarcField(fieldPath, contributor));
  }
  return lines.join("\n");
}
