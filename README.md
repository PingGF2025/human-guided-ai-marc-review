# CatalogingUI Build Week

A focused demonstration of an explainable expert-review workflow:

> AI creates. AI reviews. Humans decide.

Licensed under the [MIT License](LICENSE).

This Build Week prototype adapts ideas from an existing cataloging interface into a focused demonstration of transparent, human-guided AI review.

Build Week submission materials:

- [`DEMO.md`](DEMO.md) - timed three-minute narration and click path
- [`DEVPOST_DESCRIPTION.md`](DEVPOST_DESCRIPTION.md) - submission-text draft
- [`SUBMISSION_CHECKLIST.md`](SUBMISSION_CHECKLIST.md) - rules-based readiness checklist
- [`output/pdf/build-week-demo-source.pdf`](output/pdf/build-week-demo-source.pdf) - original fictional evidence packet for recording

## Current milestone

The application supports deterministic Demo mode and an optional Live mode. It supports:

1. Unified pasted-text / ISBN intake plus one-PDF upload
2. Deterministic ISBN-10 and ISBN-13 validation
3. Open Library retrieved metadata with field-level provenance and human confirmation
4. One visible, human-confirmed Resource Source Package shared exactly by Creator and Reviewer
5. A curated, repeatable Demo workflow
6. Adaptive Live review across twelve MARC areas with zero-to-many recommendations
7. Separate deterministic checks, semantic assessment, and verification status
8. Human accept, edit, and reject decisions
9. A final MARC record derived from those decisions
10. A complete downloadable audit trail and reset
11. Explicit, visible fallback and failure behavior
12. One visible, versioned Cataloging Policy Profile shared by Creator and Reviewer
13. Reviewable PDF evidence extraction with page-level provenance and a deterministic curated fixture

Open Library values are explicitly labeled **retrieved metadata**, not authoritative cataloging data. Missing values, retrieval failures, and use of the offline fixture remain visible to the human and in the audit.

URL and spreadsheet ingestion remain deliberately deferred. General-purpose multi-file PDF processing is also outside the Build Week slice.

## Launch

Clone the repository and enter its root directory:

```bash
git clone https://github.com/PingGF2025/human-guided-ai-marc-review.git
cd human-guided-ai-marc-review
```

### Demo mode only

From this repository root—the directory containing `index.html`—start a local static server:

```bash
python3 -m http.server 8000
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000).

The app uses browser-native ES modules and has no runtime dependencies.

The application opens with an empty intake and empty Resource Source Package. **Load fictional demo fixture** explicitly loads *Memory Palace*; it has no ISBN and is visibly identified as fictional demonstration data.

An ISBN may be entered in the unified intake or directly in the visible Source Package ISBN field; **Prepare source package** recognizes either location.

Demo mode accepts only the explicitly loaded fictional fixture. Pasted text and ISBN-derived packages require Live mode. If a Live call fails for a real source, the failure is visibly recorded and the workflow stops; unrelated fictional output is never substituted. Deterministic fallback remains available for the fictional fixture.

The PDF upload accepts one file up to 25 MB. The original fictional `output/pdf/build-week-demo-source.pdf` has deterministic, explicitly labeled extraction so the evidence demonstration works offline. Other PDFs use live OpenAI document extraction and therefore require the local API server and API key. Every extracted value remains an editable candidate until the human confirms the visible Source Package. The audit records filename, size, checksum, extraction method, page citations, warnings, and human-confirmed values; raw PDF bytes are not stored in the audit.

For the deterministic offline ISBN demonstration, enter `9780141439518`. That ISBN selects a visibly labeled bundled metadata snapshot, so the offline demonstration does not depend on network availability or changing third-party data. Other valid ISBNs use Open Library retrieval. Review or edit the populated Resource Source Package, then select **Verify and confirm source package** before running the Creator.

### Live and Demo modes

Create a virtual environment, install the server dependencies, and configure the API key:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
cp .env.example .env
```

Edit `.env`, then launch:

```bash
python3 api_server.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). API keys remain on the local server and are never sent to the browser.

## Verify

Run the deterministic workflow tests with Node.js 18 or newer:

```bash
npm test
python3 -m unittest tests/test_backend_contracts.py
```

The tests exercise accept, edit, reject, final MARC generation, and reset behavior.

## Architecture

- `fixtures.js` — curated source, creator draft, and reviewer recommendations
- `isbn.js` — deterministic ISBN validation, Open Library retrieval/mapping, and offline fixture
- `output/pdf/build-week-demo-source.pdf` — original fictional, reproducible PDF evidence fixture
- `cataloging-profile.json` — canonical runtime agreement for standards, evidence, verification, and human approval
- `workflow.js` — canonical state and human-decision operations
- `marc.js` — deterministic MARC preview generation
- `app.js` — browser orchestration and rendering
- `api.js` — browser calls to the local Creator and Reviewer endpoints
- `api_server.py` — local Flask entry point
- `server/prompts.py` — visibly separate Creator and Reviewer prompts
- `server/schemas.py` — strict output contracts
- `server/services.py` — Responses API integration
- `server/pdf_evidence.py` — strict page-cited PDF extraction and deterministic curated fixture
- `server/validators.py` — deterministic checks kept separate from AI judgment
- `tests/workflow.test.mjs` — end-to-end domain verification
- `tests/test_backend_contracts.py` — prompt and schema contract verification

The final record is always derived from the immutable Creator draft plus explicit human decisions. Reviewer recommendations never modify the record directly.

Live Reviewer coverage distinguishes no change needed, change recommended, missing field, needs verification, and not assessable. It reviews 020, 050, 043, 100, 245, 264, 300, 336/337/338, 504/505, 520, 650, and 655 exactly once, but never creates recommendations to satisfy a quota. Confidence never substitutes for actual authority verification.

Every generated run records the confirmed visible source input, complete retrieval or extraction provenance, requested and effective mode, API metadata, Creator output, Reviewer output, human decision events, final record, and fallback events. The full audit is visible and downloadable from the UI. Retrieval and PDF extraction metadata never enter either AI payload unless represented in—and confirmed as part of—the visible Resource Source Package.

The same versioned Cataloging Policy Profile is displayed to the human, supplied to both AI roles, verified by the server against the canonical JSON file, and preserved in the audit. It is policy context only and never enters MARC output. Repository `AGENTS.md` remains the higher-level development agreement; it is not sent wholesale to the AI roles.

Plain-language labels are UI presentation metadata only. They do not enter MARC output, backend records, or audit data. Exact MARC tags and subfields remain unchanged.

MARC encoding is deterministic rather than model-formatted. The formatter supplies both indicator positions, title/subtitle/responsibility subfields, nonfiling-character counts, repeated publication place/publisher subfields, physical-description `$a`/`$b`/`$c` structure, a role-aware RDA relationship designator in field 100 (for example `$eauthor` or `$ecomposer`), RDA content/media/carrier codes, subject and genre/form content designators, separate 700 fields for additional people, and separate 710 fields for corporate bodies. Field 100 is limited to one chiefly responsible personal name; edited collections and moving-image works without a single 100 creator are entered under title, with applicable people represented separately in field 700. Backend normalization enforces these invariants before the Creator draft reaches the UI and supplies `text`/`unmediated`/`volume` in 336/337/338 when the confirmed source identifies a print book.

Visible contents evidence remains a separate, human-confirmed Source Package element and is transcribed into field 505 without hidden condensation. Explicit bibliography evidence may produce field 504. Geographic subject components drive a deterministic 043 consistency check (including `a-cc---` for China). Field 050 is visibly treated as a non-LC-assigned proposal with second indicator 4 and a separate rationale; it requires human verification against the LC classification schedules.

Book records include a stable run-level field 005 and a 40-character, evidence-derived field 008. Date, place, illustration, bibliography, index, literary-form, and language positions are populated only from confirmed record data; unknown codes remain explicit when evidence is absent. The original fictional PDF supplies a clearly labeled, checksum-valid fictional ISBN so the demonstrated record can include field 020 without implying real publisher assignment.

## LC vocabulary verification

The live Reviewer separates three questions: whether the visible source supports a concept, whether an exact LCSH/LCGFT authorized form was found, and whether that authorized term is appropriately applied. The server checks Creator 650 and 655 proposals against the LC Linked Data Service before invoking the Reviewer. Each result—including lookup failure—is shown under **LC vocabulary checks** and preserved in `audit.authorityChecks`.

An authorized-label match verifies form only. Application remains an independent Reviewer assessment followed by human Accept/Edit/Reject. If a live LC lookup fails, the candidate remains explicitly unverified except for a narrowly scoped, visibly labeled curated snapshot used by the fictional demonstration. No lookup failure is silently treated as success.

For a simple constructed LCSH ending in one geographic subdivision, the verifier does not require a literal authority record for the complete string. It verifies the main heading in LCSH and the geographic name in LCNAF, retrieves both MARC authority records, confirms that the place is established in field 151, checks main-authority `008/06` for direct (`d`) or indirect (`i`) geographic subdivision permission, and checks `008/15` for subject use (`a`). The UI exposes each component and its LC record. More complex or unresolved subdivision chains remain unverified for human review.

Subdivision type is determined from the authority record rather than position in the string: field 180 is topical (`$x`), 181 geographic (`$z`), 182 chronological (`$y`), and 185 form (`$v`). Main-heading `008/06` is consulted only for geographic construction. Thus a term such as `Security measures` established in 180 is never mislabeled or tested as a geographic subdivision.

If the main heading remains unverified but the terminal component is independently identified—for example, LCNAF field 151 establishes `China` as geographic—the Creator draft preserves `$z` while clearly retaining the overall heading's unverified status. If neither subdivision type nor construction can be resolved, the draft uses provisional uncontrolled field 653 instead of silently inventing `$x`. Any replacement proposed by the Reviewer is independently sent through the same LC verification service before its verification badge is displayed.

Authority reconciliation also follows LCSH 4XX references. The `suggest2` response supplies the matched variant label, authorized label, authority URI, scope notes, and other variants. A spacing-normalized fallback can therefore resolve a draft term such as `Cyberattacks` through the 450 `Cyber attacks` to the authorized 150 `Cyberterrorism`. The current term remains unverified; the authorized construction is presented as a Reviewer replacement requiring evidence-based human approval.

Official routing and application resources are recorded in local `AGENTS.md` and the versioned runtime policy: the [LC Linked Data Service](https://id.loc.gov/), [Subject Headings Manual](https://www.loc.gov/aba/publications/FreeSHM/freeshm.html), and [LC Genre/Form Terms Manual](https://www.loc.gov/aba/publications/FreeLCGFT/freelcgft.html).

Live PDF extraction uses an extended request timeout and limited transport retries because document requests are larger and slower than Creator/Reviewer JSON calls. A connection failure remains visible, preserves the selected source, and never substitutes curated fixture data.

## Build Week extension and Codex collaboration

The pre-existing `CatalogingUI ESM` sibling is preserved unchanged. This Build Week workspace was scaffolded separately on July 18, 2026. Its human-confirmed Source Package, separate live GPT-5.6 Creator and Reviewer services, strict schemas, adaptive field coverage, Accept/Edit/Reject workflow, final-record derivation, complete audit, explicit fallback behavior, PDF and ISBN intake, cataloging-policy contract, LC authority reconciliation, original demo materials, and regression tests were developed during the submission period. The dated Git history provides file-level evidence of that work.

Codex was the principal engineering collaborator. It translated the human expert's product vision into the vertical-slice architecture, implemented and tested the browser and server layers, diagnosed live API and PDF issues, researched official MARC and LC vocabulary behavior, and iteratively corrected the system in response to expert review. The human cataloger retained authority over scope, cataloging policy, MARC correctness, authority interpretation, and final product decisions. Examples include requiring one person in field 100, separating 245 responsibility and 700/710 access points, adding RDA 336/337/338, distinguishing LCSH `$x/$z/$y/$v`, and requiring 4XX-to-1XX authority evidence.

GPT-5.6 is used in two separate structured calls with separate prompts. The Creator drafts only from the confirmed visible evidence. The Reviewer independently audits that draft against the same evidence, deterministic findings, and recorded authority results. This role separation is central to the product rather than an implementation detail.
