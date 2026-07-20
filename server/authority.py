"""Transparent LC vocabulary lookups for Creator subject proposals.

An authority match verifies the vocabulary form only.  It does not establish
that the heading is appropriately applied to the resource being cataloged.
"""

from datetime import datetime, timezone
import json
import re
from typing import Any, Callable
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree


VOCABULARIES = {
    "LCSH": "subjects",
    "LCGFT": "genreForms",
    "LCNAF": "names",
}
DEFAULT_TIMEOUT = 8
CURATED_AUTHORITY_SNAPSHOT = {
    ("LCGFT", "novels"): {
        "authorizedLabel": "Novels",
        "source": "LCGFT December 2025 curated snapshot",
        "sourceUrl": "https://www.loc.gov/aba/publications/FreeLCGFT/GENRE-FORM.pdf",
        "snapshotDate": "2025-12",
    },
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _search_term(value: str) -> str:
    """Use LC's double-hyphen display convention for a complete heading."""
    return re.sub(r"\s*(?:--|—)\s*", "--", str(value or "").strip())


def _comparable_label(value: str) -> str:
    return _search_term(value).casefold()


def _fetch_json(url: str, timeout: int = DEFAULT_TIMEOUT) -> Any:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "OpenAI-Build-Week-Cataloging-Demo/1.0"})
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _fetch_text(url: str, timeout: int = DEFAULT_TIMEOUT) -> str:
    request = Request(url, headers={"Accept": "application/marcxml+xml, application/xml", "User-Agent": "OpenAI-Build-Week-Cataloging-Demo/1.0"})
    with urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8")


def _marcxml_url(authority_uri: str) -> str:
    return re.sub(r"^http:", "https:", authority_uri.rstrip("/")) + ".marcxml.xml"


def parse_authority_marcxml(xml_text: str) -> dict[str, str]:
    """Extract only the coded facts needed for transparent construction review."""
    root = ElementTree.fromstring(xml_text)
    control_008 = next((node.text or "" for node in root.iter() if node.tag.endswith("controlfield") and node.attrib.get("tag") == "008"), "")
    heading_field = next((node for node in root.iter() if node.tag.endswith("datafield") and node.attrib.get("tag") in {"100", "110", "111", "130", "150", "151", "155", "180", "181", "182", "185"}), None)
    heading_tag = heading_field.attrib.get("tag", "") if heading_field is not None else ""
    heading_parts = [] if heading_field is None else [node.text or "" for node in heading_field if node.tag.endswith("subfield") and node.attrib.get("code") in {"a", "x", "y", "z", "v"}]
    return {
        "headingTag": heading_tag,
        "heading": "--".join(part.strip() for part in heading_parts if part.strip()),
        "geographicSubdivisionCode": control_008[6] if len(control_008) > 6 else "",
        "subjectUseCode": control_008[15] if len(control_008) > 15 else "",
        "kindOfRecordCode": control_008[9] if len(control_008) > 9 else "",
        "subdivisionTypeCode": control_008[17] if len(control_008) > 17 else "",
        "control008": control_008,
    }


def _suggestions(payload: Any) -> list[dict[str, str]]:
    # id.loc.gov's stable suggest response is [query, labels, unused, uris].
    if isinstance(payload, list) and len(payload) >= 4:
        labels = payload[1] if isinstance(payload[1], list) else []
        uris = payload[3] if isinstance(payload[3], list) else []
        return [{"label": str(label), "uri": str(uris[index]) if index < len(uris) else ""}
                for index, label in enumerate(labels)]
    # Tolerate the newer object representation if returned by the service.
    if isinstance(payload, dict):
        hits = payload.get("hits") or payload.get("suggestions") or []
        return [{"label": str(hit.get("aLabel") or hit.get("label") or ""),
                 "uri": str(hit.get("uri") or hit.get("id") or "")}
                for hit in hits if isinstance(hit, dict)]
    return []


def _exact_matches(term: str, vocabulary: str, fetch_json: Callable[[str], Any]) -> list[dict[str, str]]:
    search_term = _search_term(term)
    endpoint = f"https://id.loc.gov/authorities/{VOCABULARIES[vocabulary]}/suggest/?{urlencode({'q': search_term, 'count': 20})}"
    return [item for item in _suggestions(fetch_json(endpoint)) if _comparable_label(item["label"]) == _comparable_label(search_term)]


def _normalized_words(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value).casefold())


def _variant_resolution(term: str, fetch_json: Callable[[str], Any]) -> dict[str, Any] | None:
    """Resolve an LCSH 4XX variant through suggest2 without treating it as authorized."""
    queries = [str(term).strip()]
    compact = _normalized_words(term)
    if " " not in str(term).strip() and len(compact) >= 8:
        queries.append(str(term).strip()[:5])
    for query in queries:
        endpoint = f"https://id.loc.gov/authorities/subjects/suggest2/?{urlencode({'q': query, 'count': 100})}"
        payload = fetch_json(endpoint)
        for hit in payload.get("hits", []) if isinstance(payload, dict) else []:
            variants = [hit.get("vLabel", ""), *(hit.get("more", {}).get("variantLabels", []) or [])]
            matched = next((label for label in variants if _normalized_words(label) == compact), "")
            if matched and hit.get("aLabel") and hit.get("uri"):
                return {
                    "searchedVariant": str(term).strip(), "matchedVariant": matched,
                    "authorizedLabel": hit["aLabel"], "authorityUri": hit["uri"],
                    "lookupUrl": endpoint, "scopeNotes": hit.get("more", {}).get("notes", []) or [],
                    "variantLabels": hit.get("more", {}).get("variantLabels", []) or [],
                }
    return None


def verify_term(term: str, vocabulary: str, fetch_json: Callable[[str], Any] = _fetch_json) -> dict[str, Any]:
    if vocabulary not in VOCABULARIES:
        raise ValueError(f"Unsupported vocabulary: {vocabulary}")
    candidate = str(term or "").strip()
    search_term = _search_term(candidate)
    endpoint = f"https://id.loc.gov/authorities/{VOCABULARIES[vocabulary]}/suggest/?{urlencode({'q': search_term, 'count': 10})}"
    checked_at = _now()
    try:
        choices = _suggestions(fetch_json(endpoint))
        exact = next((item for item in choices if _comparable_label(item["label"]) == _comparable_label(search_term)), None)
        return {
            "candidate": candidate, "searchedTerm": search_term, "vocabulary": vocabulary,
            "status": "verified_form" if exact else "not_verified",
            "authorizedLabel": exact["label"] if exact else "",
            "authorityUri": exact["uri"] if exact else "",
            "lookupUrl": endpoint, "checkedAt": checked_at, "source": "LC Linked Data Service",
            "applicationStatus": "review_required",
            "note": "Authority form verified; application to this resource still requires Reviewer and human judgment."
                    if exact else "No exact authorized-label match was returned; do not encode this candidate as verified.",
        }
    except Exception as error:
        snapshot = CURATED_AUTHORITY_SNAPSHOT.get((vocabulary, search_term.casefold()))
        if snapshot:
            return {
                "candidate": candidate, "searchedTerm": search_term, "vocabulary": vocabulary,
                "status": "verified_form", "authorizedLabel": snapshot["authorizedLabel"],
                "authorityUri": "", "lookupUrl": snapshot["sourceUrl"],
                "checkedAt": checked_at, "source": snapshot["source"], "offlineSnapshotUsed": True,
                "applicationStatus": "review_required",
                "note": f"Live LC lookup was unavailable ({type(error).__name__}); authorized form confirmed by the visibly labeled {snapshot['snapshotDate']} curated snapshot. Application still requires judgment.",
            }
        return {
            "candidate": candidate, "searchedTerm": search_term, "vocabulary": vocabulary,
            "status": "lookup_unavailable", "authorizedLabel": "", "authorityUri": "",
            "lookupUrl": endpoint, "checkedAt": checked_at, "source": "LC Linked Data Service",
            "applicationStatus": "review_required", "offlineSnapshotUsed": False,
            "note": f"LC lookup unavailable ({type(error).__name__}); the candidate remains unverified.",
        }


def verify_lcsh_heading(
    heading: str,
    fetch_json: Callable[[str], Any] = _fetch_json,
    fetch_text: Callable[[str], str] = _fetch_text,
) -> dict[str, Any]:
    """Verify a complete heading or one authorized subdivision component."""
    complete = verify_term(heading, "LCSH", fetch_json)
    complete["components"] = []
    complete["constructionStatus"] = "established_complete_heading" if complete["status"] == "verified_form" else "not_assessed"
    parts = [part.strip() for part in _search_term(heading).split("--") if part.strip()]
    complete_form_verified = complete["status"] == "verified_form"
    if len(parts) != 2:
        return complete
    if complete["status"] == "lookup_unavailable":
        complete["note"] += " Component construction review could not run."
        return complete

    try:
        main_label, subdivision_label = parts
        main_candidates = _exact_matches(main_label, "LCSH", fetch_json)
        subdivision_candidates = _exact_matches(subdivision_label, "LCSH", fetch_json)

        def inspect(candidates):
            results = []
            for candidate_item in candidates:
                if not candidate_item["uri"]:
                    continue
                record_url = _marcxml_url(candidate_item["uri"])
                record = parse_authority_marcxml(fetch_text(record_url))
                results.append((candidate_item, record_url, record))
            return results

        main_records = inspect(main_candidates)
        main_match = next((item for item in main_records if item[2]["headingTag"] in {"100", "110", "111", "130", "150", "151"} and item[2]["subjectUseCode"] == "a"), None)
        main_variant = None
        if not main_match:
            main_variant = _variant_resolution(main_label, fetch_json)
            if main_variant:
                variant_record_url = _marcxml_url(main_variant["authorityUri"])
                variant_record = parse_authority_marcxml(fetch_text(variant_record_url))
                if variant_record["headingTag"] in {"100", "110", "111", "130", "150", "151"} and variant_record["subjectUseCode"] == "a":
                    main_match = ({"label": main_variant["authorizedLabel"], "uri": main_variant["authorityUri"]}, variant_record_url, variant_record)
        subdivision_records = inspect(subdivision_candidates)
        subdivision_match = next((item for item in subdivision_records if item[2]["headingTag"] in {"180", "181", "182", "185"}), None)

        # Classify the terminal component independently. A failed main-heading
        # lookup must never turn a known geographic name such as China into $x.
        place_match = None
        if not subdivision_match:
            place_records = inspect(_exact_matches(subdivision_label, "LCNAF", fetch_json))
            place_match = next((item for item in place_records if item[2]["headingTag"] == "151"), None)

        if not main_match:
            terminal = subdivision_match or place_match
            if terminal:
                terminal_choice, terminal_record_url, terminal_record = terminal
                terminal_tag = terminal_record["headingTag"]
                terminal_code = {"180": "x", "181": "z", "182": "y", "185": "v", "151": "z"}[terminal_tag]
                terminal_type = {"180": "topical", "181": "geographic", "182": "chronological", "185": "form", "151": "geographic"}[terminal_tag]
                complete.update({
                    "status": "verified_form" if complete_form_verified else "not_verified",
                    "constructionStatus": "main_heading_not_verified",
                    "subdivisionType": terminal_type,
                    "subdivisionMarcCode": terminal_code,
                    "components": [
                        {"role": "main_heading", "label": main_label, "status": "not_verified", "authorityUri": ""},
                        {"role": f"{terminal_type}_subdivision", "label": terminal_choice["label"], "status": "verified_form", "authorityUri": terminal_choice["uri"], "recordUrl": terminal_record_url, "headingTag": terminal_tag, "marcCode": terminal_code},
                    ],
                    "note": f"The terminal component is authorized as a {terminal_type} subdivision (${terminal_code}), but the main heading is not verified. The construction requires replacement or human review.",
                })
                return complete
            raise ValueError("No subject-appropriate main-heading authority was returned")
        main_choice, main_record_url, main_record = main_match
        geo_code = main_record["geographicSubdivisionCode"]
        subject_use = main_record["subjectUseCode"]

        subdivision_codes = {"180": "x", "181": "z", "182": "y", "185": "v"}
        subdivision_names = {"180": "topical", "181": "geographic", "182": "chronological", "185": "form"}
        if subdivision_match:
            subdivision_choice, subdivision_record_url, subdivision_record = subdivision_match
            subdivision_tag = subdivision_record["headingTag"]
            marc_code = subdivision_codes[subdivision_tag]
            subdivision_type = subdivision_names[subdivision_tag]
            geographic_permitted = marc_code != "z" or geo_code in {"d", "i"}
            verified = subject_use == "a" and geographic_permitted
            complete.update({
                "status": "variant_resolved" if main_variant and verified else "verified_construction" if verified else "verified_form" if complete_form_verified else "not_verified",
                "authorizedLabel": f"{main_choice['label']}--{subdivision_choice['label']}" if verified else complete.get("authorizedLabel", ""),
                "suggestedAuthorizedReplacement": f"{main_choice['label']}--{subdivision_choice['label']}" if main_variant and verified else "",
                "variantEvidence": main_variant,
                "authorityUri": main_choice["uri"],
                "constructionStatus": f"verified_{subdivision_type}_subdivision" if verified else "subdivision_not_permitted",
                "subdivisionType": subdivision_type,
                "subdivisionMarcCode": marc_code,
                "geographicSubdivisionCode": geo_code if marc_code == "z" else "",
                "geographicSubdivisionMethod": ({"d": "direct", "i": "indirect"}.get(geo_code, "not permitted") if marc_code == "z" else "not applicable"),
                "subjectUseCode": subject_use,
                "components": [
                    {"role": "main_heading", "label": main_choice["label"], "status": "verified_form", "authorityUri": main_choice["uri"], "recordUrl": main_record_url, "headingTag": main_record["headingTag"]},
                    {"role": f"{subdivision_type}_subdivision", "label": subdivision_choice["label"], "status": "verified_form", "authorityUri": subdivision_choice["uri"], "recordUrl": subdivision_record_url, "headingTag": subdivision_tag, "marcCode": marc_code},
                ],
                "note": (f"The proposed main term is a variant reference to {main_choice['label']}; the authorized constructed replacement is {main_choice['label']}--{subdivision_choice['label']}. Application still requires Reviewer and human judgment."
                         if main_variant and verified else f"Main heading and {subdivision_type} subdivision are authorized; encode the subdivision in ${marc_code}. Application still requires Reviewer and human judgment."
                         if verified else f"The subdivision authority was found, but this construction is not permitted by the retrieved authority data."),
            })
            return complete

        # No 18X subdivision record was found. Only now test whether the
        # terminal component is an LCNAF geographic name for use in $z.
        if not place_match:
            raise ValueError("No authorized subdivision or geographic-name authority was returned")
        place_choice, place_record_url, place_record = place_match
        verified = subject_use == "a" and geo_code in {"d", "i"}
        final_status = "variant_resolved" if main_variant and verified else "verified_construction" if verified else "verified_form" if complete_form_verified else "not_verified"
        construction_status = ("verified_geographic_construction" if verified else
                               "established_complete_heading_component_ambiguous" if complete_form_verified else
                               "construction_not_permitted")
        complete.update({
            "status": final_status,
            "authorizedLabel": f"{main_choice['label']}--{place_choice['label']}" if verified else complete.get("authorizedLabel", ""),
            "suggestedAuthorizedReplacement": f"{main_choice['label']}--{place_choice['label']}" if main_variant and verified else "",
            "variantEvidence": main_variant,
            "authorityUri": main_choice["uri"],
            "constructionStatus": construction_status,
            "geographicSubdivisionCode": geo_code,
            "geographicSubdivisionMethod": {"d": "direct", "i": "indirect", "#": "not permitted", "n": "not applicable", "|": "not coded"}.get(geo_code, "unknown"),
            "subjectUseCode": subject_use,
            "subdivisionType": "geographic",
            "subdivisionMarcCode": "z",
            "components": [
                {"role": "main_heading", "label": main_choice["label"], "status": "verified_form" if main_record["headingTag"] in {"100", "110", "111", "130", "150", "151"} and subject_use == "a" else "wrong_authority_type", "authorityUri": main_choice["uri"], "recordUrl": main_record_url, "headingTag": main_record["headingTag"]},
                {"role": "geographic_subdivision", "label": place_choice["label"], "status": "verified_form", "authorityUri": place_choice["uri"], "recordUrl": place_record_url, "headingTag": place_record["headingTag"], "marcCode": "z"},
            ],
            "note": (
                f"The proposed main term is a 450 variant of {main_choice['label']}; authority 008/06={geo_code} permits the geographic construction. Recommend {main_choice['label']}--{place_choice['label']} if supported by the resource."
                if main_variant and verified else
                f"Main heading and geographic term are authorized; authority 008/06={geo_code} permits {complete_method(geo_code)} geographic subdivision. Application still requires Reviewer and human judgment."
                if verified else
                (f"The complete heading is established, but the main-label lookup returned an ambiguous authority type ({main_record['headingTag'] or 'missing'}); component construction remains for human review."
                 if complete_form_verified else f"Construction not verified: main authority 008/06={geo_code or 'missing'}, 008/15={subject_use or 'missing'}, geographic heading tag={place_record['headingTag'] or 'missing'}.")
            ),
        })
        return complete
    except Exception as error:
        complete["status"] = "verified_form" if complete_form_verified else "lookup_unavailable"
        complete["constructionStatus"] = "established_complete_heading" if complete_form_verified else "authority_record_unavailable"
        complete["note"] = (f"The complete heading is established, but component MARC authority records could not be retrieved ({type(error).__name__})."
                            if complete_form_verified else f"Authorized components were found, but their MARC authority records could not be retrieved ({type(error).__name__}); construction remains unverified.")
        return complete


def complete_method(code: str) -> str:
    return "direct" if code == "d" else "indirect" if code == "i" else "no"


def verify_draft_headings(
    draft: dict[str, Any],
    fetch_json: Callable[[str], Any] = _fetch_json,
    fetch_text: Callable[[str], str] = _fetch_text,
) -> list[dict[str, Any]]:
    checks = [verify_lcsh_heading(term, fetch_json, fetch_text) for term in (draft.get("subjects") or []) if str(term).strip()]
    if str(draft.get("genre") or "").strip():
        checks.append(verify_term(str(draft["genre"]), "LCGFT", fetch_json))
    return checks
