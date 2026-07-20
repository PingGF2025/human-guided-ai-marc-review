"""Strict Structured Outputs schemas shared by the live services."""

CREATOR_SCHEMA = {
    "type": "object",
    "properties": {
        "isbn": {"type": "string"}, "author": {"type": "string"}, "title": {"type": "string"},
        "publication": {"type": "string"}, "extent": {"type": "string"},
        "contentType": {"type": "string"}, "mediaType": {"type": "string"},
        "carrierType": {"type": "string"}, "summary": {"type": "string"},
        "creatorRelationship": {"type": "string"},
        "classificationNumber": {"type": "string"},
        "classificationRationale": {"type": "string"},
        "contentsNote": {"type": "string"},
        "bibliographyNote": {"type": "string"},
        "subjects": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
        "genre": {"type": "string"},
        "statementOfResponsibility": {"type": "string"},
        "contributors": {
            "type": "array", "maxItems": 6,
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "statementName": {"type": "string"},
                    "relationship": {"type": "string"},
                },
                "required": ["name", "statementName", "relationship"],
                "additionalProperties": False,
            },
        },
        "corporateContributors": {
            "type": "array", "maxItems": 6,
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "statementName": {"type": "string"},
                    "relationship": {"type": "string"},
                },
                "required": ["name", "statementName", "relationship"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["isbn", "author", "creatorRelationship", "title", "publication", "extent", "contentType", "mediaType", "carrierType", "summary", "classificationNumber", "classificationRationale", "contentsNote", "bibliographyNote", "subjects", "genre", "statementOfResponsibility", "contributors", "corporateContributors"],
    "additionalProperties": False,
}

SOURCE_ELEMENTS = [
    "Title", "Author/Creator", "Format", "Language", "Publication information", "ISBN metadata",
    "Resource description", "Additional source notes", "Contents", "Deterministic validation"
]

TARGET_FIELDS = [
    "isbn", "author", "title", "publication", "extent", "contentType", "mediaType",
    "carrierType", "summary", "classificationNumber", "geographicAreaCode", "bibliographyNote", "contentsNote", "subjects.0", "subjects.1", "subjects.2", "genre"
]

RECOMMENDATION_SCHEMA = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "action": {"type": "string", "enum": ["add", "replace", "remove"]},
        "field": {"type": "string", "enum": TARGET_FIELDS},
        "fieldLabel": {"type": "string"}, "currentValue": {"type": "string"},
        "proposedValue": {"type": "string"}, "explanation": {"type": "string"},
        "evidence": {"type": "string"}, "evidenceSource": {"type": "string", "enum": SOURCE_ELEMENTS},
        "evidenceLocation": {"type": "string"},
        "standardBasis": {"type": "string"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "verificationStatus": {"type": "string", "enum": ["verified", "not_verified", "conflict", "not_applicable"]},
        "verificationSource": {"type": "string"},
    },
    "required": ["id", "action", "field", "fieldLabel", "currentValue", "proposedValue", "explanation", "evidence", "evidenceSource", "evidenceLocation", "standardBasis", "confidence", "verificationStatus", "verificationSource"],
    "additionalProperties": False,
}

COVERAGE_SCHEMA = {
    "type": "object",
    "properties": {
        "field": {"type": "string", "enum": ["020", "050", "043", "100", "245", "264", "300", "336/337/338", "504/505", "520", "650", "655"]},
        "label": {"type": "string"},
        "status": {"type": "string", "enum": ["no_change", "change_recommended", "missing_field", "needs_verification", "not_assessable"]},
        "assessment": {"type": "string"},
        "evidenceSupport": {"type": "string"},
        "standardBasis": {"type": "string"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "verificationStatus": {"type": "string", "enum": ["verified", "not_verified", "conflict", "not_applicable"]},
        "verificationSource": {"type": "string"},
    },
    "required": ["field", "label", "status", "assessment", "evidenceSupport", "standardBasis", "confidence", "verificationStatus", "verificationSource"],
    "additionalProperties": False,
}

REVIEWER_SCHEMA = {
    "type": "object",
    "properties": {
        "recommendations": {"type": "array", "items": RECOMMENDATION_SCHEMA, "maxItems": 12},
        "reviewCoverage": {"type": "array", "items": COVERAGE_SCHEMA, "minItems": 12, "maxItems": 12},
    },
    "required": ["recommendations", "reviewCoverage"],
    "additionalProperties": False,
}
