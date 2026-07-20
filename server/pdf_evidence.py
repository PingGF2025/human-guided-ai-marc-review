"""Reviewable PDF evidence extraction with a deterministic Build Week fixture."""

import base64
import hashlib
import json
import os
from typing import Any

from openai import OpenAI

from .services import LiveServiceError


BUILD_WEEK_DEMO_PDF_SHA256 = "0c8c59262bf812990417f6d993f833cab15ec2493eb6b71de19cd06f6d545501"
MAX_PDF_BYTES = 25 * 1024 * 1024

SOURCE_FIELDS = ["title", "author", "format", "language", "publicationInformation", "isbn", "description", "additionalNotes", "contents"]

EVIDENCE_ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "field": {"type": "string", "enum": SOURCE_FIELDS},
        "label": {"type": "string"},
        "value": {"type": "string"},
        "pageNumber": {"type": "integer", "minimum": 1},
        "pageLabel": {"type": "string"},
        "evidenceExcerpt": {"type": "string"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "extractionNote": {"type": "string"},
    },
    "required": ["field", "label", "value", "pageNumber", "pageLabel", "evidenceExcerpt", "confidence", "extractionNote"],
    "additionalProperties": False,
}

PDF_EVIDENCE_SCHEMA = {
    "type": "object",
    "properties": {
        "pageCount": {"type": "integer", "minimum": 1},
        "sourcePackage": {
            "type": "object",
            "properties": {field: {"type": "string"} for field in SOURCE_FIELDS},
            "required": SOURCE_FIELDS,
            "additionalProperties": False,
        },
        "evidence": {"type": "array", "items": EVIDENCE_ITEM_SCHEMA, "minItems": 1},
        "warnings": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["pageCount", "sourcePackage", "evidence", "warnings"],
    "additionalProperties": False,
}

PDF_EVIDENCE_PROMPT = """You extract conservative, reviewable bibliographic evidence from a human-supplied PDF.

Return only facts visibly supported by the PDF. Do not invent headings, classifications, identifiers, dates, roles, or publication facts. Preserve contributor roles. A description may transcribe or closely condense publisher-supplied summary evidence, but must not claim unsupported facts. Put a visible table of contents in `contents`, preserving wording and order; do not hide or condense it into Additional notes. Additional notes may summarize bibliography, index, illustrations, or other evidence useful for subject analysis.

For every non-empty Source Package field, return at least one evidence item with the PDF page number, a concise visible excerpt, and calibrated confidence. Leave unsupported Source Package values as empty strings and add a warning. Page numbers refer to PDF pages, beginning with 1. This extraction is candidate evidence only and requires human verification."""


def _item(field: str, label: str, value: str, page: int, excerpt: str, note: str, confidence: str = "high") -> dict[str, Any]:
    return {
        "field": field, "label": label, "value": value, "pageNumber": page,
        "pageLabel": f"PDF p. {page}", "evidenceExcerpt": excerpt,
        "confidence": confidence, "extractionNote": note,
    }


def _build_week_demo_fixture() -> dict[str, Any]:
    title = "Signals Under Pressure : Cyber Attacks, Information Control, and Digital Resilience in Contemporary China"
    author = "Elena Park"
    publication = "Boston : Meridian Research Press, 2026"
    description = ("Examines politically motivated cyber attacks against information infrastructure in China, "
                   "government control of Internet access and online expression, and policies for digital resilience.")
    notes = ("Extent: xii, 248 pages : illustrations ; 24 cm. Case studies address Internet censorship, platform regulation, public communication during network "
             "disruptions, national security policy, and accountable technology governance. Includes bibliographical references and index.")
    contents = ("Introduction: Describing digital threats with care -- 1. Information infrastructure and politically motivated cyber attacks -- "
                "2. Internet censorship and platform regulation in China -- 3. Public communication during network disruption -- "
                "4. National security policy and digital resilience -- 5. Comparative approaches to accountable technology governance")
    return {
        "pageCount": 3,
        "sourcePackage": {
            "title": title, "author": author, "format": "Print book", "language": "English",
            "publicationInformation": publication, "isbn": "9781234567897",
            "description": description, "additionalNotes": notes, "contents": contents,
        },
        "evidence": [
            _item("title", "Title", title, 1, "Signals Under Pressure / Cyber attacks, information control, and digital resilience in contemporary China", "Transcribed from the fictional title page."),
            _item("author", "Creator", author, 1, "Elena Park", "Transcribed from the fictional title page."),
            _item("format", "Format", "Print book", 2, "Format | Print book", "Transcribed from publication information."),
            _item("language", "Language", "English", 2, "About this book", "Identified from the visible English-language text."),
            _item("publicationInformation", "Publication information", publication, 2, "Publisher: Meridian Research Press / Place and date: Boston, 2026", "Combined from the visible publication table."),
            _item("isbn", "Fictional demonstration ISBN", "9781234567897", 2, "Fictional demonstration ISBN | 978-1-23456-789-7", "Transcribed from the fictional publication table."),
            _item("description", "Summary evidence", description, 2, "politically motivated cyber attacks against information infrastructure in China", "Conservative condensation of the original fictional summary.", "medium"),
            _item("additionalNotes", "Physical description and apparatus", notes, 2, "Extent: xii, 248 pages : illustrations ; 24 cm ... Includes bibliographical references and index", "Combined from the publication table and apparatus statement.", "medium"),
            _item("contents", "Table of contents", contents, 3, "Introduction: Describing digital threats with care ... 5. Comparative approaches to accountable technology governance", "Transcribed in visible order from the fictional contents page."),
        ],
        "warnings": ["This is an original fictional Build Week demonstration source; its checksum-valid ISBN is fictional and not publisher-assigned."],
    }


def extract_pdf_evidence(pdf_bytes: bytes, filename: str) -> tuple[dict[str, Any], dict[str, Any]]:
    if not pdf_bytes.startswith(b"%PDF-"):
        raise LiveServiceError("The uploaded file is not a valid PDF.")
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise LiveServiceError("PDF exceeds the 25 MB Build Week limit.")
    digest = hashlib.sha256(pdf_bytes).hexdigest()
    if digest == BUILD_WEEK_DEMO_PDF_SHA256:
        return _build_week_demo_fixture(), {"provider": "Original fictional Build Week PDF fixture", "offlineFixtureUsed": True, "fileSha256": digest}
    if not os.getenv("OPENAI_API_KEY"):
        raise LiveServiceError("Live PDF extraction requires OPENAI_API_KEY. The curated PDF fixture remains available offline.")
    encoded = base64.b64encode(pdf_bytes).decode("ascii")
    model = os.getenv("OPENAI_MODEL", "gpt-5.6-sol")
    effort = os.getenv("OPENAI_REASONING_EFFORT", "low")
    try:
        # PDF requests are larger and slower than the Creator/Reviewer JSON
        # calls. Give transient transport failures one additional retry and a
        # clear request timeout; this never substitutes fixture data.
        response = OpenAI(max_retries=3, timeout=300.0).responses.create(
            model=model,
            reasoning={"effort": effort},
            instructions=PDF_EVIDENCE_PROMPT,
            input=[{"role": "user", "content": [
                {"type": "input_file", "filename": filename, "file_data": f"data:application/pdf;base64,{encoded}"},
                {"type": "input_text", "text": "Extract the visible bibliographic evidence into the required Source Package and cite PDF pages."},
            ]}],
            text={"format": {"type": "json_schema", "name": "pdf_source_evidence", "strict": True, "schema": PDF_EVIDENCE_SCHEMA}},
            store=False,
        )
        if not response.output_text:
            raise LiveServiceError("The PDF extractor returned no structured output.")
        result = json.loads(response.output_text)
        return result, {
            "provider": "OpenAI document extraction", "offlineFixtureUsed": False,
            "fileSha256": digest, "responseId": response.id, "model": response.model,
            "reasoningEffort": effort, "usage": response.usage.model_dump() if response.usage else None,
        }
    except LiveServiceError:
        raise
    except Exception as error:
        if type(error).__name__ == "APIConnectionError":
            raise LiveServiceError(
                "Live PDF extraction could not reach the OpenAI API after retries. "
                "The PDF was not rejected and no fixture data was substituted; check the connection and try again."
            ) from error
        raise LiveServiceError(f"Live PDF extraction failed: {type(error).__name__}.") from error
