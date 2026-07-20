# Devpost Submission Draft

## Project name

Human-Guided AI MARC Review

## Tagline

AI creates. AI reviews. Humans decide.

## Category

Work and Productivity

## Short description

Human-Guided AI MARC Review helps metadata experts create and review complex structured records without hiding AI uncertainty. A GPT-5.6 Creator drafts a MARC bibliographic record from visible, human-confirmed evidence. A separate GPT-5.6 Reviewer audits every record area, consults recorded Library of Congress authority evidence, and presents explainable recommendations. A human cataloger accepts, edits, or rejects each recommendation before the final record is produced.

## Inspiration

Professional metadata work demands both efficiency and accountability. Catalogers increasingly want AI assistance with description and subject analysis, but a one-shot generator can hide uncertainty, unsupported assumptions, and authority-control errors. We wanted to demonstrate a healthier collaboration pattern that applies beyond libraries: one AI creates, another independently reviews, and the expert remains responsible for every consequential change.

## What it does

The application accepts pasted text, validated ISBNs, or one PDF evidence packet. PDF extraction produces page-cited candidate evidence. The user reviews a visible Resource Source Package and confirms exactly what both AI roles may see.

The Creator returns structured bibliographic data; deterministic code supplies MARC 21 encoding. The Reviewer then evaluates twelve MARC areas against the same source evidence and cataloging policy. It can return zero recommendations when no change is warranted.

For subjects and genre/form terms, the system records live Library of Congress authority checks. It distinguishes authorized form from appropriate application, resolves selected 4XX references, identifies topical/geographic/chronological/form subdivision types, inspects MARC Authority 008 codes where applicable, and links directly to supporting authority records.

The Reviewer cannot edit the record. The cataloger must Accept, Edit, or Reject recommendations. The final record is derived only from the Creator draft plus those explicit human decisions. A downloadable audit records the source, both AI outputs, authority evidence, human decisions, mode, final record, and any fallback event.

## How we used Codex and GPT-5.6

Codex served as the principal engineering collaborator during Build Week. It helped isolate the demo from the existing application, define the workflow state, implement the UI and Flask services, create strict Structured Outputs schemas, build deterministic MARC encoding, add PDF/ISBN evidence intake, develop LC authority reconciliation, write tests, diagnose live failures, and maintain documentation.

The human cataloging expert made the key product and professional decisions: limiting scope to one clear workflow, defining the human-approval boundary, correcting MARC structures, distinguishing LCSH subdivision types, interpreting authority records, and rejecting unsafe automation. Those corrections directly shaped the implementation.

GPT-5.6 runs as two visibly separate roles. The Creator drafts from the confirmed Source Package. The independent Reviewer receives the same evidence plus deterministic findings and authority results, then produces structured coverage and recommendations. Separate prompts and calls make the roles explainable in code and in the demonstration.

## What existed before Build Week

An earlier CatalogingUI ESM prototype existed before the submission period. It remains unchanged. The separate `CatalogingUI Build Week` workspace and its Creator/Reviewer workflow, source package, live GPT-5.6 services, human decision state, audit trail, PDF/ISBN ingestion, cataloging-policy contract, authority reconciliation, demo assets, documentation, and tests were created or meaningfully extended during the Build Week submission period. Dated Git history and the primary Codex session document this work.

## Challenges

The hardest problem was not generating MARC text; it was preserving the boundary between evidence, inference, authority verification, application policy, and human judgment. LC authority data also revealed important edge cases: identical labels can represent different authority record types, 4XX variants must resolve to 1XX authorized forms, and `$x`, `$z`, `$y`, and `$v` subdivisions require different validation paths.

## What we learned

Explainability becomes more useful when it is operational rather than decorative. Showing the source package, authority record, coded verification evidence, and human decision history allows an expert to understand and correct the system. The project also demonstrated that AI review is valuable even when reviewing AI-created work: an independent pass can expose uncertainty and convert it into a precise human decision point.

## What's next

Post-submission work could add LCNAF identity reconciliation for personal and corporate names, more complex multi-subdivision LCSH construction, URL and spreadsheet evidence ingestion, export formats, and configurable local policy profiles. These were intentionally deferred to keep the Build Week demonstration coherent.
