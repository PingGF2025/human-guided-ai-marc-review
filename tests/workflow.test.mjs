import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CURATED_CREATOR_DRAFT,
  CURATED_RECOMMENDATIONS,
  CURATED_REVIEW_COVERAGE,
  CURATED_SOURCE_PACKAGE,
  CURATED_SOURCE_TEXT
} from "../fixtures.js";
import { buildMarcField, buildMarcPreview, parseMarcField } from "../marc.js";
import { detectSourceInput, findMetadataConflicts, mapRetrievedMetadata, normalizeIsbn, OFFLINE_ISBN, OFFLINE_OPEN_LIBRARY_FIXTURE, validateIsbn10, validateIsbn13 } from "../isbn.js";
import { requestLiveCreator, requestLiveReviewer } from "../api.js";
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
  removeRecommendationValue,
  rejectRecommendation,
  resetDemo,
  resetWorkflow,
  runDemoReview,
  runLiveReview
} from "../workflow.js";

const TEST_PROFILE = JSON.parse(readFileSync(new URL("../cataloging-profile.json", import.meta.url), "utf8"));

function confirmCurated(state) {
  confirmSourcePackage(state, CURATED_SOURCE_PACKAGE, state.source.retrieval);
  return state;
}

function reviewedDemo() {
  const state = createInitialState();
  confirmCurated(state);
  createDemoDraft(state, CURATED_SOURCE_PACKAGE);
  runDemoReview(state);
  return state;
}

test("a new run starts with an empty, unconfirmed source package", () => {
  const state = createInitialState();
  assert.deepEqual(state.source.package, {
    title: "", author: "", format: "", language: "", publicationInformation: "", isbn: "", description: "", additionalNotes: "", contents: ""
  });
  assert.equal(state.source.confirmed, false);
});

test("versioned Cataloging Policy Profile is preserved in the audit but never enters MARC", () => {
  const state = createInitialState(MODES.DEMO, TEST_PROFILE);
  confirmSourcePackage(state, CURATED_SOURCE_PACKAGE, state.source.retrieval);
  createDemoDraft(state, CURATED_SOURCE_PACKAGE);
  assert.deepEqual(getAuditTrail(state).catalogingProfile, TEST_PROFILE);
  const marc = buildMarcPreview(state.finalRecord);
  assert.doesNotMatch(marc, /build-week-conservative-rda|RDA|humanApprovalRequired/);
});

test("Creator requires a human-confirmed visible source package", () => {
  const state = createInitialState();
  assert.throws(
    () => createDemoDraft(state, CURATED_SOURCE_PACKAGE),
    /Verify and confirm/
  );
  assert.equal(state.creatorDraft, null);
});

test("Reviewer returns exactly three pending, non-destructive recommendations", () => {
  const state = reviewedDemo();

  assert.equal(state.recommendations.length, 3);
  assert.ok(state.recommendations.every(({ decision }) => decision === DECISIONS.PENDING));
  assert.deepEqual(state.finalRecord, state.creatorDraft);
  assert.deepEqual(state.creatorDraft, CURATED_CREATOR_DRAFT);
});

test("accepted recommendation changes only its targeted final-record field", () => {
  const state = reviewedDemo();
  const creatorAuthor = state.creatorDraft.author;

  acceptRecommendation(state, "review-summary");

  assert.equal(state.recommendations[0].decision, DECISIONS.ACCEPTED);
  assert.equal(state.finalRecord.summary, state.recommendations[0].proposedValue);
  assert.equal(state.finalRecord.author, creatorAuthor);
  assert.equal(state.creatorDraft.summary, CURATED_CREATOR_DRAFT.summary);
});

test("edited recommendation applies the human value rather than silently applying reviewer text", () => {
  const state = reviewedDemo();
  const humanValue = "Autobiographical memory—Psychological aspects—Fiction";

  editRecommendation(state, "review-subject", humanValue);

  const recommendation = state.recommendations[1];
  assert.equal(recommendation.decision, DECISIONS.EDITED);
  assert.equal(recommendation.editedValue, humanValue);
  assert.equal(state.finalRecord.subjects[0], humanValue);
  assert.equal(state.creatorDraft.subjects[0], CURATED_CREATOR_DRAFT.subjects[0]);
});

test("human can edit MARC encoding as well as the cataloging value", () => {
  const state = reviewedDemo();
  const humanValue = "Autobiographical memory—Psychological aspects—Fiction";
  const humanMarc = "=650  \\0 $aAutobiographical memory $xPsychological aspects $vFiction";

  editRecommendation(state, "review-subject", humanValue, humanMarc);

  assert.equal(state.recommendations[1].editedMarc, humanMarc);
  assert.equal(state.finalRecord.marcOverrides["subjects.0"], humanMarc);
  assert.match(buildMarcPreview(state.finalRecord), /\$xPsychological aspects \$vFiction/);
});

test("human MARC edit must retain the recommendation's field tag", () => {
  const state = reviewedDemo();
  assert.throws(
    () => editRecommendation(
      state,
      "review-subject",
      "Autobiographical memory—Fiction",
      "=655  \\7 $aAutobiographical memory $2lcgft"
    ),
    /must begin with =650/
  );
});

test("edited recommendation refuses an empty human value", () => {
  const state = reviewedDemo();
  assert.throws(
    () => editRecommendation(state, "review-subject", ""),
    /requires a human-supplied value/
  );
  assert.equal(state.recommendations[1].decision, DECISIONS.PENDING);
});

test("rejected recommendation preserves the Creator draft value", () => {
  const state = reviewedDemo();

  rejectRecommendation(state, "review-author");

  assert.equal(state.recommendations[2].decision, DECISIONS.REJECTED);
  assert.equal(state.finalRecord.author, CURATED_CREATOR_DRAFT.author);
  assert.notEqual(state.finalRecord.author, state.recommendations[2].proposedValue);
});

test("canonical scenario completes with one accepted, one edited, and one rejected", () => {
  const state = reviewedDemo();
  const humanSubject = "Autobiographical memory—Fiction";

  acceptRecommendation(state, "review-summary");
  editRecommendation(state, "review-subject", humanSubject);
  rejectRecommendation(state, "review-author");

  assert.equal(state.stage, "final");
  assert.deepEqual(getDecisionSummary(state), {
    pending: 0,
    accepted: 1,
    edited: 1,
    rejected: 1,
    removed: 0
  });

  const marc = buildMarcPreview(state.finalRecord);
  assert.match(marc, /A woman reconstructs her identity/);
  assert.match(marc, /\$aAutobiographical memory\$vFiction/);
  assert.match(marc, /=100  1\\\$aDoe, Jane/);
  assert.doesNotMatch(marc, /1975-/);
});

test("MARC generation distinguishes topical and form subdivisions", () => {
  const state = reviewedDemo();
  editRecommendation(
    state,
    "review-subject",
    "Autobiographical memory—Psychological aspects—Fiction"
  );

  const marc = buildMarcPreview(state.finalRecord);
  assert.match(
    marc,
    /\$aAutobiographical memory\$xPsychological aspects\$vFiction/
  );
  assert.doesNotMatch(marc, /=650[^\n]*\$2lcsh/);
  assert.match(marc, /=655[^\n]*\$2lcgft/);
});

test("verified authority metadata drives geographic subdivision coding", () => {
  const record = {
    ...CURATED_CREATOR_DRAFT,
    subjects: ["Libraries—China"],
    subjectDetails: [{
      value: "Libraries—China", status: "verified_construction",
      subdivisionType: "geographic", subdivisionMarcCode: "z",
      constructionStatus: "verified_geographic_construction"
    }]
  };
  assert.match(buildMarcPreview(record), /=650  \\0\$aLibraries\$zChina\./);
  assert.doesNotMatch(buildMarcPreview(record), /\$xChina/);
});

test("multi-component authority metadata drives topical then geographic coding", () => {
  const record = {
    ...CURATED_CREATOR_DRAFT,
    subjects: ["Internet—Government policy—China"],
    subjectDetails: [{
      value: "Internet—Government policy—China",
      status: "verified_construction",
      constructionStatus: "verified_multi_component_construction",
      subdivisionMarcCodes: ["x", "z"]
    }]
  };
  assert.match(buildMarcPreview(record), /=650  \\0\$aInternet\$xGovernment policy\$zChina\./);
});

test("unresolved constructed subject never defaults silently to topical x", () => {
  const record = {
    ...CURATED_CREATOR_DRAFT,
    subjects: ["Unverified term—Unresolved subdivision"],
    subjectDetails: [{ value: "Unverified term—Unresolved subdivision", status: "not_verified", subdivisionMarcCode: "" }]
  };
  assert.match(buildMarcPreview(record), /=653  \\\$aUnverified term—Unresolved subdivision\./);
  assert.doesNotMatch(buildMarcPreview(record), /\$xUnresolved subdivision/);
});

test("edited anthology uses MARC 21 subfields, nonfiling indicator, and separate 700 entries", () => {
  const marc = buildMarcPreview({
    isbn: "9780306406157",
    author: "",
    title: "Shared worlds : essays on community practice",
    publication: "Boston : Meridian Research Press, 2026",
    extent: "",
    contentType: "text",
    mediaType: "unmediated",
    carrierType: "volume",
    summary: "Essays examine community practice in varied settings",
    subjects: [],
    genre: "",
    statementOfResponsibility: "edited by Maya Chen, Jordan Lee, and Sam Rivera",
    contributors: [
      { name: "Chen, Maya", statementName: "Maya Chen", relationship: "editor" },
      { name: "Lee, Jordan", statementName: "Jordan Lee", relationship: "editor" },
      { name: "Rivera, Sam", statementName: "Sam Rivera", relationship: "editor" }
    ]
  });
  assert.match(marc, /^=020  \\\\\$a9780306406157$/m);
  assert.doesNotMatch(marc, /^=100/m);
  assert.match(marc, /^=245  00\$aShared worlds :\$bessays on community practice \/\$cedited by Maya Chen, Jordan Lee, and Sam Rivera\.$/m);
  assert.match(marc, /^=264  \\1\$aBoston :\$bMeridian Research Press,\$c2026\.$/m);
  assert.match(marc, /^=336  \\\\\$atext\$btxt\$2rdacontent$/m);
  assert.match(marc, /^=337  \\\\\$aunmediated\$bn\$2rdamedia$/m);
  assert.match(marc, /^=338  \\\\\$avolume\$bnc\$2rdacarrier$/m);
  assert.equal((marc.match(/^=700  1\\/gm) || []).length, 3);
  assert.match(marc, /^=700  1\\\$aChen, Maya,\$eeditor\.$/m);
});

test("corporate responsibility is encoded in a separate repeatable 710 field", () => {
  const marc = buildMarcPreview({
    ...CURATED_CREATOR_DRAFT,
    corporateContributors: [{ name: "Example Society", statementName: "Example Society", relationship: "issuing body" }]
  });
  assert.match(marc, /^=710  2\\\$aExample Society,\$eissuing body\.$/m);
});

test("MARC preview omits unsupported empty fields", () => {
  const marc = buildMarcPreview({ ...CURATED_CREATOR_DRAFT, isbn: "", extent: "" });
  assert.doesNotMatch(marc, /=020/);
  assert.doesNotMatch(marc, /=300/);
});

test("300 separates extent, other physical details, and dimensions", () => {
  assert.equal(
    buildMarcField("extent", "xii, 248 pages : illustrations ; 24 cm"),
    "=300  \\\\$axii, 248 pages :$billustrations ;$c24 cm"
  );
  assert.equal(
    buildMarcField("extent", "284 pages ; 24 cm"),
    "=300  \\\\$a284 pages ;$c24 cm"
  );
});

test("book records include stable 005 and a 40-character evidence-derived 008", () => {
  const marc = buildMarcPreview({
    ...CURATED_CREATOR_DRAFT,
    publication: "Boston : Meridian Research Press, 2026",
    extent: "xii, 248 pages : illustrations ; 24 cm",
    bibliographyNote: "Includes bibliographical references.",
    hasIndex: true,
    placeCode: "mau",
    languageCode: "eng",
    genre: "Nonfiction"
  });
  assert.match(marc, /^=005  20260719000000\.0$/m);
  const field008 = marc.split("\n").find((line) => line.startsWith("=008  "));
  assert.equal(field008.slice(6).length, 40);
  assert.equal(field008.slice(6, 12), "260719");
  assert.equal(field008[12], "s");
  assert.equal(field008.slice(13, 17), "2026");
  assert.equal(field008.slice(21, 24), "mau");
  assert.equal(field008.slice(41, 44), "eng");
});

test("full-level evidence fields encode proposed 050, 043, 504, and 505 conservatively", () => {
  const marc = buildMarcPreview({
    ...CURATED_CREATOR_DRAFT,
    classificationNumber: "HV6773.15.C6 P37 2026",
    geographicAreaCode: "a-cc---",
    bibliographyNote: "Includes bibliographical references",
    contentsNote: "Introduction -- Digital resilience -- Conclusion"
  });
  assert.match(marc, /=050  \\4\$aHV6773\.15\.C6\$bP37 2026/);
  assert.ok(marc.includes("=043  \\\\$aa-cc---"));
  assert.ok(marc.includes("=504  \\\\$aIncludes bibliographical references."));
  assert.ok(marc.includes("=505  0\\$aIntroduction -- Digital resilience -- Conclusion."));
});

test("100 personal-name dates are encoded in subfield d", () => {
  assert.equal(
    buildMarcField("author", "Doe, Jane, 1975-"),
    "=100  1\\$aDoe, Jane,$d1975-,$eauthor."
  );
  assert.doesNotMatch(buildMarcField("author", "Doe, Jane, 1975-"), /\$aDoe, Jane, 1975-/);
});

test("100 carries the RDA author relationship designator", () => {
  assert.equal(buildMarcField("author", "Park, Elena"), "=100  1\\$aPark, Elena,$eauthor.");
});

test("100 uses the supplied creator relationship instead of assuming author", () => {
  const marc = buildMarcPreview({ ...CURATED_CREATOR_DRAFT, author: "Price, Lena", creatorRelationship: "composer" });
  assert.match(marc, /^=100  1\\\$aPrice, Lena,\$ecomposer\.$/m);
  assert.doesNotMatch(marc, /\$eauthor\./);
});

test("MARC-only human edits parse back into canonical values", () => {
  assert.equal(parseMarcField("summary", "=520  \\ $aRevised summary."), "Revised summary.");
  assert.equal(parseMarcField("subjects.0", "=650  \\0 $aMemory $xPsychological aspects $vFiction"), "Memory—Psychological aspects—Fiction");
  assert.equal(parseMarcField("author", "=100  1\\ $aDoe, Jane, $d1975-"), "Doe, Jane, 1975-");
});

test("adaptive recommendations support MARC editing across descriptive fields", () => {
  assert.equal(buildMarcField("title", "Corrected title"), "=245  00$aCorrected title.");
  assert.equal(parseMarcField("publication", "=264  \\1 $aBeijing : Publisher, 2025"), "Beijing : Publisher, 2025");
  assert.equal(buildMarcField("genre", "Novels"), "=655  \\7$aNovels.$2lcgft");
});

test("reset restores the original source and clears all generated and decision state", () => {
  let state = reviewedDemo();
  acceptRecommendation(state, "review-summary");
  editRecommendation(state, "review-subject", "Autobiographical memory—Fiction");
  rejectRecommendation(state, "review-author");

  state = resetDemo();

  assert.equal(state.stage, "source");
  assert.equal(state.source.text, "");
  assert.equal(state.source.package.title, "");
  assert.equal(state.creatorDraft, null);
  assert.deepEqual(state.recommendations, []);
  assert.equal(state.finalRecord, null);
});

test("Demo run audit preserves source, draft, review, decisions, final record, and mode", () => {
  const state = reviewedDemo();
  acceptRecommendation(state, "review-summary");
  editRecommendation(
    state,
    "review-subject",
    "Autobiographical memory—Fiction",
    "=650  \\0 $aAutobiographical memory $vFiction"
  );
  rejectRecommendation(state, "review-author");

  const audit = getAuditTrail(state);
  assert.equal(audit.requestedMode, MODES.DEMO);
  assert.equal(audit.effectiveMode, MODES.DEMO);
  assert.equal(audit.sourceInput.description, CURATED_SOURCE_TEXT);
  assert.deepEqual(audit.creatorDraft, CURATED_CREATOR_DRAFT);
  assert.equal(audit.reviewerRecommendations.length, 3);
  assert.ok(audit.reviewerRecommendations.every((recommendation) =>
    !("decision" in recommendation) &&
    !("editedValue" in recommendation) &&
    !("editedMarc" in recommendation) &&
    !("decidedAt" in recommendation)
  ));
  assert.ok(audit.reviewerCoverage.some(({ status }) => status === "no_change"));
  assert.ok(audit.reviewerCoverage.every((entry) => !("note" in entry)));
  assert.equal(audit.humanDecisions.length, 3);
  assert.deepEqual(audit.finalRecord, state.finalRecord);
  assert.deepEqual(audit.fallbackEvents, []);
});

test("successful Live run records separate Creator and Reviewer metadata", () => {
  const state = createInitialState(MODES.LIVE);
  confirmCurated(state);
  const creatorMetadata = { responseId: "resp_creator", model: "test-model" };
  const reviewerMetadata = { responseId: "resp_reviewer", model: "test-model" };

  createLiveDraft(state, CURATED_SOURCE_PACKAGE, CURATED_CREATOR_DRAFT, creatorMetadata);
  runLiveReview(state, CURATED_RECOMMENDATIONS, reviewerMetadata, CURATED_REVIEW_COVERAGE);

  const audit = getAuditTrail(state);
  assert.equal(audit.requestedMode, MODES.LIVE);
  assert.equal(audit.effectiveMode, MODES.LIVE);
  assert.equal(audit.liveAttempts.creator.status, "succeeded");
  assert.deepEqual(audit.liveAttempts.creator.metadata, creatorMetadata);
  assert.equal(audit.liveAttempts.reviewer.status, "succeeded");
  assert.deepEqual(audit.liveAttempts.reviewer.metadata, reviewerMetadata);
});

test("Creator fallback is visible and recorded instead of silently replacing Live mode", () => {
  const state = createInitialState(MODES.LIVE);
  confirmSourcePackage(state, { ...CURATED_SOURCE_PACKAGE, description: "Live source input" }, state.source.retrieval);

  fallbackToDemo(state, "creator", "Live creator request failed.");

  const audit = getAuditTrail(state);
  assert.match(state.notice, /visibly switched/);
  assert.equal(audit.requestedMode, MODES.LIVE);
  assert.equal(audit.effectiveMode, MODES.DEMO);
  assert.equal(audit.sourceInput.description, "Live source input");
  assert.equal(audit.fallbackEvents.length, 1);
  assert.equal(audit.fallbackEvents[0].failedStage, "creator");
  assert.equal(audit.liveAttempts.creator.status, "failed");
  assert.deepEqual(state.creatorDraft, CURATED_CREATOR_DRAFT);
});

test("Reviewer fallback preserves the successful live Creator attempt in the audit", () => {
  const state = createInitialState(MODES.LIVE);
  confirmCurated(state);
  createLiveDraft(
    state,
    CURATED_SOURCE_PACKAGE,
    CURATED_CREATOR_DRAFT,
    { responseId: "resp_creator" }
  );

  fallbackToDemo(state, "reviewer", "Live reviewer request failed.");

  const audit = getAuditTrail(state);
  assert.equal(audit.liveAttempts.creator.status, "succeeded");
  assert.equal(audit.liveAttempts.reviewer.status, "failed");
  assert.equal(audit.fallbackEvents[0].failedStage, "reviewer");
  assert.equal(audit.effectiveMode, MODES.DEMO);
  assert.equal(state.recommendations.length, 3);
  assert.match(state.notice, /Live reviewer failed/);
});

test("Live failure for a real source records failure without substituting fictional output", () => {
  const state = createInitialState(MODES.LIVE);
  const realSource = { ...CURATED_SOURCE_PACKAGE, title: "Real retrieved title", isbn: "9780306406157" };
  const retrieval = { ...state.source.retrieval, inputType: "isbn", provider: "Open Library" };
  confirmSourcePackage(state, realSource, retrieval);

  recordLiveFailure(state, "creator", "API unavailable");

  assert.equal(state.creatorDraft, null);
  assert.equal(state.finalRecord, null);
  assert.deepEqual(state.recommendations, []);
  assert.equal(state.audit.liveAttempts.creator.status, "failed");
  assert.deepEqual(state.audit.sourceInput, realSource);
  assert.deepEqual(state.audit.fallbackEvents, []);
  assert.match(state.notice, /No Demo fixture output was substituted/);
});

test("reset preserves the selected mode while clearing the completed audit", () => {
  const state = resetWorkflow(MODES.LIVE);
  assert.equal(state.mode, MODES.LIVE);
  assert.equal(state.audit, null);
  assert.equal(state.creatorDraft, null);
});

test("visible Resource Source Package is preserved exactly in the audit", () => {
  const state = createInitialState(MODES.DEMO);
  confirmCurated(state);
  createDemoDraft(state, CURATED_SOURCE_PACKAGE);
  assert.deepEqual(state.source.package, CURATED_SOURCE_PACKAGE);
  assert.deepEqual(getAuditTrail(state).sourceInput, CURATED_SOURCE_PACKAGE);
});

test("ISBN normalization, detection, and checksums are deterministic", () => {
  assert.equal(normalizeIsbn("ISBN 978-0-14-143951-8"), OFFLINE_ISBN);
  assert.equal(validateIsbn13(OFFLINE_ISBN), true);
  assert.equal(validateIsbn13("9780000000003"), false);
  assert.equal(validateIsbn10("0306406152"), true);
  assert.equal(validateIsbn10("0306406153"), false);
  assert.deepEqual(detectSourceInput("ordinary descriptive text"), { type: "text", value: "ordinary descriptive text" });
  assert.equal(detectSourceInput("978-0-00-000000-2").type, "isbn");
});

test("offline ISBN fixture maps retrieved metadata with field-level provenance", () => {
  const mapped = mapRetrievedMetadata(OFFLINE_OPEN_LIBRARY_FIXTURE, OFFLINE_ISBN, { offline: true, retrievedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(mapped.sourcePackage.isbn, OFFLINE_ISBN);
  assert.equal(mapped.retrieval.authoritative, false);
  assert.equal(mapped.retrieval.metadataClassification, "retrieved_metadata");
  assert.match(mapped.retrieval.fieldProvenance.title.label, /retrieved metadata/);
  assert.equal(mapped.retrieval.offlineFixtureUsed, true);
});

test("conflicting retrieved metadata produces explicit field warnings", () => {
  const warnings = findMetadataConflicts(
    { ...CURATED_SOURCE_PACKAGE, title: "Existing title" },
    { ...CURATED_SOURCE_PACKAGE, title: "Retrieved title" }
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /title conflicts/);
});

test("Creator and Reviewer boundary retains only the visible confirmed source package", () => {
  const visible = { ...CURATED_SOURCE_PACKAGE, title: "Human-confirmed title", additionalNotes: "Visible note only" };
  const state = createInitialState(MODES.LIVE);
  const retrieval = { ...state.source.retrieval, hiddenProviderValue: "audit provenance only" };
  confirmSourcePackage(state, visible, retrieval);
  createLiveDraft(state, state.source.confirmedPackage, CURATED_CREATOR_DRAFT, { responseId: "creator" });
  runLiveReview(state, CURATED_RECOMMENDATIONS, { responseId: "reviewer" }, CURATED_REVIEW_COVERAGE);
  assert.deepEqual(state.source.confirmedPackage, visible);
  assert.deepEqual(getAuditTrail(state).sourceInput, visible);
  assert.equal("hiddenProviderValue" in state.source.confirmedPackage, false);
  assert.equal(getAuditTrail(state).sourceRetrieval.hiddenProviderValue, "audit provenance only");
});

test("Live Reviewer may recommend no changes while documenting complete coverage", () => {
  const state = createInitialState(MODES.LIVE);
  confirmCurated(state);
  createLiveDraft(state, CURATED_SOURCE_PACKAGE, CURATED_CREATOR_DRAFT, { responseId: "creator" });
  const coverage = CURATED_REVIEW_COVERAGE.map((item) => ({ ...item, status: "no_change" }));

  runLiveReview(state, [], { responseId: "reviewer" }, coverage, []);

  assert.equal(state.stage, "final");
  assert.deepEqual(state.recommendations, []);
  assert.deepEqual(state.finalRecord, state.creatorDraft);
  assert.equal(state.reviewerCoverage.length, 12);
  assert.deepEqual(state.audit.reviewerRecommendations, []);
});

test("LC authority checks are visible state and immutable audit provenance", () => {
  const state = createInitialState(MODES.LIVE);
  confirmCurated(state);
  createLiveDraft(state, CURATED_SOURCE_PACKAGE, CURATED_CREATOR_DRAFT, { responseId: "creator" });
  const checks = [{
    candidate: "Novels", searchedTerm: "Novels", vocabulary: "LCGFT", status: "verified_form",
    authorizedLabel: "Novels", authorityUri: "https://id.loc.gov/example", lookupUrl: "https://id.loc.gov/search",
    checkedAt: "2026-07-19T00:00:00Z", source: "LC Linked Data Service",
    applicationStatus: "review_required", note: "Form only"
  }];
  runLiveReview(state, [], { responseId: "reviewer" }, CURATED_REVIEW_COVERAGE.map((item) => ({ ...item, status: "no_change" })), [], checks);
  assert.deepEqual(state.authorityChecks, checks);
  assert.deepEqual(getAuditTrail(state).authorityChecks, checks);
  checks[0].candidate = "mutated outside state";
  assert.equal(state.authorityChecks[0].candidate, "Novels");
});

test("adaptive Live recommendation can correct a publication field", () => {
  const state = createInitialState(MODES.LIVE);
  confirmCurated(state);
  createLiveDraft(state, CURATED_SOURCE_PACKAGE, CURATED_CREATOR_DRAFT);
  const recommendation = {
    id: "review-publication", action: "replace", field: "publication", fieldLabel: "264 Publication information",
    currentValue: CURATED_CREATOR_DRAFT.publication, proposedValue: "Beijing : Example Press, 2025.",
    explanation: "The visible source supplies corrected publication data.", evidence: "Beijing, 2025",
    evidenceSource: "Publication information", evidenceLocation: "Confirmed Source Package", standardBasis: "Transcribe supported publication data.",
    confidence: "high", verificationStatus: "not_applicable", verificationSource: ""
  };
  const coverage = CURATED_REVIEW_COVERAGE.map((item) => ({ ...item, status: item.field === "264" ? "change_recommended" : "no_change" }));
  runLiveReview(state, [recommendation], null, coverage);
  acceptRecommendation(state, recommendation.id);
  assert.equal(state.finalRecord.publication, recommendation.proposedValue);
  assert.match(buildMarcPreview(state.finalRecord), /=264  \\1\$aBeijing/);
});

test("human acceptance of a remove recommendation removes the value while rejection preserves it", () => {
  const recommendation = {
    id: "review-remove-subject", action: "remove", field: "subjects.1", fieldLabel: "650 Subject heading 2",
    currentValue: CURATED_CREATOR_DRAFT.subjects[1], proposedValue: "",
    explanation: "The heading remains unverified.", evidence: "No authority result was supplied.",
    evidenceSource: "LC authority check", evidenceLocation: "Recorded authority evidence", standardBasis: "Human decision required.",
    confidence: "high", verificationStatus: "not_verified", verificationSource: "LC Linked Data Service"
  };
  const coverage = CURATED_REVIEW_COVERAGE.map((item) => ({ ...item, status: item.field === "650" ? "change_recommended" : "no_change" }));

  const accepted = createInitialState(MODES.LIVE);
  confirmCurated(accepted);
  createLiveDraft(accepted, CURATED_SOURCE_PACKAGE, CURATED_CREATOR_DRAFT);
  runLiveReview(accepted, [recommendation], null, coverage);
  acceptRecommendation(accepted, recommendation.id);
  assert.equal(accepted.finalRecord.subjects[1], "");

  const rejected = createInitialState(MODES.LIVE);
  confirmCurated(rejected);
  createLiveDraft(rejected, CURATED_SOURCE_PACKAGE, CURATED_CREATOR_DRAFT);
  runLiveReview(rejected, [recommendation], null, coverage);
  rejectRecommendation(rejected, recommendation.id);
  assert.equal(rejected.finalRecord.subjects[1], CURATED_CREATOR_DRAFT.subjects[1]);
});

test("unverified supported heading can be kept, edited, or removed by the human", () => {
  const recommendation = {
    id: "review-unverified-subject", action: "review", field: "subjects.1", fieldLabel: "650 Subject heading 2",
    currentValue: CURATED_CREATOR_DRAFT.subjects[1], proposedValue: CURATED_CREATOR_DRAFT.subjects[1],
    explanation: "The concept is supported, but its form remains unverified.", evidence: "The contents develop this concept.",
    evidenceSource: "Contents", evidenceLocation: "Confirmed Source Package", standardBasis: "Human resolution required.",
    confidence: "medium", verificationStatus: "not_verified", verificationSource: ""
  };
  const coverage = CURATED_REVIEW_COVERAGE.map((item) => ({ ...item, status: item.field === "650" ? "needs_verification" : "no_change" }));

  const removed = createInitialState(MODES.LIVE);
  confirmCurated(removed);
  createLiveDraft(removed, CURATED_SOURCE_PACKAGE, CURATED_CREATOR_DRAFT);
  runLiveReview(removed, [recommendation], null, coverage);
  removeRecommendationValue(removed, recommendation.id);
  assert.equal(removed.finalRecord.subjects[1], "");
  assert.equal(removed.recommendations[0].decision, DECISIONS.REMOVED);
});

test("provisional 050 review supports a direct human MARC edit", () => {
  const state = createInitialState(MODES.LIVE);
  confirmCurated(state);
  createLiveDraft(state, CURATED_SOURCE_PACKAGE, CURATED_CREATOR_DRAFT);
  const currentValue = state.creatorDraft.classificationNumber;
  const recommendation = {
    id: "review-provisional-050", action: "review", field: "classificationNumber", fieldLabel: "050 Proposed LC call number",
    currentValue, proposedValue: currentValue, explanation: "The proposed classification requires schedule verification.",
    evidence: "The source develops the classified topic.", evidenceSource: "Contents", evidenceLocation: "Confirmed Source Package",
    standardBasis: "Human verification required.", confidence: "medium", verificationStatus: "not_verified", verificationSource: ""
  };
  const coverage = CURATED_REVIEW_COVERAGE.map((item) => ({ ...item, status: item.field === "050" ? "needs_verification" : "no_change" }));
  runLiveReview(state, [recommendation], null, coverage);
  editRecommendation(state, recommendation.id, "GT2853.C6", "=050  \\4$aGT2853.C6");
  assert.equal(state.finalRecord.classificationNumber, "GT2853.C6");
  assert.equal(state.finalRecord.marcOverrides.classificationNumber, "=050  \\4$aGT2853.C6");
});

test("Live Reviewer refuses incomplete field coverage", () => {
  const state = createInitialState(MODES.LIVE);
  confirmCurated(state);
  createLiveDraft(state, CURATED_SOURCE_PACKAGE, CURATED_CREATOR_DRAFT);
  assert.throws(() => runLiveReview(state, [], null, CURATED_REVIEW_COVERAGE.slice(0, 11)), /all twelve MARC areas/);
});

test("live Creator and Reviewer HTTP payloads contain the confirmed visible package and no retrieval-only data", async () => {
  const visible = { ...CURATED_SOURCE_PACKAGE, title: "Confirmed payload title" };
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (path, options) => {
    requests.push({ path, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({}) };
  };
  try {
    await requestLiveCreator(visible, TEST_PROFILE);
    await requestLiveReviewer(visible, CURATED_CREATOR_DRAFT, TEST_PROFILE);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(requests[0].body, { sourcePackage: visible, catalogingProfile: TEST_PROFILE });
  assert.deepEqual(requests[1].body, { sourcePackage: visible, draft: CURATED_CREATOR_DRAFT, catalogingProfile: TEST_PROFILE });
  assert.equal("retrieval" in requests[0].body.sourcePackage, false);
  assert.equal("provenance" in requests[1].body.sourcePackage, false);
});
