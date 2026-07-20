"""OpenAI Responses API calls for the independent Creator and Reviewer roles."""

import json
import os
import re
from datetime import datetime, timezone
from typing import Any

from openai import OpenAI

from .prompts import CREATOR_PROMPT, REVIEWER_PROMPT
from .schemas import CREATOR_SCHEMA, REVIEWER_SCHEMA
from .validators import validate_draft
from .authority import verify_draft_headings, verify_lcsh_heading, verify_term


DEFAULT_MODEL = "gpt-5.6-sol"
DEFAULT_REASONING_EFFORT = "low"
EXPECTED_COVERAGE_FIELDS = {"020", "050", "043", "100", "245", "264", "300", "336/337/338", "504/505", "520", "650", "655"}
FIELD_TO_AREA = {
    "isbn": "020", "author": "100", "title": "245", "publication": "264", "extent": "300",
    "contentType": "336/337/338", "mediaType": "336/337/338", "carrierType": "336/337/338",
    "summary": "520", "subjects.0": "650", "subjects.1": "650", "subjects.2": "650", "genre": "655",
    "classificationNumber": "050", "geographicAreaCode": "043", "bibliographyNote": "504/505", "contentsNote": "504/505",
}


class LiveServiceError(RuntimeError):
    """A safe, user-displayable live-service failure."""


def _join_names(names: list[str]) -> str:
    if len(names) < 2:
        return names[0] if names else ""
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return f"{', '.join(names[:-1])}, and {names[-1]}"


def _invert_personal_name(name: str) -> str:
    clean = name.strip()
    if not clean or "," in clean:
        return clean
    parts = clean.split()
    return f"{parts[-1]}, {' '.join(parts[:-1])}" if len(parts) > 1 else clean


def normalize_creator_draft(source_package: dict[str, Any], draft: dict[str, Any]) -> dict[str, Any]:
    """Enforce structural MARC/RDA invariants independently of model compliance."""
    normalized = dict(draft)
    normalized.setdefault("contributors", [])
    normalized.setdefault("corporateContributors", [])
    normalized.setdefault("statementOfResponsibility", "")
    normalized.setdefault("creatorRelationship", "")
    if str(source_package.get("isbn") or "").strip():
        normalized["isbn"] = re.sub(r"[^0-9Xx]", "", str(source_package["isbn"]))

    source_names = [part.strip() for part in str(source_package.get("author") or "").split(";") if part.strip()]
    parsed_people: list[dict[str, str]] = []
    for source_name in source_names:
        match = re.match(r"^(.*?),\s*(editor|author|composer|artist|photographer|cartographer|film director|director|translator|illustrator|compiler)\.?$", source_name, re.I)
        statement_name = (match.group(1) if match else source_name).strip()
        relationship = (match.group(2).lower() if match else "author")
        parsed_people.append({
            "name": _invert_personal_name(statement_name),
            "statementName": statement_name,
            "relationship": relationship,
        })

    main_entry_relationships = {"author", "composer", "artist", "photographer", "cartographer"}
    if len(parsed_people) > 1:
        names = [person["statementName"] for person in parsed_people]
        relationships = {person["relationship"] for person in parsed_people}
        if relationships == {"editor"}:
            normalized["author"] = ""
            normalized["contributors"] = parsed_people
            normalized["statementOfResponsibility"] = f"edited by {_join_names(names)}"
        elif parsed_people[0]["relationship"] in main_entry_relationships:
            normalized["author"] = parsed_people[0]["name"]
            normalized["creatorRelationship"] = parsed_people[0]["relationship"]
            normalized["contributors"] = parsed_people[1:]
            normalized["statementOfResponsibility"] = _join_names(names)
        else:
            normalized["author"] = ""
            normalized["creatorRelationship"] = ""
            normalized["contributors"] = parsed_people
            normalized["statementOfResponsibility"] = _join_names(names)
    elif len(parsed_people) == 1:
        person = parsed_people[0]
        if person["relationship"] in main_entry_relationships:
            normalized["author"] = person["name"]
            normalized["creatorRelationship"] = person["relationship"]
            normalized["statementOfResponsibility"] = normalized["statementOfResponsibility"] or person["statementName"]
        else:
            normalized["author"] = ""
            normalized["creatorRelationship"] = ""
            normalized["contributors"] = [person]
            responsibility_phrases = {
                "editor": "edited by", "translator": "translated by",
                "illustrator": "illustrated by", "compiler": "compiled by",
                "director": "directed by", "film director": "directed by",
            }
            phrase = responsibility_phrases.get(person["relationship"], person["relationship"])
            normalized["statementOfResponsibility"] = normalized["statementOfResponsibility"] or f"{phrase} {person['statementName']}"

    if normalized.get("author") and not normalized.get("creatorRelationship"):
        normalized["creatorRelationship"] = "author"

    source_format = str(source_package.get("format") or "").lower()
    if "book" in source_format or "print" in source_format:
        normalized["contentType"] = "text"
        normalized["mediaType"] = "unmediated"
        normalized["carrierType"] = "volume"
        normalized["books008"] = True
    language_codes = {"english": "eng", "chinese": "chi", "french": "fre", "german": "ger", "spanish": "spa"}
    normalized["languageCode"] = language_codes.get(str(source_package.get("language") or "").strip().lower(), "|||" )
    publication = str(source_package.get("publicationInformation") or "")
    place = publication.split(":", 1)[0].strip().lower()
    place_codes = {"boston": "mau", "new york": "nyu", "beijing": "cc#"}
    normalized["placeCode"] = place_codes.get(place, "xx#")
    normalized["hasIndex"] = "index" in str(source_package.get("additionalNotes") or "").lower()
    # These descriptive notes are copied only from confirmed, visible evidence.
    normalized["contentsNote"] = str(source_package.get("contents") or "").strip()
    notes = str(source_package.get("additionalNotes") or "")
    normalized["bibliographyNote"] = "Includes bibliographical references." if "bibliographical references" in notes.lower() else ""
    return normalized


def _validate_review_contract(result: dict[str, Any], authority_checks: list[dict[str, Any]] | None = None) -> None:
    coverage = result.get("reviewCoverage", [])
    fields = [item.get("field") for item in coverage]
    if len(fields) != 12 or set(fields) != EXPECTED_COVERAGE_FIELDS:
        raise LiveServiceError("Live Reviewer did not return each required MARC area exactly once.")
    statuses = {item["field"]: item["status"] for item in coverage}
    for recommendation in result.get("recommendations", []):
        area = FIELD_TO_AREA.get(recommendation.get("field"))
        if statuses.get(area) not in {"change_recommended", "missing_field"}:
            raise LiveServiceError("Live Reviewer returned a recommendation without a matching change status.")
    checks = authority_checks or []
    for vocabulary, area, prefix in (("LCSH", "650", "subjects."), ("LCGFT", "655", "genre")):
        if any(check.get("vocabulary") == vocabulary and check.get("status") not in {"verified_form", "verified_construction"} for check in checks):
            has_action = any(str(item.get("field", "")).startswith(prefix) for item in result.get("recommendations", []))
            if statuses.get(area) != "change_recommended" or not has_action:
                raise LiveServiceError(f"Live Reviewer left an unverified {vocabulary} candidate without an explicit human-review recommendation.")


def _client() -> OpenAI:
    if not os.getenv("OPENAI_API_KEY"):
        raise LiveServiceError("Live mode is unavailable because OPENAI_API_KEY is not configured.")
    return OpenAI()


def _structured_response(
    *,
    prompt: str,
    user_input: str,
    schema_name: str,
    schema: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    model = os.getenv("OPENAI_MODEL", DEFAULT_MODEL)
    effort = os.getenv("OPENAI_REASONING_EFFORT", DEFAULT_REASONING_EFFORT)
    try:
        response = _client().responses.create(
            model=model,
            reasoning={"effort": effort},
            instructions=prompt,
            input=user_input,
            text={
                "format": {
                    "type": "json_schema",
                    "name": schema_name,
                    "strict": True,
                    "schema": schema,
                }
            },
            store=False,
        )
        if not response.output_text:
            raise LiveServiceError("The live model returned no structured output.")
        parsed = json.loads(response.output_text)
        metadata = {
            "responseId": response.id,
            "model": response.model,
            "reasoningEffort": effort,
            "usage": response.usage.model_dump() if response.usage else None,
        }
        return parsed, metadata
    except LiveServiceError:
        raise
    except Exception as error:
        raise LiveServiceError(f"Live {schema_name} request failed: {type(error).__name__}.") from error


def create_draft(source_package: dict[str, Any], cataloging_profile: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    draft, metadata = _structured_response(
        prompt=CREATOR_PROMPT,
        user_input="\n\n".join([
            "CATALOGING POLICY PROFILE", json.dumps(cataloging_profile, ensure_ascii=False, indent=2),
            "RESOURCE SOURCE PACKAGE", json.dumps(source_package, ensure_ascii=False, indent=2),
        ]),
        schema_name="marc_creator_draft",
        schema=CREATOR_SCHEMA,
    )
    normalized = normalize_creator_draft(source_package, draft)
    created = datetime.now(timezone.utc)
    normalized["field005"] = created.strftime("%Y%m%d%H%M%S.0")
    normalized["dateEntered"] = created.strftime("%y%m%d")
    authority_checks = verify_draft_headings(normalized)
    normalized["subjectDetails"] = [
        {
            "value": check.get("candidate", ""),
            "status": check.get("status", "not_verified"),
            "subdivisionType": check.get("subdivisionType", ""),
            "subdivisionMarcCode": check.get("subdivisionMarcCode", ""),
            "constructionStatus": check.get("constructionStatus", ""),
        }
        for check in authority_checks if check.get("vocabulary") == "LCSH"
    ]
    geographic_codes = {"china": "a-cc---"}
    geographic_terms = []
    for check in authority_checks:
        if check.get("vocabulary") != "LCSH":
            continue
        for component in check.get("components") or []:
            if component.get("role") == "geographic_subdivision" and component.get("status") == "verified_form":
                geographic_terms.append(str(component.get("label") or "").strip().lower())
        if check.get("subdivisionMarcCode") == "z":
            parts = re.split(r"\s*(?:—|--)\s*", str(check.get("candidate") or ""))
            if len(parts) > 1:
                geographic_terms.append(parts[-1].strip().lower())
    normalized["geographicAreaCode"] = next((geographic_codes[term] for term in geographic_terms if term in geographic_codes), "")
    metadata["creatorAuthorityChecks"] = authority_checks
    return normalized, metadata


def review_draft(
    source_package: dict[str, Any],
    creator_draft: dict[str, Any],
    cataloging_profile: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, str]], list[dict[str, Any]]]:
    deterministic_findings = validate_draft(source_package, creator_draft)
    authority_checks = verify_draft_headings(creator_draft)
    user_input = "\n\n".join([
        "CATALOGING POLICY PROFILE",
        json.dumps(cataloging_profile, ensure_ascii=False, indent=2),
        "RESOURCE SOURCE PACKAGE",
        json.dumps(source_package, ensure_ascii=False, indent=2),
        "CREATOR DRAFT",
        json.dumps(creator_draft, ensure_ascii=False, indent=2),
        "DETERMINISTIC VALIDATION FINDINGS",
        json.dumps(deterministic_findings, ensure_ascii=False, indent=2),
        "LC VOCABULARY AUTHORITY CHECKS",
        json.dumps(authority_checks, ensure_ascii=False, indent=2),
    ])
    result, metadata = _structured_response(
        prompt=REVIEWER_PROMPT,
        user_input=user_input,
        schema_name="marc_reviewer_recommendations",
        schema=REVIEWER_SCHEMA,
    )
    # Independently verify any replacement heading proposed by the Reviewer;
    # the Reviewer cannot confer authority status on its own suggestion.
    for recommendation in result.get("recommendations", []):
        field = str(recommendation.get("field", ""))
        proposed = str(recommendation.get("proposedValue", "")).strip()
        if not proposed or recommendation.get("action") == "remove":
            continue
        proposal_check = None
        if field.startswith("subjects."):
            proposal_check = verify_lcsh_heading(proposed)
        elif field == "genre":
            proposal_check = verify_term(proposed, "LCGFT")
        if proposal_check:
            proposal_check["context"] = "reviewer_proposal"
            proposal_check["recommendationId"] = recommendation.get("id", "")
            authority_checks.append(proposal_check)
            verified = proposal_check.get("status") in {"verified_form", "verified_construction"}
            recommendation["verificationStatus"] = "verified" if verified else "not_verified"
            recommendation["verificationSource"] = proposal_check.get("authorityUri") or proposal_check.get("source", "")
    _validate_review_contract(result, authority_checks)
    return result, metadata, deterministic_findings, authority_checks
