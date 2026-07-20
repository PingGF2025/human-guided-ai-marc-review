async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Live request failed with status ${response.status}.`);
  }
  return body;
}

export async function requestLiveCreator(sourcePackage, catalogingProfile) {
  return postJson("/api/creator", { sourcePackage, catalogingProfile });
}

export async function requestLiveReviewer(sourcePackage, draft, catalogingProfile) {
  return postJson("/api/reviewer", { sourcePackage, draft, catalogingProfile });
}

export async function requestPdfEvidence(file) {
  if (!(file instanceof File) || (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))) {
    throw new Error("Choose a PDF file before extracting evidence.");
  }
  const body = new FormData();
  body.append("pdf", file, file.name);
  const response = await fetch("/api/source/pdf", { method: "POST", body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `PDF extraction failed with status ${response.status}.`);
  return payload;
}
