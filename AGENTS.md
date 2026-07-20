# Build Week Cataloging Agreement

This local agreement supplements the repository-level `AGENTS.md` for the
Human-Guided AI MARC Review demonstration.

## Runtime cataloging policy

- Apply the versioned `cataloging-profile.json` supplied to both AI roles.
- Treat the visible, human-confirmed Resource Source Package as the complete
  evidentiary boundary for Creator and Reviewer content judgments.
- Apply RDA description and MARC 21 encoding conservatively.
- Separate concept identification, authority-form verification, and term
  application. Success at one layer does not prove the next.
- Never call an LCSH or LCGFT proposal verified from model memory or confidence.
- Keep unsupported and unverified data out of production output unless a human
  explicitly approves it after seeing its status.
- Preserve lookup inputs, results, timestamps, sources, failures, fallbacks, and
  human decisions in the run audit.

## Official resource routing

- LC Linked Data Service, LCSH: <https://id.loc.gov/authorities/subjects/>
- LC Linked Data Service, LCGFT: <https://id.loc.gov/authorities/genreForms/>
- LC Linked Data Service, LCNAF names and geographic names: <https://id.loc.gov/authorities/names/>
- Subject Headings Manual: <https://www.loc.gov/aba/publications/FreeSHM/freeshm.html>
- SHM H 180: <https://www.loc.gov/aba/publications/FreeSHM/H0180.pdf>
- LCGFT and Genre/Form Terms Manual: <https://www.loc.gov/aba/publications/FreeLCGFT/freelcgft.html>
- LCGFT J 110: <https://www.loc.gov/aba/publications/FreeLCGFT/J110.pdf>
- MARC 21 Bibliographic: <https://www.loc.gov/marc/bibliographic/>

Links are routing instructions, not evidence that a lookup occurred. Runtime
verification must come from a recorded service result or a visibly identified,
versioned curated snapshot.
