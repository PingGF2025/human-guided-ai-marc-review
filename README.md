# Human-Guided AI MARC Review

A focused demonstration of an explainable expert-review workflow:

> AI creates. AI reviews. Humans decide.

Licensed under the [MIT License](LICENSE).

This Build Week prototype adapts ideas from an existing cataloging interface into a focused demonstration of transparent, human-guided AI review.

## Three-minute demo

[Watch the Human-Guided AI MARC Review Build Week demo on YouTube](https://youtu.be/3wkxP2i9WaU).

[View the submitted Human-Guided AI MARC Review project on Devpost](https://devpost.com/software/human-guided-ai-marc-review).

Included demonstration evidence:

- [`output/pdf/build-week-demo-source.pdf`](output/pdf/build-week-demo-source.pdf) - original fictional evidence packet for recording

## Current milestone

The application supports a deterministic Demo mode and a Live mode for real source packages. It supports:

1. Unified pasted-text / ISBN intake plus one-PDF upload
2. Deterministic ISBN-10 and ISBN-13 validation
3. Open Library retrieved metadata with field-level provenance and human confirmation
4. One visible, human-confirmed Resource Source Package shared exactly by Creator and Reviewer
5. A curated, repeatable Demo workflow
6. Adaptive Live review across all MARC areas with zero-to-many recommendations
7. Separate deterministic checks, semantic assessment, and verification status
8. Human accept, edit, and reject decisions
9. A final MARC record derived from those decisions
10. A complete downloadable audit trail and reset
11. Explicit, visible fallback and failure behavior
12. One visible, versioned Cataloging Policy Profile shared by Creator and Reviewer
13. Reviewable PDF evidence extraction with page-level provenance and a deterministic curated fixture

Open Library values are explicitly labeled **retrieved metadata**, not authoritative cataloging data. Missing values, retrieval failures, and use of the offline fixture remain visible to the human and in the audit.

URL and spreadsheet ingestion remain deliberately deferred. General-purpose multi-file PDF processing is also outside the Build Week slice.

## Prerequisites

- **Deterministic Demo:** Python 3 to start the local static server
- **Live mode:** Python 3.10 or newer, `pip`, network access, and an OpenAI project API key
- **Tests:** Node.js 18 or newer for the browser workflow tests; Python 3.10 or newer for backend tests

## Launch

Clone the repository and enter its root directory:

```bash
git clone https://github.com/PingGF2025/human-guided-ai-marc-review.git
cd human-guided-ai-marc-review
```

### Choose the correct run path

The application opens in **Demo** mode. Select **Live** before using pasted text, ISBN data, or a PDF for the complete Creator → Reviewer workflow.

| Source path | UI mode | Server and network requirements | Implemented behavior |
| --- | --- | --- | --- |
| **Load fictional demo fixture** (*Memory Palace*) | Demo (default) | Static server only; no API key | Complete deterministic Creator, three recommendations, Accept/Edit/Reject, final record, audit, and reset |
| Original fictional PDF in `output/pdf/` | Live | `api_server.py` and an API key for Creator/Reviewer; its checksum-matched evidence extraction itself makes no OpenAI call | Complete live workflow using deterministic, page-cited extraction from the supplied fictional PDF |
| Other PDF, one file up to 25 MB | Live | `api_server.py`, API key, and network access | Live OpenAI evidence extraction followed by the live Creator/Reviewer workflow |
| Bundled ISBN `9780141439518` | Live | Metadata preparation is bundled and needs no Open Library call; `api_server.py` and an API key are required for Creator/Reviewer | Deterministic retrieved-metadata snapshot, human confirmation, then live Creator/Reviewer |
| Other valid ISBN-10 or ISBN-13 | Live | Open Library access plus `api_server.py` and an API key for Creator/Reviewer | Populates the Source Package only when Open Library returns a match; otherwise the UI reports that no match was found |
| Pasted source text | Live | `api_server.py` and an API key | Places the text in the visible description field for human completion and confirmation before Creator runs |

### Deterministic Demo mode

From this repository root—the directory containing `index.html`—start a local static server:

```bash
python3 -m http.server 8000
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000).

The app uses browser-native ES modules and has no runtime dependencies.

The application opens with an empty intake and empty Resource Source Package. **Load fictional demo fixture** explicitly loads *Memory Palace*; it has no ISBN and is visibly identified as fictional demonstration data.

Demo mode accepts only the explicitly loaded fictional fixture. The static server cannot process PDF uploads or run the live Creator and Reviewer. If a Live call fails for the fictional fixture, the UI may visibly switch to its corresponding deterministic fallback. If a Live call fails for a real source, the failure is recorded and the workflow stops; unrelated fictional output is never substituted.

### Live mode

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

Open [http://127.0.0.1:8000](http://127.0.0.1:8000), then select **Live** in the Run mode control before beginning a PDF, ISBN, or pasted-text workflow. API keys remain on the local server and are never sent to the browser.

An ISBN may be entered in the unified intake or directly in the visible Source Package ISBN field; **Prepare source package** recognizes either location. ISBN checksum validation is deterministic. The bundled ISBN uses a visibly labeled metadata snapshot; other valid ISBNs query Open Library and succeed only when Open Library returns a match. Open Library values are candidates for human verification, not authoritative cataloging data.

The PDF upload accepts one file up to 25 MB. The original fictional PDF uses deterministic, explicitly labeled evidence extraction when its checksum matches, but the subsequent Creator and Reviewer are still Live calls. Other PDFs use live OpenAI document extraction. Every extracted value remains an editable candidate until the human confirms the visible Source Package. The audit records filename, size, checksum, extraction method, page citations, warnings, and human-confirmed values; raw PDF bytes are not stored in the audit.

For every Live source path, review or edit the populated Resource Source Package and select **Verify and confirm source package** before running the Creator. A title or resource description is required for confirmation.

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

Live Reviewer coverage distinguishes no change needed, change recommended, missing field, needs verification, and not assessable. It reviews 020, 050, 043, 100, 245, 264, 300, 336/337/338, 504, 505, 520, 650, and 655 exactly once, but never creates recommendations to satisfy a quota. Confidence never substitutes for actual authority verification.

When a source-supported subject or genre/form heading remains unverified, the interface exposes it for an explicit human choice: keep the Creator heading, edit the MARC field, or remove it. An unavailable or inconclusive lookup is never treated by itself as evidence for removal.

Every generated run records the confirmed visible source input, complete retrieval or extraction provenance, requested and effective mode, API metadata, Creator output, Reviewer output, human decision events, final record, and fallback events. The full audit is visible and downloadable from the UI. Retrieval and PDF extraction metadata never enter either AI payload unless represented in—and confirmed as part of—the visible Resource Source Package.

The same versioned Cataloging Policy Profile is displayed to the human, supplied to both AI roles, verified by the server against the canonical JSON file, and preserved in the audit. It is policy context only and never enters MARC output. Repository `AGENTS.md` remains the higher-level development agreement; it is not sent wholesale to the AI roles.

Plain-language labels are UI presentation metadata only. They do not enter MARC output, backend records, or audit data. Exact MARC tags and subfields remain unchanged.

MARC encoding is deterministic rather than model-formatted. The formatter supplies both indicator positions, title/subtitle/responsibility subfields, nonfiling-character counts, repeated publication place/publisher subfields, physical-description `$a`/`$b`/`$c` structure, a role-aware RDA relationship designator in field 100 (for example `$eauthor` or `$ecomposer`), RDA content/media/carrier codes, subject and genre/form content designators, separate 700 fields for additional people, and separate 710 fields for corporate bodies. Field 100 is limited to one chiefly responsible personal name; edited collections and moving-image works without a single 100 creator are entered under title, with applicable people represented separately in field 700. Backend normalization enforces these invariants before the Creator draft reaches the UI and supplies `text`/`unmediated`/`volume` in 336/337/338 when the confirmed source identifies a print book.

Visible contents evidence remains a separate, human-confirmed Source Package element and is transcribed into field 505 without hidden condensation. Explicit bibliography evidence may produce field 504. Geographic subject components drive a deterministic 043 consistency check (including `a-cc---` for China). Field 050 is visibly treated as a non-LC-assigned proposal with second indicator 4 and a separate rationale; it requires human verification against the LC classification schedules.

Book records include a stable run-level field 005 and a 40-character, evidence-derived field 008. Date, place, illustration, bibliography, index, literary-form, and language positions are populated only from confirmed record data; unknown codes remain explicit when evidence is absent. The original fictional PDF supplies a clearly labeled, checksum-valid fictional ISBN so the demonstrated record can include field 020 without implying real publisher assignment.

## LC vocabulary verification

The live Reviewer separates three questions: whether the visible source supports a concept, whether an exact LCSH/LCGFT authorized form was found, and whether that authorized term is appropriately applied. The server checks Creator 650 and 655 proposals against the LC Linked Data Service before invoking the Reviewer. Each result—including lookup failure—is shown under **LC vocabulary checks** and preserved in `audit.authorityChecks`.

The Creator performs primary subject analysis across the confirmed title, description, notes, and contents, proposing a small set of headings that collectively cover the work's principal concepts. The Reviewer independently checks that semantic coverage before evaluating authority form and construction. A source-supported heading is not removed merely because an exact-string lookup fails; it remains visibly unverified unless component evidence or a verified replacement resolves it. The Reviewer may also propose a missing major concept, with source evidence, for independent authority checking and human decision.

An authorized-label match verifies form only. Application remains an independent Reviewer assessment followed by human Accept/Edit/Reject. If a live LC lookup fails, the candidate remains explicitly unverified except for a narrowly scoped, visibly labeled curated snapshot used by the fictional demonstration. No lookup failure is silently treated as success.

For a constructed LCSH, the verifier does not require a literal authority record for the complete string. It checks the main heading and each subdivision component separately. It recognizes 180/181/182/185 topical, geographic, chronological, and form subdivisions; a 150 accompanied by a 260 subdivision instruction; and LCNAF 151 geographic names. It checks main-authority `008/06` when geographic subdivision is present and `008/15` for subject use. The UI exposes every component, LC record, and available subdivision instruction. Unresolved components remain visibly unverified for human review.

Subdivision type is determined from the authority record rather than position in the string: field 180 is topical (`$x`), 181 geographic (`$z`), 182 chronological (`$y`), and 185 form (`$v`). Main-heading `008/06` is consulted only for geographic construction. Thus a term such as `Security measures` established in 180 is never mislabeled or tested as a geographic subdivision.

If the main heading remains unverified but the terminal component is independently identified—for example, LCNAF field 151 establishes `China` as geographic—the Creator draft preserves `$z` while clearly retaining the overall heading's unverified status. If neither subdivision type nor construction can be resolved, the draft uses provisional uncontrolled field 653 instead of silently inventing `$x`. Any replacement proposed by the Reviewer is independently sent through the same LC verification service before its verification badge is displayed.

Authority reconciliation also follows LCSH 4XX references. The `suggest2` response supplies the matched variant label, authorized label, authority URI, scope notes, and other variants. In the fictional PDF workflow, this allows the draft term `Public markets` to resolve through the 450 `Public markets` to the authorized 150 `Markets`. When the geographic component is also verified, the Reviewer can present `Markets—China` as a replacement. The variant draft term remains unverified, and applying the authorized construction still requires evidence-based human approval.

Official routing and application resources are recorded in local `AGENTS.md` and the versioned runtime policy: the [LC Linked Data Service](https://id.loc.gov/), [Subject Headings Manual](https://www.loc.gov/aba/publications/FreeSHM/freeshm.html), and [LC Genre/Form Terms Manual](https://www.loc.gov/aba/publications/FreeLCGFT/freelcgft.html).

Live PDF extraction uses an extended request timeout and limited transport retries because document requests are larger and slower than Creator/Reviewer JSON calls. A connection failure remains visible, preserves the selected source, and never substitutes curated fixture data.

## Build Week extension and Codex collaboration

This focused Build Week prototype was developed during the submission period by adapting ideas from an existing cataloging interface. Its human-confirmed Source Package, separate live GPT-5.6 Creator and Reviewer services, strict schemas, adaptive field coverage, Accept/Edit/Reject workflow, final-record derivation, complete audit, explicit fallback behavior, PDF and ISBN intake, cataloging-policy contract, LC authority reconciliation, original demo materials, and regression tests are included in this repository. The public repository begins with a privacy-reviewed submission snapshot rather than the earlier local development history.

Codex was the principal engineering collaborator. It translated the human expert's product vision into the vertical-slice architecture, implemented and tested the browser and server layers, diagnosed live API and PDF issues, researched official MARC and LC vocabulary behavior, and iteratively corrected the system in response to expert review. The human cataloger retained authority over scope, cataloging policy, MARC correctness, authority interpretation, and final product decisions. Examples include requiring one person in field 100, separating 245 responsibility and 700/710 access points, adding RDA 336/337/338, distinguishing LCSH `$x/$z/$y/$v`, and requiring 4XX-to-1XX authority evidence.

GPT-5.6 is used in two separate structured calls with separate prompts. The Creator drafts only from the confirmed visible evidence. The Reviewer independently audits that draft against the same evidence, deterministic findings, and recorded authority results. This role separation is central to the product rather than an implementation detail.
