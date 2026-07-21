"""Generate the original fictional source-evidence PDF used in the demo."""

from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab import rl_config


ROOT = Path(__file__).parents[1]
OUTPUT = ROOT / "output" / "pdf" / "build-week-demo-source.pdf"


def page_number(canvas, document):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(HexColor("#5b6472"))
    canvas.drawCentredString(LETTER[0] / 2, 0.42 * inch, f"Fictional demonstration source | {document.page}")
    canvas.restoreState()


def build():
    rl_config.invariant = 1
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="DemoTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=25, leading=30, alignment=TA_CENTER, textColor=HexColor("#17324d"), spaceAfter=18))
    styles.add(ParagraphStyle(name="DemoSubtitle", parent=styles["Heading2"], fontName="Helvetica", fontSize=14, leading=19, alignment=TA_CENTER, textColor=HexColor("#39566f"), spaceAfter=24))
    styles.add(ParagraphStyle(name="DemoHeading", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=HexColor("#17324d"), spaceBefore=8, spaceAfter=10))
    styles.add(ParagraphStyle(name="DemoBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=11, leading=17, textColor=HexColor("#202a33"), spaceAfter=10))
    styles.add(ParagraphStyle(name="DemoNote", parent=styles["BodyText"], fontName="Helvetica-Oblique", fontSize=9, leading=13, textColor=HexColor("#5b6472")))

    document = SimpleDocTemplate(str(OUTPUT), pagesize=LETTER, rightMargin=0.8 * inch, leftMargin=0.8 * inch, topMargin=0.8 * inch, bottomMargin=0.7 * inch, title="Shared Tables", author="OpenAI Build Week demonstration")
    story = [
        Spacer(1, 0.65 * inch),
        Paragraph("Shared Tables", styles["DemoTitle"]),
        Paragraph("Street food, public markets, and city life in contemporary China", styles["DemoSubtitle"]),
        Paragraph("Elena Park", styles["DemoSubtitle"]),
        Spacer(1, 0.35 * inch),
        Paragraph("Meridian Research Press", styles["DemoBody"]),
        Paragraph("Boston | 2026", styles["DemoBody"]),
        Spacer(1, 0.7 * inch),
        Paragraph("This publication, its ISBN, and all names, organizations, and text in it are fictional and were created solely for the OpenAI Build Week demonstration.", styles["DemoNote"]),
        PageBreak(),
        Paragraph("About this book", styles["DemoHeading"]),
        Paragraph("Shared Tables explores how street food and public markets shape everyday city life in contemporary China. It follows vendors and residents through morning markets, neighborhood food streets, and shared dining spaces, showing how food connects daily routines with a sense of place.", styles["DemoBody"]),
        Paragraph("The book considers markets as neighborhood gathering places and as part of local urban economies. Its case studies examine migration, changing food habits, small family businesses, and efforts to preserve market traditions during urban development.", styles["DemoBody"]),
        Paragraph("The analysis draws on interviews with vendors and residents, observation in public markets, photographs, and historical sources. It emphasizes the variety of local experiences rather than treating city life as a single uniform pattern.", styles["DemoBody"]),
        Paragraph("Publication information", styles["DemoHeading"]),
        Table([
            ["Creator", "Elena Park"],
            ["Publisher", "Meridian Research Press"],
            ["Place and date", "Boston, 2026"],
            ["Format", "Print book"],
            ["Extent", "xii, 248 pages : illustrations ; 24 cm"],
            ["Fictional demonstration ISBN", "978-1-23456-789-7"],
        ], colWidths=[2.15 * inch, 4.05 * inch], style=TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"), ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("TEXTCOLOR", (0, 0), (0, -1), HexColor("#17324d")), ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, HexColor("#c9d3dc")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ])),
        PageBreak(),
        Paragraph("Contents", styles["DemoHeading"]),
        Paragraph("Introduction: Food, place, and everyday urban life", styles["DemoBody"]),
        Paragraph("1. Street food and the rhythms of the city", styles["DemoBody"]),
        Paragraph("2. Public markets as neighborhood spaces", styles["DemoBody"]),
        Paragraph("3. Vendors, migration, and local economies", styles["DemoBody"]),
        Paragraph("4. Changing food habits in contemporary China", styles["DemoBody"]),
        Paragraph("5. Preserving market traditions amid urban development", styles["DemoBody"]),
        Spacer(1, 0.3 * inch),
        Paragraph("Includes bibliographical references and index.", styles["DemoNote"]),
    ]
    document.build(story, onFirstPage=page_number, onLaterPages=page_number)


if __name__ == "__main__":
    build()
