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

    document = SimpleDocTemplate(str(OUTPUT), pagesize=LETTER, rightMargin=0.8 * inch, leftMargin=0.8 * inch, topMargin=0.8 * inch, bottomMargin=0.7 * inch, title="Signals Under Pressure", author="OpenAI Build Week demonstration")
    story = [
        Spacer(1, 0.65 * inch),
        Paragraph("Signals Under Pressure", styles["DemoTitle"]),
        Paragraph("Cyber attacks, information control, and digital resilience in contemporary China", styles["DemoSubtitle"]),
        Paragraph("Elena Park", styles["DemoSubtitle"]),
        Spacer(1, 0.35 * inch),
        Paragraph("Meridian Research Press", styles["DemoBody"]),
        Paragraph("Boston | 2026", styles["DemoBody"]),
        Spacer(1, 0.7 * inch),
        Paragraph("This publication, its ISBN, and all names, organizations, and text in it are fictional and were created solely for the OpenAI Build Week demonstration.", styles["DemoNote"]),
        PageBreak(),
        Paragraph("About this book", styles["DemoHeading"]),
        Paragraph("Signals Under Pressure examines politically motivated cyber attacks against information infrastructure in China and the public policies developed in response. It distinguishes disruptive attacks intended to intimidate institutions from ordinary computer crime and technical system failure.", styles["DemoBody"]),
        Paragraph("The book also studies government control of Internet access and online expression. Case studies consider website blocking, platform regulation, public communication during network disruptions, and the relationship between Internet censorship and national security policy in China.", styles["DemoBody"]),
        Paragraph("The analysis draws on public policy documents, interviews with network administrators, and comparative studies of digital resilience. It does not provide operational instructions for conducting attacks.", styles["DemoBody"]),
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
        Paragraph("Introduction: Describing digital threats with care", styles["DemoBody"]),
        Paragraph("1. Information infrastructure and politically motivated cyber attacks", styles["DemoBody"]),
        Paragraph("2. Internet censorship and platform regulation in China", styles["DemoBody"]),
        Paragraph("3. Public communication during network disruption", styles["DemoBody"]),
        Paragraph("4. National security policy and digital resilience", styles["DemoBody"]),
        Paragraph("5. Comparative approaches to accountable technology governance", styles["DemoBody"]),
        Spacer(1, 0.3 * inch),
        Paragraph("Includes bibliographical references and index.", styles["DemoNote"]),
    ]
    document.build(story, onFirstPage=page_number, onLaterPages=page_number)


if __name__ == "__main__":
    build()
