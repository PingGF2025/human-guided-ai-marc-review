"""Deterministic checks that remain separate from AI semantic review."""

from typing import Any


def _compact_isbn(value: Any) -> str:
    return "".join(character for character in str(value or "").upper() if character.isdigit() or character == "X")


def _valid_isbn(value: Any) -> bool:
    isbn = _compact_isbn(value)
    if len(isbn) == 10 and isbn[:9].isdigit() and (isbn[9].isdigit() or isbn[9] == "X"):
        return sum((10 - index) * (10 if char == "X" else int(char)) for index, char in enumerate(isbn)) % 11 == 0
    if len(isbn) == 13 and isbn.isdigit() and isbn.startswith(("978", "979")):
        total = sum(int(char) * (1 if index % 2 == 0 else 3) for index, char in enumerate(isbn[:12]))
        return (10 - total % 10) % 10 == int(isbn[12])
    return False


def validate_draft(source: dict[str, Any], draft: dict[str, Any]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    source_isbn = _compact_isbn(source.get("isbn"))
    draft_isbn = _compact_isbn(draft.get("isbn"))
    if draft_isbn and not _valid_isbn(draft_isbn):
        findings.append({"field": "020", "severity": "error", "code": "invalid_isbn", "message": "Draft ISBN fails its deterministic checksum."})
    if source_isbn and draft_isbn != source_isbn:
        findings.append({"field": "020", "severity": "error", "code": "isbn_mismatch", "message": "Draft ISBN does not match the confirmed Source Package ISBN."})
    if not str(draft.get("title") or "").strip():
        findings.append({"field": "245", "severity": "error", "code": "missing_title", "message": "Creator draft has no title."})
    author = str(draft.get("author") or "").strip()
    if ";" in author or author.lower().count(" editor") > 1:
        findings.append({"field": "100", "severity": "error", "code": "multiple_names_in_100", "message": "Field 100 is nonrepeatable and must not combine multiple personal names; use separate 700 contributor entries."})
    if str(draft.get("summary") or "").strip() and not str(source.get("description") or "").strip():
        findings.append({"field": "520", "severity": "warning", "code": "unsupported_summary", "message": "Draft contains a summary, but the confirmed Source Package has no descriptive evidence."})
    source_contents = " ".join(str(source.get("contents") or "").split())
    draft_contents = " ".join(str(draft.get("contentsNote") or "").split())
    if source_contents and draft_contents != source_contents:
        findings.append({"field": "505", "severity": "error", "code": "contents_mismatch", "message": "Field 505 must preserve the confirmed visible contents wording and order exactly."})
    if draft_contents and not source_contents:
        findings.append({"field": "505", "severity": "error", "code": "unsupported_contents", "message": "Draft contains a 505 note, but the confirmed Source Package has no contents evidence."})
    notes = str(source.get("additionalNotes") or "").lower()
    if str(draft.get("bibliographyNote") or "").strip() and "bibliographical references" not in notes:
        findings.append({"field": "504", "severity": "error", "code": "unsupported_bibliography_note", "message": "Field 504 is not supported by an explicit statement in the confirmed Source Package."})
    has_china_geography = any(
        str(subject).lower().endswith(("—china", "--china")) for subject in (draft.get("subjects") or [])
    )
    if has_china_geography and str(draft.get("geographicAreaCode") or "") != "a-cc---":
        findings.append({"field": "043", "severity": "error", "code": "missing_geographic_area_code", "message": "A geographic subject component for China requires 043 $a a-cc--- in this policy profile."})
    if str(draft.get("classificationNumber") or "").strip():
        findings.append({"field": "050", "severity": "info", "code": "classification_is_proposal", "message": "Field 050 is a non-LC-assigned proposal (second indicator 4) and requires human verification against the LC classification schedules."})
    if len(draft.get("subjects") or []) > 3:
        findings.append({"field": "650", "severity": "error", "code": "subject_limit", "message": "Draft exceeds the configured limit of three subject headings."})
    if "book" in str(source.get("format") or "").lower() or "print" in str(source.get("format") or "").lower():
        expected_types = {"contentType": "text", "mediaType": "unmediated", "carrierType": "volume"}
        if any(str(draft.get(field) or "").strip().lower() != value for field, value in expected_types.items()):
            findings.append({"field": "336/337/338", "severity": "error", "code": "incomplete_rda_types", "message": "Confirmed print-book evidence requires text, unmediated, and volume in fields 336, 337, and 338."})
    return findings
