export const CURATED_SOURCE_TEXT = `A literary novel about a woman reconstructing her identity through fragmented and unreliable memories of childhood. Moving between the present and remembered events, the narrative explores autobiographical memory, trauma, and the stories people tell about themselves. Published by Imaginary Press in New York in 2021.`;

export const CURATED_SOURCE_PACKAGE = Object.freeze({
  title: "Memory palace : a novel",
  author: "Doe, Jane",
  format: "Print book",
  language: "English",
  publicationInformation: "New York : Imaginary Press, 2021.",
  isbn: "",
  description: CURATED_SOURCE_TEXT,
  additionalNotes: "Physical description: 284 pages ; 24 cm. Content type: text; media type: unmediated; carrier type: volume.",
  contents: ""
});

export const CURATED_CREATOR_DRAFT = Object.freeze({
  isbn: "",
  author: "Doe, Jane",
  creatorRelationship: "author",
  title: "Memory palace : a novel",
  publication: "New York : Imaginary Press, 2021.",
  extent: "284 pages ; 24 cm",
  contentType: "text",
  mediaType: "unmediated",
  carrierType: "volume",
  field005: "20260719000000.0",
  dateEntered: "260719",
  placeCode: "nyu",
  languageCode: "eng",
  hasIndex: false,
  books008: true,
  classificationNumber: "",
  classificationRationale: "",
  geographicAreaCode: "",
  bibliographyNote: "",
  contentsNote: "",
  summary: "A woman revisits fragmented childhood memories while trying to understand her present identity.",
  subjects: Object.freeze([
    "Memory—Fiction",
    "Identity (Psychology)—Fiction"
  ]),
  genre: "Novels",
  statementOfResponsibility: "Jane Doe",
  contributors: [],
  corporateContributors: []
});

export const CURATED_RECOMMENDATIONS = Object.freeze([
  Object.freeze({
    id: "review-summary",
    field: "summary",
    fieldLabel: "520 Summary",
    currentValue: CURATED_CREATOR_DRAFT.summary,
    proposedValue: "A woman reconstructs her identity through fragmented and unreliable memories of childhood, confronting trauma and the stories people create about themselves.",
    explanation: "The revised summary captures the work's scope and central themes more fully while retaining a neutral cataloging tone.",
    evidence: "“reconstructing her identity through fragmented and unreliable memories of childhood”",
    evidenceSource: "Resource description",
    evidenceLocation: "Pasted source description",
    confidence: "high",
    demoIntent: "accept"
  }),
  Object.freeze({
    id: "review-subject",
    field: "subjects.0",
    fieldLabel: "650 Subject",
    currentValue: CURATED_CREATOR_DRAFT.subjects[0],
    proposedValue: "Autobiographical memory—Fiction",
    explanation: "A more specific heading better represents the novel's focus on memory of the protagonist's own life.",
    evidence: "“the narrative explores autobiographical memory”",
    evidenceSource: "Resource description",
    evidenceLocation: "Pasted source description",
    confidence: "high",
    demoIntent: "edit",
    suggestedHumanEdit: "Autobiographical memory—Fiction"
  }),
  Object.freeze({
    id: "review-author",
    field: "author",
    fieldLabel: "100 Creator",
    currentValue: CURATED_CREATOR_DRAFT.author,
    proposedValue: "Doe, Jane, 1975-",
    explanation: "A fuller authorized form may distinguish this creator, but the supplied source does not establish the birth year.",
    evidence: "No birth date appears in the supplied evidence.",
    evidenceSource: "Author/Creator",
    evidenceLocation: "Reviewer limitation note",
    confidence: "low",
    demoIntent: "reject"
  })
]);

export const CURATED_REVIEW_COVERAGE = Object.freeze([
  { field: "020", label: "ISBN", status: "no_change" },
  { field: "050", label: "Proposed LC classification", status: "no_change" },
  { field: "043", label: "Geographic area code", status: "no_change" },
  { field: "100", label: "Author/Creator", status: "recommendation" },
  { field: "245", label: "Title", status: "no_change" },
  { field: "264", label: "Publication information", status: "no_change" },
  { field: "300", label: "Physical description", status: "no_change" },
  { field: "336/337/338", label: "Content, media, and carrier", status: "no_change" },
  { field: "504", label: "Bibliography note", status: "no_change" },
  { field: "505", label: "Contents note", status: "no_change" },
  { field: "520", label: "Summary", status: "recommendation" },
  { field: "650", label: "Subject headings", status: "recommendation" },
  { field: "655", label: "Genre/form heading", status: "no_change" }
]);
