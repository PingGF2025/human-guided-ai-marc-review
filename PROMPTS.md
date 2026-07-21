# AI role separation

Before Reviewer invocation, deterministic code adds a distinct `LC VOCABULARY AUTHORITY CHECKS` block. It records vocabulary-form lookup evidence; it is not part of the human source evidence and does not by itself establish appropriate application.

The live workflow uses two independent API calls. Their prompts are stored as separate constants in [`server/prompts.py`](server/prompts.py).

## Shared Cataloging Policy Profile

Both roles receive the exact same versioned `cataloging-profile.json`. It represents the active human–AI runtime agreement: applicable standards, target vocabularies, evidence rules, prohibited assumptions, verification requirements, and the human-approval boundary. The server rejects a browser-supplied profile that differs from the canonical file. The profile is recorded in the audit but never inserted into MARC.

## PDF evidence extractor

PDF ingestion is a separate pre-Creator role defined in `server/pdf_evidence.py`. It may extract only visibly supported candidate facts and must cite PDF page numbers and excerpts. It does not create MARC, assign headings, or approve its own extraction. The human can edit the resulting visible Source Package and must confirm it before either cataloging role runs. Creator and Reviewer receive the confirmed Source Package—not the PDF bytes or hidden extraction metadata.

## AI Creator

The Creator receives the active Cataloging Policy Profile plus only the visible Resource Source Package and produces a conservative structured bibliographic draft. It is told that its output is provisional and that missing facts must remain empty rather than be invented. For subject analysis it must examine the title, description, additional notes, and especially contents together; identify principal rather than incidental concepts; and propose a small set of evidence-supported headings that collectively cover the work. Those values remain candidates until the separate LC authority layer and Reviewer evaluate them.

Personal names and relationships remain separate structured values. A 100 access point receives the applicable RDA relationship designator rather than a hard-coded author role. Resource-specific practice remains important: a composer may appropriately be the 100 creator for a musical work, while a film director is normally represented as a 700 contributor under title main entry.

Names are structurally separated: `author` permits at most one chiefly responsible person for field 100, `contributors` contains individual personal-name, source-statement, and relationship values for repeatable 700 fields, and `corporateContributors` supplies separate 710 data. `statementOfResponsibility` preserves source-order wording for 245 subfield c. An edited collection with no single personal creator leaves `author` empty. Deterministic backend normalization enforces these boundaries even if model output does not. The model returns data values only; deterministic code supplies MARC indicators, subfields, punctuation, and RDA vocabulary codes.

Input:

```text
Cataloging Policy Profile JSON + Resource Source Package JSON
```

Output:

```text
Creator draft matching CREATOR_SCHEMA
```

## AI Reviewer

The Reviewer receives the exact same Cataloging Policy Profile, visible Resource Source Package, completed Creator draft, and separately generated deterministic validation findings. It reviews twelve MARC areas exactly once—including proposed classification, geographic coding, bibliography, and contents—and may produce zero or more recommendations. It cannot modify the draft. For subjects it first performs an independent completeness check against the visible evidence, then separates concept support, authority form, construction, and application. Lookup failure alone is not a reason to remove a source-supported heading; missing major concepts and verified replacements remain actionable recommendations for the human.

Each coverage result distinguishes `no_change`, `change_recommended`, `missing_field`, `needs_verification`, and `not_assessable`. Confidence and verification are separate: a heading remains `not_verified` unless an actual authority result was supplied as evidence.

Input:

```text
same Cataloging Policy Profile JSON + same Resource Source Package JSON + Creator draft + deterministic findings
```

Output:

```text
complete field coverage plus zero-to-many recommendations matching REVIEWER_SCHEMA
```

## Human authority boundary

Only deterministic application code applies accepted or human-edited recommendations. Rejected recommendations never affect the final record.

## Fallback behavior

If a Live request fails for the explicitly loaded fictional fixture, the application may visibly switch to its deterministic Demo output. If Live fails for pasted text, ISBN-derived input, or PDF evidence, the failure is recorded and the workflow stops; unrelated fixture output is never substituted.
