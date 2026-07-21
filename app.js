import { buildMarcField, buildMarcPreview, parseMarcField } from "./marc.js";
import { requestLiveCreator, requestLiveReviewer, requestPdfEvidence } from "./api.js";
import { CURATED_SOURCE_PACKAGE } from "./fixtures.js";
import {
  detectSourceInput, fetchOpenLibraryByIsbn, findMetadataConflicts, mapRetrievedMetadata,
  OFFLINE_ISBN, OFFLINE_OPEN_LIBRARY_FIXTURE
} from "./isbn.js";
import {
  acceptRecommendation,
  confirmSourcePackage,
  createDemoDraft,
  createInitialState,
  createLiveDraft,
  DECISIONS,
  editRecommendation,
  fallbackToDemo,
  getAuditTrail,
  getDecisionSummary,
  MODES,
  recordLiveFailure,
  rejectRecommendation,
  resetWorkflow,
  runDemoReview,
  runLiveReview,
  setMode,
  updateSourcePackage
} from "./workflow.js";

const catalogingProfileResponse = await fetch("./cataloging-profile.json");
if (!catalogingProfileResponse.ok) throw new Error("Cataloging Policy Profile could not be loaded.");
const catalogingProfile = await catalogingProfileResponse.json();
let state = createInitialState(undefined, catalogingProfile);

const elements = {
  sourceIntake: document.querySelector("#source-intake"),
  pdfUpload: document.querySelector("#pdf-upload"),
  pdfEvidencePanel: document.querySelector("#pdf-evidence-panel"),
  pdfEvidenceSummary: document.querySelector("#pdf-evidence-summary"),
  pdfEvidenceList: document.querySelector("#pdf-evidence-list"),
  policyIdentity: document.querySelector("#policy-identity"),
  policySummary: document.querySelector("#policy-summary"),
  policyDetails: document.querySelector("#policy-details"),
  sourceText: document.querySelector("#source-text"),
  sourceTitle: document.querySelector("#source-title"),
  sourceAuthor: document.querySelector("#source-author"),
  sourceFormat: document.querySelector("#source-format"),
  sourceLanguage: document.querySelector("#source-language"),
  sourcePublication: document.querySelector("#source-publication"),
  sourceIsbn: document.querySelector("#source-isbn"),
  sourceNotes: document.querySelector("#source-notes"),
  sourceContents: document.querySelector("#source-contents"),
  sourceError: document.querySelector("#source-error"),
  creatorError: document.querySelector("#creator-error"),
  reviewerError: document.querySelector("#reviewer-error"),
  sourceWarnings: document.querySelector("#source-warnings"),
  confirmationStatus: document.querySelector("#confirmation-status"),
  createDraft: document.querySelector("#create-draft"),
  fallbackNotice: document.querySelector("#fallback-notice"),
  modeBadgeText: document.querySelector("#mode-badge-text"),
  creatorPanel: document.querySelector("#creator-panel"),
  creatorFields: document.querySelector("#creator-fields"),
  reviewPanel: document.querySelector("#review-panel"),
  reviewHeading: document.querySelector("#review-heading"),
  recommendations: document.querySelector("#recommendations"),
  reviewCoverage: document.querySelector("#review-coverage-list"),
  deterministicFindings: document.querySelector("#deterministic-findings"),
  deterministicFindingsList: document.querySelector("#deterministic-findings-list"),
  authorityChecks: document.querySelector("#authority-checks"),
  authorityChecksList: document.querySelector("#authority-checks-list"),
  noRecommendations: document.querySelector("#no-recommendations"),
  decisionSummary: document.querySelector("#decision-summary"),
  finalPanel: document.querySelector("#final-panel"),
  finalHeading: document.querySelector("#final-heading"),
  finalStatus: document.querySelector("#final-status"),
  finalExplanation: document.querySelector("#final-explanation"),
  marcPreview: document.querySelector("#marc-preview"),
  auditPanel: document.querySelector("#audit-panel"),
  auditSummary: document.querySelector("#audit-summary"),
  auditPreview: document.querySelector("#audit-preview")
};

const SOURCE_FIELDS = ["title", "author", "format", "language", "publicationInformation", "isbn", "description", "additionalNotes", "contents"];

const FIELD_LABELS = [
  ["ISBN", "020", "isbn"],
  ["Proposed LC call number", "050", "classificationNumber"],
  ["Classification rationale", "Human-review note", "classificationRationale"],
  ["Geographic area code", "043", "geographicAreaCode"],
  ["Author/Creator", "100", "author"],
  ["Creator relationship", "100 $e", "creatorRelationship"],
  ["Title", "245", "title"],
  ["Publication information", "264", "publication"],
  ["Physical description", "300", "extent"],
  ["Bibliography note", "504", "bibliographyNote"],
  ["Contents note", "505", "contentsNote"],
  ["Summary", "520", "summary"],
  ["Subject headings", "650", "subjects"],
  ["Genre/form heading", "655", "genre"],
  ["Personal contributors", "700", "contributors"],
  ["Corporate contributors", "710", "corporateContributors"]
];

const REVIEW_LABELS = {
  isbn: ["ISBN", "020"],
  classificationNumber: ["Proposed LC call number", "050"],
  geographicAreaCode: ["Geographic area code", "043"],
  author: ["Author/Creator", "100"],
  title: ["Title", "245"],
  publication: ["Publication information", "264"],
  extent: ["Physical description", "300"],
  contentType: ["Content type", "336"],
  mediaType: ["Media type", "337"],
  carrierType: ["Carrier type", "338"],
  summary: ["Summary", "520"],
  contentsNote: ["Contents note", "505"],
  bibliographyNote: ["Bibliography note", "504"],
  "subjects.0": ["Subject heading", "650"],
  "subjects.1": ["Subject heading", "650"],
  "subjects.2": ["Subject heading", "650"],
  genre: ["Genre/form heading", "655"]
};

function collectSourcePackage() {
  return {
    title: elements.sourceTitle.value.trim(),
    author: elements.sourceAuthor.value.trim(),
    format: elements.sourceFormat.value.trim(),
    language: elements.sourceLanguage.value.trim(),
    publicationInformation: elements.sourcePublication.value.trim(),
    isbn: elements.sourceIsbn.value.trim(),
    description: elements.sourceText.value.trim(),
    additionalNotes: elements.sourceNotes.value.trim(),
    contents: elements.sourceContents.value.trim()
  };
}

function humanProvenance(sourcePackage) {
  return {
    inputType: "text", provider: "Human supplied", metadataClassification: "human_supplied",
    authoritative: false, sourceUrl: null, retrievedAt: null, offlineFixtureUsed: false,
    fieldProvenance: Object.fromEntries(SOURCE_FIELDS.filter((field) => sourcePackage[field]).map((field) => [field, {
      label: "Human supplied", classification: "human_supplied", provider: "Human supplied"
    }])), warnings: []
  };
}

function renderSourceStatus() {
  const provenance = state.source.retrieval?.fieldProvenance || {};
  for (const field of SOURCE_FIELDS) {
    const badge = document.querySelector(`#provenance-${field}`);
    badge.textContent = provenance[field]?.label || (state.source.package[field] ? "Human supplied" : "No source value");
    badge.classList.toggle("retrieved", provenance[field]?.classification === "retrieved_metadata");
  }
  const warnings = state.source.retrieval?.warnings || [];
  elements.sourceWarnings.replaceChildren(...warnings.map((warning) => textElement("p", "source-warning", `Warning: ${warning}`)));
  elements.confirmationStatus.textContent = state.source.confirmed ? "Confirmed by human" : "Review or edit, then confirm";
  elements.confirmationStatus.classList.toggle("confirmed", state.source.confirmed);
  elements.createDraft.disabled = !state.source.confirmed || Boolean(state.creatorDraft);
  const evidence = state.source.retrieval?.evidence || [];
  elements.pdfEvidencePanel.hidden = state.source.retrieval?.inputType !== "pdf";
  if (!elements.pdfEvidencePanel.hidden) {
    const method = state.source.retrieval.offlineFixtureUsed ? "deterministic curated extraction" : "live AI extraction";
    elements.pdfEvidenceSummary.textContent = `${state.source.retrieval.fileName} · ${state.source.retrieval.pageCount || "?"} pages · ${method}. Review the populated Source Package before confirming.`;
    elements.pdfEvidenceList.replaceChildren(...evidence.map((item) => {
      const row = document.createElement("article");
      row.className = "pdf-evidence-item";
      const heading = document.createElement("h4");
      heading.append(textElement("span", "", item.label));
      heading.append(textElement("span", `confidence ${item.confidence}`, `${item.confidence} confidence`));
      row.append(heading);
      row.append(textElement("p", "evidence-value", item.value));
      row.append(textElement("blockquote", "", item.evidenceExcerpt));
      row.append(textElement("small", "", `${item.pageLabel} · ${item.extractionNote}`));
      return row;
    }));
  }
}

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function renderPolicyProfile() {
  const vocabularies = catalogingProfile.targetVocabularies.map(({ name }) => name).join(" / ");
  elements.policyIdentity.textContent = `${catalogingProfile.profileLabel} · v${catalogingProfile.profileVersion}`;
  elements.policySummary.replaceChildren(
    textElement("li", "", `Description standard: ${catalogingProfile.descriptionStandard}`),
    textElement("li", "", `Encoding: ${catalogingProfile.encodingStandard}`),
    textElement("li", "", `Target vocabularies: ${vocabularies}`),
    textElement("li", "", "Authority verification: reported explicitly"),
    textElement("li", "", `Human approval: ${catalogingProfile.humanApprovalRequired ? "required" : "not required"}`)
  );
  elements.policyDetails.replaceChildren(
    textElement("li", "", catalogingProfile.evidenceRule),
    textElement("li", "", catalogingProfile.missingEvidenceBehavior),
    textElement("li", "", catalogingProfile.authorityRule),
    ...catalogingProfile.prohibitedAssumptions.map((rule) => textElement("li", "", rule))
  );
}

function renderProgress() {
  const order = ["source", "draft", "review", "decision", "final"];
  const currentIndex = order.indexOf(state.stage);
  document.querySelectorAll("[data-stage]").forEach((item) => {
    const itemIndex = order.indexOf(item.dataset.stage);
    item.classList.toggle("active", itemIndex === currentIndex);
    item.classList.toggle("complete", itemIndex < currentIndex);
  });
}

function renderMode() {
  const effectiveMode = state.audit?.effectiveMode || state.mode;
  const fellBack = state.audit?.fallbackEvents?.length > 0;
  elements.modeBadgeText.textContent = fellBack
    ? "Demo fallback · Live requested"
    : effectiveMode === MODES.LIVE
      ? "Live Creator + Reviewer mode"
      : "Deterministic Demo mode";
  document.querySelectorAll('input[name="run-mode"]').forEach((input) => {
    input.checked = input.value === state.mode;
    input.disabled = Boolean(state.creatorDraft);
  });
  elements.fallbackNotice.hidden = !state.notice;
  elements.fallbackNotice.textContent = state.notice || "";
}

function renderCreatorDraft() {
  elements.creatorFields.replaceChildren();
  if (!state.creatorDraft) return;

  for (const [label, marcTag, field] of FIELD_LABELS) {
    const value = Array.isArray(state.creatorDraft[field])
      ? state.creatorDraft[field].map((item) => typeof item === "string" ? item : `${item.name}${item.relationship ? ` (${item.relationship})` : ""}`).join("; ")
      : state.creatorDraft[field];
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    term.append(textElement("span", "plain-field-label", label));
    term.append(textElement("span", "marc-tag-label", field === "classificationRationale" ? "Review metadata · not MARC" : `${marcTag} MARC field`));
    wrapper.append(term);
    wrapper.append(textElement("dd", "", value));
    elements.creatorFields.append(wrapper);
  }
}

function recommendationActionUi(recommendation) {
  const action = recommendation.action || (recommendation.currentValue ? "replace" : "add");
  const labels = {
    add: {
      proposal: "Reviewer proposes adding",
      proposedValue: recommendation.proposedValue,
      accept: "Accept addition",
      reject: "Do not add",
      accepted: "Addition accepted by human"
    },
    replace: {
      proposal: "Reviewer proposes replacing with",
      proposedValue: recommendation.proposedValue,
      accept: "Accept replacement",
      reject: "Keep Creator value",
      accepted: "Replacement accepted by human"
    },
    remove: {
      proposal: "Reviewer proposes removal",
      proposedValue: "Remove this value from the final record",
      accept: "Accept removal",
      reject: "Keep Creator value",
      accepted: "Removal accepted by human"
    }
  };
  return { action, ...labels[action] };
}

function decisionLabel(decision, actionUi) {
  return {
    [DECISIONS.PENDING]: "Pending human decision",
    [DECISIONS.ACCEPTED]: actionUi.accepted,
    [DECISIONS.EDITED]: "Edited by human",
    [DECISIONS.REJECTED]: "Recommendation rejected by human"
  }[decision];
}

function createRecommendationCard(recommendation) {
  const actionUi = recommendationActionUi(recommendation);
  const card = document.createElement("article");
  card.className = `recommendation ${recommendation.decision}`;
  card.dataset.recommendationId = recommendation.id;

  const header = document.createElement("div");
  header.className = "recommendation-header";
  const [plainLabel, marcTag] = REVIEW_LABELS[recommendation.field] || [recommendation.fieldLabel, "MARC"];
  const heading = document.createElement("h3");
  heading.append(textElement("span", "plain-field-label", plainLabel));
  heading.append(textElement("span", "marc-tag-label", `${marcTag} MARC field`));
  header.append(heading);
  header.append(textElement("span", `confidence ${recommendation.confidence}`, `${recommendation.confidence} confidence`));
  card.append(header);

  const comparison = document.createElement("div");
  comparison.className = "comparison";
  const current = document.createElement("div");
  current.append(textElement("span", "comparison-label", "Creator draft"));
  current.append(textElement("p", "", recommendation.currentValue || "No value in Creator draft"));
  const proposed = document.createElement("div");
  proposed.append(textElement("span", "comparison-label", actionUi.proposal));
  proposed.append(textElement("p", "", actionUi.proposedValue));
  if (actionUi.action !== "remove") {
    proposed.append(textElement("code", "marc-field", buildMarcField(recommendation.field, recommendation.proposedValue)));
  }
  comparison.append(current, proposed);
  card.append(comparison);

  const rationale = document.createElement("div");
  rationale.className = "rationale";
  rationale.append(textElement("strong", "", "Why"));
  rationale.append(textElement("p", "", recommendation.explanation));
  rationale.append(textElement("strong", "", "Supporting evidence"));
  rationale.append(textElement("p", "evidence-source", `Evidence source: ${recommendation.evidenceSource || recommendation.evidenceLocation}`));
  rationale.append(textElement("blockquote", "", recommendation.evidence));
  rationale.append(textElement("small", "", recommendation.evidenceLocation));
  if (recommendation.standardBasis) rationale.append(textElement("p", "standard-basis", `Standards basis: ${recommendation.standardBasis}`));
  if (recommendation.verificationStatus) rationale.append(textElement("p", "verification-status", `Verification: ${recommendation.verificationStatus.replaceAll("_", " ")}${recommendation.verificationSource ? ` · ${recommendation.verificationSource}` : ""}`));
  card.append(rationale);

  if (recommendation.decision === DECISIONS.EDITED) {
    const applied = textElement("p", "applied-value", `Human-applied value: ${recommendation.editedValue}`);
    card.append(applied);
    if (recommendation.editedMarc) {
      card.append(textElement("code", "marc-field applied-marc", recommendation.editedMarc));
    }
  }

  const controls = document.createElement("div");
  controls.className = "decision-controls";
  const accept = textElement("button", "button button-accept", actionUi.accept);
  accept.type = "button";
  accept.dataset.action = "accept";
  const edit = textElement("button", "button button-edit", "Edit recommendation");
  edit.type = "button";
  edit.dataset.action = "edit";
  const reject = textElement("button", "button button-reject", actionUi.reject);
  reject.type = "button";
  reject.dataset.action = "reject";
  controls.append(accept, edit, reject);
  card.append(controls);

  const editArea = document.createElement("div");
  editArea.className = "edit-area";
  editArea.hidden = true;
  const marcLabel = textElement("label", "marc-edit-label", "Edit MARC field");
  marcLabel.htmlFor = `marc-${recommendation.id}`;
  const marcInput = document.createElement("input");
  marcInput.id = marcLabel.htmlFor;
  marcInput.className = "marc-edit-input";
  const editableValue = actionUi.action === "remove" ? recommendation.currentValue : recommendation.proposedValue;
  marcInput.value = recommendation.editedMarc || buildMarcField(recommendation.field, editableValue);
  const applyEdit = textElement("button", "button button-primary", "Apply human edit");
  applyEdit.type = "button";
  applyEdit.dataset.action = "apply-edit";
  editArea.append(marcLabel, marcInput, applyEdit);
  card.append(editArea);

  card.append(textElement("p", `decision-state ${recommendation.decision}`, decisionLabel(recommendation.decision, actionUi)));
  return card;
}

function renderRecommendations() {
  elements.reviewHeading.textContent = state.recommendations.length === 0
    ? "Field review complete"
    : `Review ${state.recommendations.length} recommendation${state.recommendations.length === 1 ? "" : "s"}`;
  elements.recommendations.replaceChildren(
    ...state.recommendations.map(createRecommendationCard)
  );
  const summary = getDecisionSummary(state);
  elements.decisionSummary.textContent = [
    `${summary.accepted} accepted`,
    `${summary.edited} edited`,
    `${summary.rejected} rejected`,
    `${summary.pending} pending`
  ].join(" · ");
  elements.noRecommendations.hidden = state.recommendations.length !== 0;
  elements.reviewCoverage.replaceChildren(...state.reviewerCoverage.map((item) => {
    const li = document.createElement("li");
    li.className = item.status;
    const statusLabel = {
      recommendation: "change recommended", no_change: "no change needed",
      change_recommended: "change recommended", missing_field: "missing field",
      needs_verification: "needs verification", not_assessable: "not assessable"
    }[item.status] || item.status;
    li.append(textElement("strong", "", `${item.label} · ${item.field} — ${statusLabel}`));
    if (item.assessment) li.append(textElement("span", "coverage-assessment", item.assessment));
    if (item.verificationStatus) li.append(textElement("small", "", `Verification: ${item.verificationStatus.replaceAll("_", " ")}${item.verificationSource ? ` · ${item.verificationSource}` : ""}`));
    return li;
  }));
  elements.deterministicFindings.hidden = state.deterministicFindings.length === 0;
  elements.deterministicFindingsList.replaceChildren(...state.deterministicFindings.map((finding) =>
    textElement("li", finding.severity, `${finding.field} · ${finding.message}`)
  ));
  elements.authorityChecks.hidden = state.authorityChecks.length === 0;
  elements.authorityChecksList.replaceChildren(...state.authorityChecks.map((check) => {
    const item = document.createElement("article");
    item.className = `authority-check ${check.status}`;
    const status = check.status === "verified_construction" ? "Authorized construction" :
      check.status === "variant_resolved" ? "Variant resolved to authorized heading" :
      check.status === "verified_form" ? "Authorized form found" :
      check.status === "lookup_unavailable" ? "LC lookup unavailable" : "Exact form not verified";
    item.append(textElement("strong", "", `${check.vocabulary} · ${check.candidate} — ${status}`));
    item.append(textElement("p", "", check.note));
    const details = document.createElement("details");
    details.append(textElement("summary", "", "View authority evidence"));
    const evidence = document.createElement("div");
    evidence.className = "authority-evidence";
    if (check.authorizedLabel) evidence.append(textElement("p", "", `Authorized label: ${check.authorizedLabel}`));
    if (check.suggestedAuthorizedReplacement) evidence.append(textElement("p", "", `Authorized replacement: ${check.suggestedAuthorizedReplacement}`));
    if (check.variantEvidence?.matchedVariant) evidence.append(textElement("p", "", `Variant reference (450): ${check.variantEvidence.matchedVariant}`));
    for (const note of check.variantEvidence?.scopeNotes || []) evidence.append(textElement("p", "", `Scope note: ${note}`));
    if (check.constructionStatus) evidence.append(textElement("p", "", `Construction: ${check.constructionStatus.replaceAll("_", " ")}`));
    if (check.subdivisionType) evidence.append(textElement("p", "", `Subdivision: ${check.subdivisionType} · MARC $${check.subdivisionMarcCode}`));
    if (check.geographicSubdivisionCode) evidence.append(textElement("p", "", `Main authority 008/06: ${check.geographicSubdivisionCode} · ${check.geographicSubdivisionMethod}`));
    if (check.subjectUseCode) evidence.append(textElement("p", "", `Main authority 008/15: ${check.subjectUseCode} · ${check.subjectUseCode === "a" ? "appropriate for subject use" : "not confirmed for subject use"}`));
    for (const component of check.components || []) {
      const componentRow = document.createElement("p");
      componentRow.append(`${component.role.replaceAll("_", " ")}: ${component.label} · ${component.status.replaceAll("_", " ")}`);
      if (component.authorityUri) {
        const componentLink = document.createElement("a");
        componentLink.href = component.authorityUri.replace(/^http:/, "https:");
        componentLink.target = "_blank";
        componentLink.rel = "noreferrer";
        componentLink.textContent = "LC record";
        componentRow.append(" · ", componentLink);
      }
      evidence.append(componentRow);
    }
    evidence.append(textElement("p", "", `Application: ${check.applicationStatus.replaceAll("_", " ")}`));
    evidence.append(textElement("p", "", `Checked: ${check.checkedAt}`));
    const link = document.createElement("a");
    link.href = check.authorityUri || check.lookupUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = check.authorityUri ? "Open LC authority record" : "Open LC lookup";
    evidence.append(link);
    details.append(evidence);
    item.append(details);
    return item;
  }));
}

function renderFinalRecord() {
  if (!state.finalRecord) return;
  const complete = state.stage === "final";
  const decisions = getDecisionSummary(state);
  const reviewStarted = decisions.accepted + decisions.edited + decisions.rejected > 0;
  elements.finalHeading.textContent = complete
    ? "Final MARC record"
    : reviewStarted ? "Human-reviewed MARC record" : "Creator MARC draft";
  elements.finalStatus.textContent = complete
    ? "Human review complete"
    : reviewStarted ? `${decisions.pending} decision${decisions.pending === 1 ? "" : "s"} pending` : "Preview · decisions pending";
  elements.finalStatus.classList.toggle("complete", complete);
  elements.finalExplanation.textContent = complete
    ? state.recommendations.length === 0
      ? "The Reviewer completed all field checks and recommended no changes; the Creator draft remains the final record."
      : `This final record reflects ${decisions.accepted} accepted, ${decisions.edited} edited, and ${decisions.rejected} rejected recommendation${state.recommendations.length === 1 ? "" : "s"}.`
    : "The preview updates only when the human accepts or edits a recommendation.";
  elements.marcPreview.textContent = buildMarcPreview(state.finalRecord);
}

function renderAudit() {
  const audit = getAuditTrail(state);
  elements.auditPanel.hidden = !audit;
  if (!audit) return;
  const fallbackCount = audit.fallbackEvents.length;
  elements.auditSummary.textContent = [
    `Run ${audit.runId}`,
    `Policy ${audit.catalogingProfile?.profileId || "not recorded"} v${audit.catalogingProfile?.profileVersion || "?"}`,
    audit.effectiveMode === MODES.LIVE ? "LIVE API run" : audit.requestedMode === MODES.LIVE ? "DEMO fallback run" : "DEMO fixture run · no API calls",
    `${audit.humanDecisions.length} decision event${audit.humanDecisions.length === 1 ? "" : "s"}`,
    fallbackCount ? `${fallbackCount} visible fallback event${fallbackCount === 1 ? "" : "s"}` : "no fallback"
  ].join(" · ");
  elements.auditPreview.textContent = JSON.stringify(audit, null, 2);
}

function render() {
  const sourcePackage = state.source.package;
  elements.sourceTitle.value = sourcePackage.title || "";
  elements.sourceAuthor.value = sourcePackage.author || "";
  elements.sourceFormat.value = sourcePackage.format || "";
  elements.sourceLanguage.value = sourcePackage.language || "";
  elements.sourcePublication.value = sourcePackage.publicationInformation || "";
  elements.sourceIsbn.value = sourcePackage.isbn || "";
  elements.sourceText.value = sourcePackage.description || "";
  elements.sourceNotes.value = sourcePackage.additionalNotes || "";
  elements.sourceContents.value = sourcePackage.contents || "";
  elements.creatorPanel.hidden = !state.creatorDraft;
  elements.reviewPanel.hidden = state.reviewerCoverage.length === 0;
  elements.finalPanel.hidden = !state.finalRecord;
  renderMode();
  renderProgress();
  renderCreatorDraft();
  renderRecommendations();
  renderFinalRecord();
  renderAudit();
  renderSourceStatus();
}

function setBusy(button, busy, label) {
  if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.originalLabel;
}

async function preparePdfSource(file) {
  if (!file) throw new Error("Choose a PDF file first.");
  if (file.size > 25 * 1024 * 1024) throw new Error("PDF exceeds the 25 MB Build Week limit.");
  const result = await requestPdfEvidence(file);
  updateSourcePackage(state, result.sourcePackage, result.retrieval);
  elements.sourceIntake.value = "";
  render();
}

elements.pdfUpload.addEventListener("change", () => {
  if (!elements.pdfUpload.files?.[0] || state.creatorDraft) return;
  updateSourcePackage(state, {
    title: "", author: "", format: "", language: "", publicationInformation: "", isbn: "", description: "", additionalNotes: "", contents: ""
  }, {
    inputType: "pdf_pending", provider: "Human-supplied PDF", metadataClassification: "human_supplied",
    authoritative: false, sourceUrl: null, retrievedAt: null, offlineFixtureUsed: false,
    fileName: elements.pdfUpload.files[0].name, fieldProvenance: {}, evidence: [],
    warnings: ["PDF selected. Choose Prepare source package to extract and review its evidence."]
  });
  render();
});

document.querySelectorAll("#source-title, #source-author, #source-format, #source-language, #source-publication, #source-isbn, #source-text, #source-notes, #source-contents")
  .forEach((input) => input.addEventListener("input", () => {
    const packageValue = collectSourcePackage();
    const retrieval = structuredClone(state.source.retrieval || humanProvenance(packageValue));
    const field = {
      "source-title": "title", "source-author": "author", "source-format": "format", "source-language": "language",
      "source-publication": "publicationInformation", "source-isbn": "isbn",
      "source-text": "description", "source-notes": "additionalNotes", "source-contents": "contents"
    }[input.id];
    retrieval.fieldProvenance[field] = { label: "Human verified / edited", classification: "human_supplied", provider: "Human" };
    updateSourcePackage(state, packageValue, retrieval);
    renderSourceStatus();
  }));

document.querySelector("#prepare-source").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  elements.sourceError.textContent = "";
  const sourceValue = elements.sourceIntake.value.trim() || elements.sourceIsbn.value.trim();
  const detected = detectSourceInput(sourceValue);
  try {
    const pdfFile = elements.pdfUpload.files?.[0];
    if (pdfFile) {
      setBusy(button, true, "Extracting PDF evidence…");
      await preparePdfSource(pdfFile);
      return;
    }
    if (!sourceValue) throw new Error("Enter pasted text above or an ISBN in either ISBN box first.");
    if (detected.type === "text") {
      const sourcePackage = { title: "", author: "", format: "", language: "", publicationInformation: "", isbn: "", description: detected.value, additionalNotes: "", contents: "" };
      updateSourcePackage(state, sourcePackage, humanProvenance(sourcePackage));
    } else {
      if (!detected.valid) throw new Error(`${detected.version} checksum is invalid. Check the number and try again.`);
      setBusy(button, true, "Retrieving metadata…");
      let mapped;
      if (detected.normalized === OFFLINE_ISBN) {
        mapped = mapRetrievedMetadata(OFFLINE_OPEN_LIBRARY_FIXTURE, detected.normalized, { offline: true });
        mapped.retrieval.warnings.unshift("Deterministic offline ISBN fixture selected; no network retrieval was required.");
      } else {
        const result = await fetchOpenLibraryByIsbn(detected.normalized);
        mapped = mapRetrievedMetadata(result.data, detected.normalized, { sourceUrl: result.sourceUrl });
        mapped.retrieval.lookupMethod = result.lookupMethod;
      }
      if (state.source.retrieval?.inputType !== "fixture") {
        mapped.retrieval.warnings.push(...findMetadataConflicts(state.source.package, mapped.sourcePackage));
      }
      updateSourcePackage(state, mapped.sourcePackage, mapped.retrieval);
    }
    render();
  } catch (error) {
    elements.sourceError.textContent = error.message;
  } finally {
    setBusy(button, false, "");
  }
});

document.querySelector("#load-demo-fixture").addEventListener("click", () => {
  const sourcePackage = structuredClone(CURATED_SOURCE_PACKAGE);
  const retrieval = {
    inputType: "fixture", provider: "Fictional Build Week fixture", metadataClassification: "fictional_fixture",
    authoritative: false, sourceUrl: null, retrievedAt: null, offlineFixtureUsed: false,
    fieldProvenance: Object.fromEntries(SOURCE_FIELDS.filter((field) => sourcePackage[field]).map((field) => [field, {
      label: "Fictional demo fixture", classification: "fictional_fixture", provider: "Build Week demo"
    }])),
    warnings: ["This is fictional demonstration data. It was not retrieved from a bibliographic source."]
  };
  elements.sourceIntake.value = "";
  updateSourcePackage(state, sourcePackage, retrieval);
  elements.sourceError.textContent = "";
  render();
});

document.querySelector("#extract-pdf").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  elements.sourceError.textContent = "";
  try {
    const file = elements.pdfUpload.files?.[0];
    setBusy(button, true, "Extracting evidence…");
    await preparePdfSource(file);
  } catch (error) {
    elements.sourceError.textContent = error.message;
  } finally {
    setBusy(button, false, "");
  }
});

document.querySelector("#confirm-source").addEventListener("click", () => {
  try {
    elements.sourceError.textContent = "";
    confirmSourcePackage(state, collectSourcePackage(), state.source.retrieval);
    render();
  } catch (error) {
    elements.sourceError.textContent = error.message;
  }
});

document.querySelectorAll('input[name="run-mode"]').forEach((input) => {
  input.addEventListener("change", () => {
    try {
      setMode(state, input.value);
      render();
    } catch (error) {
      elements.sourceError.textContent = error.message;
      render();
    }
  });
});

document.querySelector("#create-draft").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  try {
    elements.sourceError.textContent = "";
    elements.creatorError.textContent = "";
    state.notice = null;
    const usesFictionalFixture = state.source.retrieval?.inputType === "fixture";
    if (state.mode === MODES.DEMO && !usesFictionalFixture) {
      throw new Error("Demo mode can create only the explicitly loaded fictional fixture. Select Live for pasted text or ISBN sources.");
    }
    if (state.mode === MODES.LIVE) {
      setBusy(button, true, "Creator is drafting…");
      try {
        const sourcePackage = state.source.confirmedPackage;
        const result = await requestLiveCreator(sourcePackage, catalogingProfile);
        createLiveDraft(state, sourcePackage, result.draft, result.metadata);
      } catch (error) {
        if (usesFictionalFixture) fallbackToDemo(state, "creator", error.message);
        else {
          recordLiveFailure(state, "creator", error.message);
          elements.creatorError.textContent = `Creator did not run: ${error.message} No fictional output was substituted. Verify that api_server.py is running and Live mode has an API key.`;
        }
      }
    } else {
      createDemoDraft(state, state.source.confirmedPackage);
    }
    render();
    if (state.creatorDraft) elements.creatorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    elements.creatorError.textContent = error.message;
  } finally {
    setBusy(button, false, "");
  }
});

document.querySelector("#run-review").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  try {
    elements.reviewerError.textContent = "";
    if (state.mode === MODES.LIVE && state.audit?.effectiveMode === MODES.LIVE) {
      setBusy(button, true, "Reviewer is analyzing…");
      try {
        const result = await requestLiveReviewer(state.source.confirmedPackage, state.creatorDraft, catalogingProfile);
        runLiveReview(state, result.recommendations, result.metadata, result.reviewCoverage, result.deterministicFindings || [], result.authorityChecks || []);
      } catch (error) {
        if (state.source.retrieval?.inputType === "fixture") fallbackToDemo(state, "reviewer", error.message);
        else {
          recordLiveFailure(state, "reviewer", error.message);
          elements.reviewerError.textContent = `Reviewer did not run: ${error.message} The Creator draft was preserved and no fictional recommendations were substituted.`;
        }
      }
    } else {
      runDemoReview(state);
    }
    render();
    if (state.reviewerCoverage.length) elements.reviewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    elements.reviewerError.textContent = error.message;
  } finally {
    setBusy(button, false, "");
  }
});

elements.recommendations.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  const card = event.target.closest("[data-recommendation-id]");
  if (!button || !card) return;
  const recommendationId = card.dataset.recommendationId;

  if (button.dataset.action === "accept") acceptRecommendation(state, recommendationId);
  if (button.dataset.action === "reject") rejectRecommendation(state, recommendationId);
  if (button.dataset.action === "edit") {
    const editArea = card.querySelector(".edit-area");
    editArea.hidden = !editArea.hidden;
    if (!editArea.hidden) editArea.querySelector("input").focus();
    return;
  }
  if (button.dataset.action === "apply-edit") {
    const marcValue = card.querySelector(".marc-edit-input").value;
    editRecommendation(
      state,
      recommendationId,
      parseMarcField(state.recommendations.find(({id}) => id === recommendationId).field, marcValue),
      marcValue
    );
  }
  render();
});

document.querySelector("#reset-demo").addEventListener("click", () => {
  state = resetWorkflow(state.mode, catalogingProfile);
  elements.sourceError.textContent = "";
  elements.creatorError.textContent = "";
  elements.reviewerError.textContent = "";
  elements.pdfUpload.value = "";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.querySelector("#download-audit").addEventListener("click", () => {
  const audit = getAuditTrail(state);
  if (!audit) return;
  const blob = new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${audit.runId}.audit.json`;
  link.click();
  URL.revokeObjectURL(url);
});

renderPolicyProfile();
render();
