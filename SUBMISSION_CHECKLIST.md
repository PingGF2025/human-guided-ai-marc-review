# Build Week Submission Checklist

Official deadline: **July 21, 2026 at 5:00 PM Pacific Time**. Submit early enough to recover from upload or repository-access problems.

## Required submission items

- [ ] Register and submit before the deadline.
- [ ] Select **Work and Productivity**.
- [ ] Add an English project description explaining features and functionality.
- [ ] Upload a public YouTube demonstration video under three minutes.
- [ ] Create or confirm the YouTube channel before recording day; account verification or processing must not become a deadline blocker.
- [ ] Include clear audio explaining what was built and how Codex and GPT-5.6 were used.
- [ ] Provide the code repository URL.
- [ ] If public, add an appropriate license; if private, share it with `testing@devpost.com` and `build-week-event@openai.com`.
- [ ] Make a working demo or test build available free of charge through the judging period.
- [ ] Provide clear installation and testing instructions.
- [ ] Run `/feedback` in the principal Codex project task and provide that Session ID.

## Existing-project evidence

- [ ] State that the pre-existing CatalogingUI ESM application remains unchanged.
- [ ] Identify `CatalogingUI Build Week` as the new sibling workspace.
- [ ] Summarize Build Week additions separately from prior functionality.
- [ ] Preserve dated Git commits beginning July 18, 2026.
- [ ] Describe Codex collaboration in the README: architecture, implementation, testing, cataloging-policy refinements, and decisions made by the human expert.
- [ ] Do not include unrelated repositories or private cataloging data in the judge-facing repository.

## Repository readiness

- [ ] Remove API keys, `.env`, credentials, local paths, and private audit downloads.
- [ ] Decide whether the repository will be public or privately shared.
- [ ] Create a clean judge-facing repository from the current submission snapshot; exclude unrelated local history and test material.
- [ ] If public, choose and add a license before publishing.
- [ ] Confirm every third-party API/data source is identified and used under its applicable terms.
- [ ] Include the original fictional demo PDF; exclude unlicensed scanned source PDFs.
- [ ] Verify setup on a clean environment with Node.js 18+ and supported Python.
- [ ] Run all JavaScript and backend tests.
- [ ] Confirm the README launch commands are complete.
- [ ] Confirm judges can test without rebuilding from scratch, using Demo mode when no API key is available.

## Video compliance

- [ ] Runtime is 2:59 or shorter.
- [ ] Audio is intelligible.
- [ ] The application is readable at video resolution.
- [ ] No API key, private metadata, notifications, or unrelated windows appear.
- [ ] No copyrighted music or unlicensed third-party material appears.
- [ ] The video explicitly says “Codex” and “GPT-5.6.”
- [ ] The video shows a working flow rather than presentation slides alone.
- [ ] YouTube visibility is Public and playback works while signed out.

## Judging narrative

- [ ] **Technological implementation:** separate structured GPT-5.6 calls, deterministic MARC logic, LC authority reconciliation, strict schemas, audit trail, tests, and visible fallback.
- [ ] **Design:** one coherent Creator -> Reviewer -> Human -> Final workflow with evidence on demand.
- [ ] **Potential impact:** a credible workflow for catalogers and other expert structured-data reviewers.
- [ ] **Quality of idea:** AI role separation and uncertainty disclosure instead of opaque one-shot generation.

## Final submission review

- [ ] Test every submitted link.
- [ ] Proofread the Devpost description in its rendered form.
- [ ] Verify repository permissions from a non-owner account.
- [ ] Save the submission confirmation.
