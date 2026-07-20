# Build Week Demo Plan

Use [`AUDIO_SCRIPT.md`](AUDIO_SCRIPT.md) for the recording-ready narration. This document remains the detailed shot plan and rehearsal checklist.

## Positioning

**Track:** Work and Productivity

**One-line description:** Human-Guided AI MARC Review helps metadata experts turn source evidence into structured records through separate AI Creator and Reviewer roles, transparent authority evidence, and field-level human decisions.

**Central claim:** This project is about trustworthy AI, demonstrated through cataloging. Cataloging is the proof of concept, explainability is the mechanism, and accountable human–AI collaboration is the broader contribution.

## Three-minute recording script

Target length: 2:40-2:50. Do not exceed 2:59.

### 0:00-0:20 - Problem and promise

Show the empty application and workflow steps.

> AI can draft structured professional records quickly, but hidden evidence, unsupported assumptions, and opaque revisions make that dangerous. Cataloging is an ideal proving ground because its decisions depend on evidence, standards, and human judgment.

### 0:20-0:50 - Visible evidence

Select `output/pdf/build-week-demo-source.pdf`, choose Live mode, and extract it.

> The process begins with human-provided evidence. The extractor cites each PDF page, fills a visible Source Package, and flags missing or uncertain information. Nothing hidden is sent to either cataloging role.

Open **View extracted evidence and page references** briefly, then confirm the package.

### 0:50-1:20 - AI Creator

Choose **Create AI draft** and scroll to the MARC preview.

> GPT-5.6 creates a conservative structured draft. Deterministic code supplies MARC encoding, while unsupported facts remain blank and uncertain classification remains visibly proposed. This is explicitly a draft, not an autonomous final record.

Point to one description field and one proposed subject field.

### 1:20-2:10 - Independent Reviewer and authority evidence

Choose **Ask independent AI Reviewer**.

> The Reviewer is independent. A separate GPT-5.6 call receives the confirmed evidence, Creator draft, and deterministic findings. It reviews all twelve MARC areas but can only recommend changes; it cannot alter the record. Subject proposals are checked against live Library of Congress authorities.

Open one **View authority evidence** disclosure. Show the LC authority link and distinguish authorized form from appropriate application.

### 2:10-2:35 - Human decision

Accept, edit, or reject the recommendation. Prefer an Edit that visibly changes one MARC field.

> The expert can accept, edit, or reject every recommendation. Here the human corrects the MARC construction. The final record changes only because the human approved that decision.

### 2:35-2:50 - Final record and audit

Show **Final MARC record**, then briefly expand the audit summary.

> The final record and complete audit preserve the source, both AI outputs, authority checks, human decisions, mode, and any fallback. Cataloging is the proof of concept; the same architecture applies wherever experts create and review structured professional records.

## Recording safeguards

- Use only the original fictional PDF in `output/pdf/`; do not show scanned third-party books.
- Hide the `.env` file, API key, browser history, personal notifications, and unrelated filenames.
- Record at a readable browser zoom and close unrelated tabs.
- Use Live mode for the primary take and rehearse the deterministic Demo fallback.
- If a live request fails, stop the take; never edit the video to imply a successful live result.
- Do not add copyrighted music, third-party logos, or unrelated trademarks.
- Upload the final video publicly to YouTube and verify it while signed out.

## Deterministic fallback take

If network reliability is poor, load the fictional demo fixture and use Demo mode. State clearly that the run is deterministic. The fallback still demonstrates Creator, Reviewer, Accept/Edit/Reject, Final Record, Reset, and audit behavior, but the preferred submission video should show the live authority-evidence workflow.

## Final rehearsal checklist

- API server starts from a clean terminal.
- `/api/health` returns `{"ok": true}`.
- Original fictional PDF extracts successfully.
- Source Package is reviewed and confirmed.
- Creator produces a plausible draft.
- Reviewer returns complete coverage without invented quota changes.
- Authority disclosure contains a working LC link.
- Human decision updates Final MARC correctly.
- Audit records Live mode and no silent fallback.
- Entire narration and interaction finish under three minutes.
