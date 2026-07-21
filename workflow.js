import {
  CURATED_CREATOR_DRAFT,
  CURATED_RECOMMENDATIONS,
  CURATED_REVIEW_COVERAGE,
  CURATED_SOURCE_PACKAGE,
  CURATED_SOURCE_TEXT
} from "./fixtures.js";

export const DECISIONS = Object.freeze({
  PENDING: "pending",
  ACCEPTED: "accepted",
  EDITED: "edited",
  REJECTED: "rejected",
  REMOVED: "removed"
});

export const MODES = Object.freeze({
  DEMO: "demo",
  LIVE: "live"
});

function clone(value) {
  return structuredClone(value);
}

function now() {
  return new Date().toISOString();
}

function runId() {
  return globalThis.crypto?.randomUUID?.() || `run-${Date.now()}`;
}

function normalizeSourcePackage(sourceInput) {
  if (sourceInput && typeof sourceInput === "object") return clone(sourceInput);
  return {
    title: "", author: "", format: "", language: "", publicationInformation: "", isbn: "",
    description: String(sourceInput || "").trim(), additionalNotes: "", contents: ""
  };
}

function createAudit(requestedMode, sourceInput, sourceRetrieval, catalogingProfile) {
  const timestamp = now();
  return {
    runId: runId(),
    startedAt: timestamp,
    updatedAt: timestamp,
    requestedMode,
    effectiveMode: requestedMode,
    sourceInput: normalizeSourcePackage(sourceInput),
    sourceRetrieval: clone(sourceRetrieval),
    catalogingProfile: clone(catalogingProfile),
    creatorDraft: null,
    reviewerRecommendations: [],
    reviewerCoverage: [],
    deterministicFindings: [],
    authorityChecks: [],
    humanDecisions: [],
    finalRecord: null,
    fallbackEvents: [],
    liveAttempts: {
      creator: null,
      reviewer: null
    }
  };
}

function touchAudit(state) {
  if (state.audit) state.audit.updatedAt = now();
}

function blankReview(recommendation) {
  return {
    ...clone(recommendation),
    decision: DECISIONS.PENDING,
    editedValue: null,
    editedMarc: null,
    decidedAt: null
  };
}

export function createInitialState(mode = MODES.DEMO, catalogingProfile = null) {
  if (!Object.values(MODES).includes(mode)) throw new Error(`Unsupported mode: ${mode}`);
  return {
    mode,
    catalogingProfile: clone(catalogingProfile),
    stage: "source",
    source: {
      type: "text",
      label: "Empty source intake",
      text: "",
      package: normalizeSourcePackage(""),
      confirmedPackage: null,
      confirmed: false,
      retrieval: {
        inputType: "empty", provider: "Not yet supplied", metadataClassification: "human_supplied",
        authoritative: false, sourceUrl: null, retrievedAt: null, offlineFixtureUsed: false,
        fieldProvenance: {},
        warnings: []
      },
      warnings: []
    },
    creatorDraft: null,
    recommendations: [],
    reviewerCoverage: [],
    deterministicFindings: [],
    authorityChecks: [],
    finalRecord: null,
    notice: null,
    audit: null
  };
}

export function updateSourcePackage(state, sourcePackage, retrieval = state.source.retrieval) {
  if (state.creatorDraft) throw new Error("Reset the current run before changing its source package.");
  state.source.package = normalizeSourcePackage(sourcePackage);
  state.source.text = state.source.package.description;
  state.source.retrieval = clone(retrieval);
  state.source.warnings = clone(retrieval?.warnings || []);
  state.source.confirmed = false;
  state.source.confirmedPackage = null;
  return state;
}

export function confirmSourcePackage(state, sourcePackage = state.source.package, retrieval = state.source.retrieval) {
  updateSourcePackage(state, sourcePackage, retrieval);
  if (!state.source.package.title && !state.source.package.description) {
    throw new Error("A title or resource description is required before confirming the source package.");
  }
  state.source.confirmedPackage = clone(state.source.package);
  state.source.confirmed = true;
  return state;
}

export function setMode(state, mode) {
  if (!Object.values(MODES).includes(mode)) throw new Error(`Unsupported mode: ${mode}`);
  if (state.creatorDraft) throw new Error("Reset the current run before changing mode.");
  state.mode = mode;
  state.notice = null;
  return state;
}

function beginDraft(state, sourceInput, draft, effectiveMode, metadata = null) {
  const sourcePackage = normalizeSourcePackage(sourceInput);
  if (!state.source.confirmed || !state.source.confirmedPackage) throw new Error("Verify and confirm the visible Resource Source Package before creating a draft.");
  if (JSON.stringify(sourcePackage) !== JSON.stringify(state.source.confirmedPackage)) throw new Error("Creator input must exactly match the visible, confirmed source package.");
  state.source.package = sourcePackage;
  state.source.text = sourcePackage.description;
  state.creatorDraft = clone(draft);
  state.recommendations = [];
  state.reviewerCoverage = [];
  state.deterministicFindings = [];
  state.authorityChecks = [];
  state.finalRecord = clone(draft);
  state.stage = "draft";
  state.audit = createAudit(state.mode, sourcePackage, state.source.retrieval, state.catalogingProfile);
  state.audit.effectiveMode = effectiveMode;
  state.audit.creatorDraft = clone(draft);
  state.audit.finalRecord = clone(draft);
  if (effectiveMode === MODES.LIVE) {
    state.audit.liveAttempts.creator = {
      status: "succeeded",
      metadata: clone(metadata),
      output: clone(draft)
    };
  }
  touchAudit(state);
  return state;
}

export function createDemoDraft(state, sourceText = state.source.text) {
  return beginDraft(state, sourceText, CURATED_CREATOR_DRAFT, MODES.DEMO);
}

export function createLiveDraft(state, sourceText, draft, metadata = null) {
  if (state.mode !== MODES.LIVE) throw new Error("Live draft requires Live mode.");
  return beginDraft(state, sourceText, draft, MODES.LIVE, metadata);
}

function beginReview(state, recommendations, effectiveMode, metadata = null, coverage = [], deterministicFindings = [], authorityChecks = []) {
  if (!state.creatorDraft) throw new Error("Create a draft before running review.");
  if (!Array.isArray(recommendations)) throw new Error("Reviewer recommendations must be an array.");
  if (effectiveMode === MODES.DEMO && recommendations.length !== 3) throw new Error("The canonical Demo review requires exactly three recommendations.");
  if (!Array.isArray(coverage) || (effectiveMode === MODES.LIVE && coverage.length !== 12)) throw new Error("Live Reviewer must return coverage for all twelve MARC areas.");
  if (effectiveMode === MODES.LIVE) {
    const requiredAreas = new Set(["020", "050", "043", "100", "245", "264", "300", "336/337/338", "504/505", "520", "650", "655"]);
    const returnedAreas = new Set(coverage.map(({ field }) => field));
    if (returnedAreas.size !== requiredAreas.size || [...requiredAreas].some((field) => !returnedAreas.has(field))) {
      throw new Error("Live Reviewer must return each required MARC area exactly once.");
    }
  }
  const ids = new Set(recommendations.map(({ id }) => id));
  if (ids.size !== recommendations.length) throw new Error("Recommendation IDs must be unique.");
  state.recommendations = recommendations.map(blankReview);
  state.reviewerCoverage = clone(coverage);
  state.deterministicFindings = clone(deterministicFindings);
  state.authorityChecks = clone(authorityChecks);
  state.finalRecord = deriveFinalRecord(state);
  state.stage = recommendations.length === 0 ? "final" : "review";
  state.audit.effectiveMode = effectiveMode;
  // Preserve the Reviewer output as immutable AI provenance. Human decision
  // state belongs only in audit.humanDecisions and the derived finalRecord.
  state.audit.reviewerRecommendations = clone(recommendations);
  state.audit.reviewerCoverage = clone(state.reviewerCoverage);
  state.audit.deterministicFindings = clone(state.deterministicFindings);
  state.audit.authorityChecks = clone(state.authorityChecks);
  state.audit.finalRecord = clone(state.finalRecord);
  if (effectiveMode === MODES.LIVE) {
    state.audit.liveAttempts.reviewer = {
      status: "succeeded",
      metadata: clone(metadata),
      output: clone(recommendations)
    };
  }
  touchAudit(state);
  return state;
}

export function runDemoReview(state) {
  return beginReview(state, CURATED_RECOMMENDATIONS, MODES.DEMO, null, CURATED_REVIEW_COVERAGE);
}

export function runLiveReview(state, recommendations, metadata = null, coverage = [], deterministicFindings = [], authorityChecks = []) {
  if (state.mode !== MODES.LIVE) throw new Error("Live review requires Live mode.");
  return beginReview(state, recommendations, MODES.LIVE, metadata, coverage, deterministicFindings, authorityChecks);
}

export function fallbackToDemo(state, failedStage, message) {
  const event = {
    occurredAt: now(),
    failedStage,
    fromMode: MODES.LIVE,
    toMode: MODES.DEMO,
    message: String(message || "Live request failed.")
  };
  if (!state.audit) state.audit = createAudit(MODES.LIVE, state.source.confirmedPackage || state.source.package, state.source.retrieval, state.catalogingProfile);
  const priorCreator = state.creatorDraft ? clone(state.creatorDraft) : null;
  if (failedStage === "creator") {
    state.audit.liveAttempts.creator = {
      status: "failed",
      message: event.message,
      output: priorCreator
    };
  } else {
    state.audit.liveAttempts.reviewer = {
      status: "failed",
      message: event.message,
      output: null
    };
  }
  state.audit.fallbackEvents.push(event);
  state.audit.effectiveMode = MODES.DEMO;
  state.creatorDraft = clone(CURATED_CREATOR_DRAFT);
  state.finalRecord = clone(CURATED_CREATOR_DRAFT);
  state.recommendations = failedStage === "reviewer"
    ? CURATED_RECOMMENDATIONS.map(blankReview)
    : [];
  state.reviewerCoverage = failedStage === "reviewer" ? clone(CURATED_REVIEW_COVERAGE) : [];
  state.deterministicFindings = [];
  state.authorityChecks = [];
  state.stage = failedStage === "reviewer" ? "review" : "draft";
  state.audit.creatorDraft = clone(state.creatorDraft);
  state.audit.reviewerRecommendations = failedStage === "reviewer"
    ? clone(CURATED_RECOMMENDATIONS)
    : [];
  state.audit.reviewerCoverage = clone(state.reviewerCoverage);
  state.audit.deterministicFindings = [];
  state.audit.authorityChecks = [];
  state.audit.finalRecord = clone(state.finalRecord);
  state.notice = `Live ${failedStage} failed. This run visibly switched to deterministic Demo mode.`;
  touchAudit(state);
  return state;
}

export function recordLiveFailure(state, failedStage, message) {
  const failureMessage = String(message || "Live request failed.");
  if (!state.audit) state.audit = createAudit(MODES.LIVE, state.source.confirmedPackage || state.source.package, state.source.retrieval, state.catalogingProfile);
  state.audit.effectiveMode = MODES.LIVE;
  state.audit.liveAttempts[failedStage] = {
    status: "failed",
    message: failureMessage,
    output: failedStage === "creator" ? null : clone(state.creatorDraft)
  };
  state.notice = `Live ${failedStage} failed. No Demo fixture output was substituted for this real source.`;
  touchAudit(state);
  return state;
}

function findRecommendation(state, recommendationId) {
  const recommendation = state.recommendations.find(({ id }) => id === recommendationId);
  if (!recommendation) throw new Error(`Unknown recommendation: ${recommendationId}`);
  return recommendation;
}

function expectedMarcTag(fieldPath) {
  return {
    isbn: "020", classificationNumber: "050", geographicAreaCode: "043", author: "100", title: "245", publication: "264", extent: "300",
    contentType: "336", mediaType: "337", carrierType: "338", bibliographyNote: "504", contentsNote: "505", summary: "520", genre: "655"
  }[fieldPath] || (fieldPath.startsWith("subjects.") ? "650" : null);
}

function validateMarcOverride(recommendation, editedMarc) {
  if (!editedMarc) return null;
  const normalized = String(editedMarc).trim();
  const tag = expectedMarcTag(recommendation.field);
  if (!tag || !normalized.startsWith(`=${tag}  `)) {
    throw new Error(`The MARC edit for ${recommendation.fieldLabel} must begin with =${tag}.`);
  }
  return normalized;
}

function setDecision(state, recommendationId, decision, editedValue = null, editedMarc = null) {
  const recommendation = findRecommendation(state, recommendationId);
  if (!Object.values(DECISIONS).includes(decision) || decision === DECISIONS.PENDING) {
    throw new Error(`Invalid human decision: ${decision}`);
  }
  if (decision === DECISIONS.EDITED && !String(editedValue || "").trim()) {
    throw new Error("An edited recommendation requires a human-supplied value.");
  }
  const normalizedMarc = decision === DECISIONS.EDITED
    ? validateMarcOverride(recommendation, editedMarc)
    : null;

  recommendation.decision = decision;
  recommendation.editedValue = decision === DECISIONS.EDITED
    ? String(editedValue).trim()
    : null;
  recommendation.editedMarc = normalizedMarc;
  recommendation.decidedAt = new Date().toISOString();
  state.finalRecord = deriveFinalRecord(state);
  state.stage = state.recommendations.every(({ decision: value }) => value !== DECISIONS.PENDING)
    ? "final"
    : "decision";
  if (state.audit) {
    state.audit.humanDecisions.push({
      occurredAt: recommendation.decidedAt,
      recommendationId,
      decision,
      editedValue: recommendation.editedValue,
      editedMarc: recommendation.editedMarc
    });
    state.audit.finalRecord = clone(state.finalRecord);
    touchAudit(state);
  }
  return state;
}

export function acceptRecommendation(state, recommendationId) {
  return setDecision(state, recommendationId, DECISIONS.ACCEPTED);
}

export function editRecommendation(state, recommendationId, editedValue, editedMarc = null) {
  return setDecision(state, recommendationId, DECISIONS.EDITED, editedValue, editedMarc);
}

export function rejectRecommendation(state, recommendationId) {
  return setDecision(state, recommendationId, DECISIONS.REJECTED);
}

export function removeRecommendationValue(state, recommendationId) {
  return setDecision(state, recommendationId, DECISIONS.REMOVED);
}

function setField(record, fieldPath, value) {
  const [field, indexText] = fieldPath.split(".");
  if (indexText === undefined) {
    record[field] = value;
    return;
  }
  const index = Number(indexText);
  if (!Array.isArray(record[field]) || !Number.isInteger(index)) {
    throw new Error(`Unsupported recommendation field: ${fieldPath}`);
  }
  record[field][index] = value;
}

function applyAcceptedSubjectDetail(state, record, recommendation) {
  if (!recommendation.field.startsWith("subjects.")) return;
  const index = Number(recommendation.field.split(".")[1]);
  const check = state.authorityChecks.find((item) =>
    item.context === "reviewer_proposal" && item.recommendationId === recommendation.id
  );
  if (!check || !Number.isInteger(index)) return;
  if (!Array.isArray(record.subjectDetails)) record.subjectDetails = [];
  record.subjectDetails[index] = {
    value: recommendation.proposedValue,
    status: check.status,
    subdivisionType: check.subdivisionType || "",
    subdivisionMarcCode: check.subdivisionMarcCode || "",
    subdivisionMarcCodes: clone(check.subdivisionMarcCodes || []),
    constructionStatus: check.constructionStatus || ""
  };
}

export function deriveFinalRecord(state) {
  if (!state.creatorDraft) return null;
  const finalRecord = clone(state.creatorDraft);
  const marcOverrides = {};

  for (const recommendation of state.recommendations) {
    if (recommendation.decision === DECISIONS.ACCEPTED) {
      setField(finalRecord, recommendation.field, recommendation.proposedValue);
      applyAcceptedSubjectDetail(state, finalRecord, recommendation);
    }
    if (recommendation.decision === DECISIONS.EDITED) {
      setField(finalRecord, recommendation.field, recommendation.editedValue);
      if (recommendation.editedMarc) {
        marcOverrides[recommendation.field] = recommendation.editedMarc;
      }
    }
    if (recommendation.decision === DECISIONS.REMOVED) {
      setField(finalRecord, recommendation.field, "");
    }
  }
  if (Object.keys(marcOverrides).length) finalRecord.marcOverrides = marcOverrides;
  return finalRecord;
}

export function getDecisionSummary(state) {
  return state.recommendations.reduce((summary, recommendation) => {
    summary[recommendation.decision] += 1;
    return summary;
  }, {
    [DECISIONS.PENDING]: 0,
    [DECISIONS.ACCEPTED]: 0,
    [DECISIONS.EDITED]: 0,
    [DECISIONS.REJECTED]: 0,
    [DECISIONS.REMOVED]: 0
  });
}

export function resetDemo() {
  return createInitialState();
}

export function resetWorkflow(mode = MODES.DEMO, catalogingProfile = null) {
  return createInitialState(mode, catalogingProfile);
}

export function getAuditTrail(state) {
  return state.audit ? clone(state.audit) : null;
}
