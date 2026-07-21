import unittest
import json
from io import BytesIO
from pathlib import Path

from server.prompts import CREATOR_PROMPT, REVIEWER_PROMPT
from server.schemas import CREATOR_SCHEMA, REVIEWER_SCHEMA
from server.services import LiveServiceError, _validate_review_contract, normalize_creator_draft
from server.validators import validate_draft
from api_server import CATALOGING_PROFILE, _profile_matches, app
from server.pdf_evidence import BUILD_WEEK_DEMO_PDF_SHA256, PDF_EVIDENCE_SCHEMA
from server.authority import parse_authority_marcxml, verify_draft_headings, verify_lcsh_heading, verify_term


class BackendContractTests(unittest.TestCase):
    def test_lc_authority_match_verifies_form_but_not_application(self):
        payload = ["artificial intelligence", ["Artificial intelligence"], [""], ["http://id.loc.gov/authorities/subjects/sh85008180"]]
        result = verify_term("Artificial intelligence", "LCSH", lambda _url: payload)
        self.assertEqual(result["status"], "verified_form")
        self.assertEqual(result["authorizedLabel"], "Artificial intelligence")
        self.assertEqual(result["applicationStatus"], "review_required")

    def test_unmatched_and_unavailable_authorities_never_become_verified(self):
        unmatched = verify_term("Invented heading", "LCSH", lambda _url: ["", ["Different heading"], [""], ["uri"]])
        unavailable = verify_term("Invented genre", "LCGFT", lambda _url: (_ for _ in ()).throw(TimeoutError()))
        self.assertEqual(unmatched["status"], "not_verified")
        self.assertEqual(unavailable["status"], "lookup_unavailable")

    def test_draft_authority_checks_keep_lcsh_and_lcgft_separate(self):
        responses = {
            "subjects": ["", ["Memory"], [""], ["http://id.loc.gov/authorities/subjects/example"]],
            "genreForms": ["", ["Novels"], [""], ["http://id.loc.gov/authorities/genreForms/example"]],
        }
        checks = verify_draft_headings(
            {"subjects": ["Memory—Fiction"], "genre": "Novels"},
            lambda url: responses["genreForms" if "genreForms" in url else "subjects"],
        )
        self.assertEqual([(item["vocabulary"], item["searchedTerm"]) for item in checks], [("LCSH", "Memory--Fiction"), ("LCGFT", "Novels")])
        self.assertTrue(all(item["applicationStatus"] == "review_required" for item in checks))

    def test_curated_snapshot_is_narrow_and_visibly_labeled(self):
        result = verify_term("Novels", "LCGFT", lambda _url: (_ for _ in ()).throw(TimeoutError()))
        self.assertEqual(result["status"], "verified_form")
        self.assertTrue(result["offlineSnapshotUsed"])
        self.assertIn("curated snapshot", result["source"])

    def test_geographic_construction_reads_008_permissions_and_component_types(self):
        def suggestions(url):
            if "q=Art%2D%2DChina" in url:
                return ["", [], [], []]
            if "q=Art" in url:
                return ["", ["Art"], [""], ["http://id.loc.gov/authorities/subjects/main"]]
            return ["", ["China"], [""], ["http://id.loc.gov/authorities/subjects/place"]]

        def record(tag, label, geo_code="#", subject_use="a"):
            fixed = list("#" * 40)
            fixed[6] = geo_code
            fixed[15] = subject_use
            return f'<record xmlns="http://www.loc.gov/MARC21/slim"><controlfield tag="008">{"".join(fixed)}</controlfield><datafield tag="{tag}" ind1=" " ind2=" "><subfield code="a">{label}</subfield></datafield></record>'

        result = verify_lcsh_heading(
            "Art—China", suggestions,
            lambda url: record("151", "China") if "place.marcxml" in url else record("150", "Art", "i"),
        )
        self.assertEqual(result["status"], "verified_construction")
        self.assertEqual(result["geographicSubdivisionCode"], "i")
        self.assertEqual(result["subjectUseCode"], "a")
        self.assertEqual(result["components"][1]["headingTag"], "151")

    def test_geographic_construction_is_refused_when_008_disallows_it(self):
        def suggestions(url):
            if "%2D%2D" in url:
                return ["", [], [], []]
            label = "China" if "China" in url else "Boolean rings"
            return ["", [label], [""], [f"http://id.loc.gov/authorities/subjects/{'place' if label == 'China' else 'main'}"]]

        fixed_main = list("#" * 40)
        fixed_main[6], fixed_main[15] = "#", "a"
        fixed_place = list("#" * 40)
        fixed_place[15] = "a"
        xml = lambda tag, label, fixed: f'<record><controlfield tag="008">{"".join(fixed)}</controlfield><datafield tag="{tag}"><subfield code="a">{label}</subfield></datafield></record>'
        result = verify_lcsh_heading("Boolean rings—China", suggestions, lambda url: xml("151", "China", fixed_place) if "place" in url else xml("150", "Boolean rings", fixed_main))
        self.assertEqual(result["status"], "not_verified")
        self.assertEqual(result["constructionStatus"], "construction_not_permitted")

    def test_180_security_measures_is_topical_x_not_geographic_z(self):
        def suggestions(url):
            if "q=Libraries%2D%2DSecurity+measures" in url:
                return ["", [], [], []]
            if "q=Libraries" in url:
                return ["", ["Libraries"], [""], ["http://id.loc.gov/authorities/subjects/main"]]
            return ["", ["Security measures"], [""], ["http://id.loc.gov/authorities/subjects/subdivision"]]

        def record(tag, label, subject_use="a"):
            fixed = list("#" * 40)
            fixed[15] = subject_use
            return f'<record><controlfield tag="008">{"".join(fixed)}</controlfield><datafield tag="{tag}"><subfield code="a">{label}</subfield></datafield></record>'

        result = verify_lcsh_heading(
            "Libraries—Security measures", suggestions,
            lambda url: record("180", "Security measures", "b") if "subdivision" in url else record("150", "Libraries"),
        )
        self.assertEqual(result["status"], "verified_construction")
        self.assertEqual(result["subdivisionType"], "topical")
        self.assertEqual(result["subdivisionMarcCode"], "x")
        self.assertEqual(result["geographicSubdivisionCode"], "")
        self.assertEqual(result["components"][1]["headingTag"], "180")

    def test_unverified_main_still_classifies_china_as_geographic_z(self):
        def suggestions(url):
            if "/names/" in url and "q=China" in url:
                return ["", ["China"], [""], ["http://id.loc.gov/authorities/names/n79091151"]]
            return ["", [], [], []]

        fixed = list("#" * 40)
        fixed[15] = "a"
        place_xml = f'<record><controlfield tag="008">{"".join(fixed)}</controlfield><datafield tag="151"><subfield code="a">China</subfield></datafield></record>'
        result = verify_lcsh_heading("Cyberattacks—China", suggestions, lambda _url: place_xml)
        self.assertEqual(result["status"], "not_verified")
        self.assertEqual(result["constructionStatus"], "main_heading_not_verified")
        self.assertEqual(result["subdivisionType"], "geographic")
        self.assertEqual(result["subdivisionMarcCode"], "z")

    def test_450_variant_resolves_to_authorized_constructed_replacement(self):
        def suggestions(url):
            if "suggest2" in url and ("q=Cyberattacks" in url or "q=Cyber" in url):
                return {"hits": [{
                    "vLabel": "Cyber attacks", "aLabel": "Cyberterrorism",
                    "uri": "http://id.loc.gov/authorities/subjects/sh00001974",
                    "more": {"variantLabels": ["Cyber attacks"], "notes": ["Attacks against information infrastructure."]},
                }]}
            if "/names/" in url and "q=China" in url:
                return ["", ["China"], [""], ["http://id.loc.gov/authorities/names/n79091151"]]
            return ["", [], [], []]

        def record(tag, label, geo="#", subject_use="a"):
            fixed = list("#" * 40)
            fixed[6], fixed[15] = geo, subject_use
            return f'<record><controlfield tag="008">{"".join(fixed)}</controlfield><datafield tag="{tag}"><subfield code="a">{label}</subfield></datafield></record>'

        result = verify_lcsh_heading(
            "Cyberattacks—China", suggestions,
            lambda url: record("151", "China") if "n79091151" in url else record("150", "Cyberterrorism", "i"),
        )
        self.assertEqual(result["status"], "variant_resolved")
        self.assertEqual(result["suggestedAuthorizedReplacement"], "Cyberterrorism--China")
        self.assertEqual(result["variantEvidence"]["matchedVariant"], "Cyber attacks")
        self.assertEqual(result["subdivisionMarcCode"], "z")

    def test_multi_component_heading_verifies_260_subdivision_and_geographic_place(self):
        def suggestions(url):
            if "q=Internet%2D%2DGovernment+policy%2D%2DChina" in url:
                return ["", [], [], []]
            if "/names/" in url and "q=China" in url:
                return ["", ["China"], [""], ["http://id.loc.gov/authorities/names/place"]]
            if "q=Government+policy" in url:
                return ["", ["Government policy"], [""], ["http://id.loc.gov/authorities/subjects/policy"]]
            if "q=Internet" in url:
                return ["", ["Internet"], [""], ["http://id.loc.gov/authorities/subjects/main"]]
            return ["", [], [], []]

        def record(url):
            fixed = list("#" * 40)
            fixed[15] = "a"
            if "main.marcxml" in url:
                fixed[6] = "i"
                return f'<record><controlfield tag="008">{"".join(fixed)}</controlfield><datafield tag="150"><subfield code="a">Internet</subfield></datafield></record>'
            if "policy.marcxml" in url:
                return f'<record><controlfield tag="008">{"".join(fixed)}</controlfield><datafield tag="150"><subfield code="a">Government policy</subfield></datafield><datafield tag="260"><subfield code="i">subdivision</subfield><subfield code="a">Government policy</subfield><subfield code="i">under topical headings</subfield></datafield></record>'
            return f'<record><controlfield tag="008">{"".join(fixed)}</controlfield><datafield tag="151"><subfield code="a">China</subfield></datafield></record>'

        result = verify_lcsh_heading("Internet—Government policy—China", suggestions, record)
        self.assertEqual(result["status"], "verified_construction")
        self.assertEqual(result["constructionStatus"], "verified_multi_component_construction")
        self.assertEqual(result["subdivisionMarcCodes"], ["x", "z"])
        self.assertEqual([item["headingTag"] for item in result["components"]], ["150", "150", "151"])
        self.assertIn("under topical headings", result["components"][1]["subdivisionInstruction"])

    def test_pdf_evidence_schema_is_strict_and_page_cited(self):
        self.assertFalse(PDF_EVIDENCE_SCHEMA["additionalProperties"])
        item = PDF_EVIDENCE_SCHEMA["properties"]["evidence"]["items"]
        self.assertIn("pageNumber", item["required"])
        self.assertIn("evidenceExcerpt", item["required"])
        self.assertFalse(item["additionalProperties"])

    def test_original_demo_pdf_is_deterministic_and_visibly_fictional(self):
        pdf_path = Path(__file__).parents[1] / "output" / "pdf" / "build-week-demo-source.pdf"
        pdf_bytes = pdf_path.read_bytes()
        self.assertEqual(__import__("hashlib").sha256(pdf_bytes).hexdigest(), BUILD_WEEK_DEMO_PDF_SHA256)
        with app.test_client() as client:
            response = client.post("/api/source/pdf", data={"pdf": (BytesIO(pdf_bytes), pdf_path.name, "application/pdf")})
        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["sourcePackage"]["title"].split(" : ")[0], "Signals Under Pressure")
        self.assertEqual(payload["retrieval"]["provider"], "Original fictional Build Week PDF fixture")
        self.assertIn("fictional", " ".join(payload["retrieval"]["warnings"]).lower())
        self.assertEqual(payload["sourcePackage"]["isbn"], "9781234567897")
        self.assertIn("Introduction: Describing digital threats with care", payload["sourcePackage"]["contents"])
        self.assertTrue(any(item["field"] == "contents" and item["pageNumber"] == 3 for item in payload["retrieval"]["evidence"]))

    def test_pdf_upload_rejects_non_pdf_content(self):
        with app.test_client() as client:
            response = client.post("/api/source/pdf", data={"pdf": (BytesIO(b"not a pdf"), "fake.pdf", "application/pdf")})
        self.assertEqual(response.status_code, 502)
        self.assertIn("not a valid PDF", response.get_json()["error"])

    def test_pdf_connection_error_message_prohibits_silent_fixture_substitution(self):
        source = (Path(__file__).parents[1] / "server" / "pdf_evidence.py").read_text(encoding="utf-8")
        self.assertIn("could not reach the OpenAI API after retries", source)
        self.assertIn("no fixture data was substituted", source)

    def test_server_uses_the_versioned_canonical_cataloging_profile(self):
        disk_profile = json.loads((Path(__file__).parents[1] / "cataloging-profile.json").read_text(encoding="utf-8"))
        self.assertEqual(CATALOGING_PROFILE, disk_profile)
        self.assertTrue(_profile_matches(disk_profile))
        self.assertFalse(_profile_matches({**disk_profile, "profileVersion": "tampered"}))

    def test_creator_and_reviewer_prompts_are_distinct_roles(self):
        self.assertIn("Role: AI Creator", CREATOR_PROMPT)
        self.assertIn("Role: Independent AI Reviewer", REVIEWER_PROMPT)
        self.assertIn("Do not modify the draft", REVIEWER_PROMPT)
        self.assertIn("Never manufacture a change", REVIEWER_PROMPT)
        self.assertIn("especially contents", CREATOR_PROMPT)
        self.assertIn("Never recommend removal solely", REVIEWER_PROMPT)
        self.assertIn("major concept missing", REVIEWER_PROMPT)
        self.assertNotEqual(CREATOR_PROMPT, REVIEWER_PROMPT)

    def test_creator_schema_is_strict_and_complete(self):
        self.assertFalse(CREATOR_SCHEMA["additionalProperties"])
        self.assertEqual(set(CREATOR_SCHEMA["required"]), set(CREATOR_SCHEMA["properties"]))
        self.assertEqual(CREATOR_SCHEMA["properties"]["subjects"]["maxItems"], 3)

    def test_reviewer_allows_zero_to_many_recommendations(self):
        recommendations = REVIEWER_SCHEMA["properties"]["recommendations"]
        self.assertNotIn("minItems", recommendations)
        self.assertGreater(recommendations["maxItems"], 3)
        self.assertFalse(recommendations["items"]["additionalProperties"])

    def test_reviewer_requires_twelve_adaptive_coverage_results(self):
        coverage = REVIEWER_SCHEMA["properties"]["reviewCoverage"]
        self.assertEqual(coverage["minItems"], 12)
        self.assertEqual(coverage["maxItems"], 12)
        statuses = set(coverage["items"]["properties"]["status"]["enum"])
        self.assertEqual(statuses, {"no_change", "change_recommended", "missing_field", "needs_verification", "not_assessable"})
        self.assertIn("verificationStatus", coverage["items"]["required"])

    def test_reviewer_can_target_all_supported_record_areas(self):
        fields = set(REVIEWER_SCHEMA["properties"]["recommendations"]["items"]["properties"]["field"]["enum"])
        self.assertTrue({"isbn", "author", "title", "publication", "extent", "summary", "subjects.0", "genre"}.issubset(fields))

    def test_deterministic_validator_catches_unsupported_summary_and_isbn_mismatch(self):
        source = {"isbn": "9780306406157", "description": ""}
        draft = {"isbn": "9780141439518", "title": "Title", "summary": "Invented summary", "subjects": []}
        codes = {finding["code"] for finding in validate_draft(source, draft)}
        self.assertIn("isbn_mismatch", codes)
        self.assertIn("unsupported_summary", codes)

    def test_deterministic_validator_rejects_multiple_people_in_nonrepeatable_100(self):
        source = {"isbn": "", "description": ""}
        draft = {
            "isbn": "", "title": "Edited collection", "summary": "", "subjects": [],
            "author": "Maya Chen, editor; Jordan Lee, editor; Sam Rivera, editor",
        }
        codes = {finding["code"] for finding in validate_draft(source, draft)}
        self.assertIn("multiple_names_in_100", codes)

    def test_full_level_checks_preserve_contents_and_geographic_consistency(self):
        source = {
            "isbn": "", "description": "Supported summary", "contents": "Introduction -- China -- Conclusion",
            "additionalNotes": "Includes bibliographical references and index.", "format": "Print book",
        }
        draft = {
            "isbn": "", "title": "Title", "summary": "Supported summary", "author": "",
            "subjects": ["Cyberterrorism—China"], "contentsNote": "Shortened contents",
            "bibliographyNote": "Includes bibliographical references.", "geographicAreaCode": "",
            "classificationNumber": "HV6773.15.C6 P37 2026",
            "contentType": "text", "mediaType": "unmediated", "carrierType": "volume",
        }
        findings = validate_draft(source, draft)
        codes = {finding["code"] for finding in findings}
        self.assertIn("contents_mismatch", codes)
        self.assertIn("missing_geographic_area_code", codes)
        self.assertIn("classification_is_proposal", codes)

    def test_creator_normalization_moves_editors_to_separate_700_data(self):
        source = {
            "author": "Maya Chen, editor; Jordan Lee, editor; Sam Rivera, editor",
            "format": "Book",
        }
        draft = {
            "author": source["author"], "contributors": [], "corporateContributors": [],
            "statementOfResponsibility": "", "contentType": "", "mediaType": "", "carrierType": "",
        }
        normalized = normalize_creator_draft(source, draft)
        self.assertEqual(normalized["author"], "")
        self.assertEqual([person["name"] for person in normalized["contributors"]], [
            "Chen, Maya", "Lee, Jordan", "Rivera, Sam",
        ])
        self.assertEqual(normalized["statementOfResponsibility"], "edited by Maya Chen, Jordan Lee, and Sam Rivera")
        self.assertEqual((normalized["contentType"], normalized["mediaType"], normalized["carrierType"]), ("text", "unmediated", "volume"))

    def test_creator_normalization_keeps_only_first_coauthor_in_100_data(self):
        source = {"author": "Jane Doe; Richard Roe", "format": "Book"}
        normalized = normalize_creator_draft(source, {
            "author": source["author"], "contributors": [], "corporateContributors": [],
            "statementOfResponsibility": "", "contentType": "", "mediaType": "", "carrierType": "",
        })
        self.assertEqual(normalized["author"], "Doe, Jane")
        self.assertEqual(normalized["contributors"][0]["name"], "Roe, Richard")
        self.assertEqual(normalized["statementOfResponsibility"], "Jane Doe and Richard Roe")

    def test_creator_relationship_is_role_aware_across_resource_types(self):
        composer = normalize_creator_draft({"author": "Lena Price, composer", "format": "Score"}, {
            "author": "", "creatorRelationship": "", "contributors": [], "corporateContributors": [],
            "statementOfResponsibility": "", "contentType": "", "mediaType": "", "carrierType": "",
        })
        self.assertEqual((composer["author"], composer["creatorRelationship"]), ("Price, Lena", "composer"))

        film = normalize_creator_draft({"author": "Maya Chen, film director", "format": "Video"}, {
            "author": "Chen, Maya", "creatorRelationship": "author", "contributors": [], "corporateContributors": [],
            "statementOfResponsibility": "", "contentType": "", "mediaType": "", "carrierType": "",
        })
        self.assertEqual(film["author"], "")
        self.assertEqual(film["creatorRelationship"], "")
        self.assertEqual(film["contributors"][0]["relationship"], "film director")

    def test_fixed_field_inputs_are_derived_from_confirmed_visible_evidence(self):
        normalized = normalize_creator_draft({
            "author": "Elena Park", "format": "Print book", "language": "English",
            "publicationInformation": "Boston : Meridian Research Press, 2026",
            "isbn": "978-1-23456-789-7", "additionalNotes": "Includes bibliographical references and index.",
        }, {
            "isbn": "", "author": "", "creatorRelationship": "", "contributors": [], "corporateContributors": [],
            "statementOfResponsibility": "", "contentType": "", "mediaType": "", "carrierType": "",
        })
        self.assertEqual(normalized["isbn"], "9781234567897")
        self.assertEqual(normalized["languageCode"], "eng")
        self.assertEqual(normalized["placeCode"], "mau")
        self.assertTrue(normalized["books008"])
        self.assertTrue(normalized["hasIndex"])

    def test_review_contract_rejects_duplicate_coverage_areas(self):
        coverage = [{"field": "020", "status": "no_change"} for _ in range(9)]
        with self.assertRaises(LiveServiceError):
            _validate_review_contract({"reviewCoverage": coverage, "recommendations": []})

    def test_review_contract_requires_human_resolution_for_supported_unverified_heading(self):
        fields = ["020", "050", "043", "100", "245", "264", "300", "336/337/338", "504/505", "520", "650", "655"]
        coverage = [{"field": field, "status": "needs_verification" if field == "650" else "no_change"} for field in fields]
        recommendation = {"action": "review", "field": "subjects.1"}
        _validate_review_contract({"reviewCoverage": coverage, "recommendations": [recommendation]})
        with self.assertRaises(LiveServiceError):
            _validate_review_contract({"reviewCoverage": coverage, "recommendations": []})

    def test_review_contract_allows_mixed_subject_correction_and_verification(self):
        fields = ["020", "050", "043", "100", "245", "264", "300", "336/337/338", "504/505", "520", "650", "655"]
        coverage = [{"field": field, "status": "change_recommended" if field == "650" else "no_change"} for field in fields]
        recommendations = [
            {"action": "replace", "field": "subjects.0"},
            {"action": "review", "field": "subjects.1"},
        ]
        _validate_review_contract({"reviewCoverage": coverage, "recommendations": recommendations})


if __name__ == "__main__":
    unittest.main()
