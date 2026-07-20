"""Local API server for live Creator and Reviewer calls."""

import os
import json
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, make_response, request
from dotenv import load_dotenv

from server.services import LiveServiceError, create_draft, review_draft
from server.pdf_evidence import extract_pdf_evidence


load_dotenv()
app = Flask(__name__, static_folder=".", static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024
CATALOGING_PROFILE = json.loads((Path(__file__).parent / "cataloging-profile.json").read_text(encoding="utf-8"))


def _profile_matches(profile):
    return isinstance(profile, dict) and profile == CATALOGING_PROFILE


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


@app.get("/")
def index():
    return app.send_static_file("index.html")


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


@app.post("/api/source/pdf")
def pdf_source():
    upload = request.files.get("pdf")
    if not upload or not upload.filename:
        return jsonify({"error": "Choose one PDF file to extract."}), 400
    if upload.mimetype != "application/pdf" and not upload.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Only PDF source evidence is supported in this milestone."}), 415
    try:
        pdf_bytes = upload.read()
        result, metadata = extract_pdf_evidence(pdf_bytes, upload.filename)
        source_package = result["sourcePackage"]
        field_provenance = {}
        for field, value in source_package.items():
            if value:
                pages = sorted({item["pageNumber"] for item in result["evidence"] if item["field"] == field})
                field_provenance[field] = {
                    "label": " / ".join(f"PDF p. {page}" for page in pages) or "PDF evidence",
                    "classification": "human_supplied_extracted", "provider": metadata["provider"],
                }
        retrieval = {
            "inputType": "pdf", "provider": metadata["provider"],
            "metadataClassification": "human_supplied_extracted", "authoritative": False,
            "sourceUrl": None, "retrievedAt": datetime.now(timezone.utc).isoformat(), "offlineFixtureUsed": metadata["offlineFixtureUsed"],
            "fileName": upload.filename, "fileSize": len(pdf_bytes),
            "fileSha256": metadata["fileSha256"], "pageCount": result["pageCount"],
            "fieldProvenance": field_provenance, "evidence": result["evidence"],
            "warnings": result["warnings"], "extractionMetadata": {key: value for key, value in metadata.items() if key not in {"fileSha256", "offlineFixtureUsed", "provider"}},
        }
        return jsonify({"sourcePackage": source_package, "retrieval": retrieval})
    except LiveServiceError as error:
        return jsonify({"error": str(error)}), 502


@app.route("/api/creator", methods=["POST", "OPTIONS"])
def creator():
    if request.method == "OPTIONS":
        return make_response("", 204)
    source = (request.get_json(silent=True) or {}).get("sourcePackage")
    profile = (request.get_json(silent=True) or {}).get("catalogingProfile")
    if not isinstance(source, dict) or not any(str(value).strip() for value in source.values()) or not _profile_matches(profile):
        return jsonify({"error": "Resource Source Package and the active Cataloging Policy Profile are required."}), 400
    try:
        draft, metadata = create_draft(source, CATALOGING_PROFILE)
        return jsonify({"draft": draft, "metadata": metadata})
    except LiveServiceError as error:
        return jsonify({"error": str(error)}), 502


@app.route("/api/reviewer", methods=["POST", "OPTIONS"])
def reviewer():
    if request.method == "OPTIONS":
        return make_response("", 204)
    data = request.get_json(silent=True) or {}
    source = data.get("sourcePackage")
    draft = data.get("draft")
    profile = data.get("catalogingProfile")
    if not isinstance(source, dict) or not isinstance(draft, dict) or not _profile_matches(profile):
        return jsonify({"error": "Resource Source Package, Creator draft, and the active Cataloging Policy Profile are required."}), 400
    try:
        result, metadata, deterministic_findings, authority_checks = review_draft(source, draft, CATALOGING_PROFILE)
        return jsonify({
            "recommendations": result["recommendations"],
            "reviewCoverage": result["reviewCoverage"],
            "deterministicFindings": deterministic_findings,
            "authorityChecks": authority_checks,
            "metadata": metadata,
        })
    except LiveServiceError as error:
        return jsonify({"error": str(error)}), 502


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "8000")), debug=False)
