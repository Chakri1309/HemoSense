"""HemoSense report parser: extract lab values from PDF / DOCX blood reports."""
import re

# canonical key -> list of regexes (first capture group = numeric value, case-insensitive)
PATTERNS = {
    "Haemoglobin": [
        r"(?:haemoglobin|hemoglobin|\bhgb?\b)[\s:.\-]*(\d{1,2}(?:\.\d{1,2})?)",
        r"(\d{1,2}(?:\.\d{1,2})?)\s*g\s*/\s*dl(?![a-z])",
    ],
    "MCV": [r"\bmcv\b[\s:.\-]*(\d{2,3}(?:\.\d{1,2})?)"],
    "MCH": [r"\bmch\b(?![c])[\s:.\-]*(\d{1,2}(?:\.\d{1,2})?)"],
    "MCHC": [r"\bmchc\b[\s:.\-]*(\d{1,2}(?:\.\d{1,2})?)"],
    "RDW": [r"\brdw(?:[\s\-]*cv)?\b[\s:.\-]*(\d{1,2}(?:\.\d{1,2})?)"],
    "RBC": [r"\brbc\b(?:\s*count)?[\s:.\-]*(\d(?:\.\d{1,2})?)"],
    "HCT": [
        r"\bhct\b\s*(?:\(pcv\))?[^0-9]{0,10}(\d{1,2}(?:\.\d{1,2})?)",
        r"(?:haematocrit|hematocrit|\bpcv\b)[^0-9]{0,10}(\d{1,2}(?:\.\d{1,2})?)",
    ],
    "Ferritin": [r"ferritin[\s:.\-]*(\d{1,3}(?:\.\d{1,2})?)"],
    "Age": [
        r"\bage\b[\s:.\-]*(\d{1,3})",
        r"(\d{1,3})\s*(?:years?\s*old|yrs?\s*old|y\/o)",
    ],
}

GENDER_RE = re.compile(
    r"\b(?:sex|gender)\b[\s:.\-]*\b(male|female|m\b|f\b)", re.IGNORECASE)
GENDER_ANY = re.compile(r"\b(male|female)\b", re.IGNORECASE)
NAME_RE = re.compile(r"(?:patient\s*name|patient|name)\s*[:\-]\s*([A-Za-z][A-Za-z.'\- ]+)", re.IGNORECASE)

VALID_RANGES = {
    "Haemoglobin": (4, 20), "MCV": (55, 115), "MCH": (12, 40),
    "MCHC": (25, 38), "RDW": (10, 22), "RBC": (2.0, 7.0),
    "HCT": (12, 60), "Ferritin": (1, 500), "Age": (1, 100),
}


def extract_text_from_pdf(stream) -> str:
    from pypdf import PdfReader
    reader = PdfReader(stream)
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def extract_text_from_docx(stream) -> str:
    import docx
    doc = docx.Document(stream)
    parts = [p.text for p in doc.paragraphs]
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                parts.append(cell.text)
    return "\n".join(parts)


def parse_lab_values(text: str) -> dict:
    """Return {values: {key: float}, found: [keys], gender, text_preview}."""
    values, found = {}, []
    for key, regexes in PATTERNS.items():
        for rx in regexes:
            m = re.search(rx, text, re.IGNORECASE)
            if m:
                try:
                    v = float(m.group(1))
                except (ValueError, IndexError):
                    continue
                lo, hi = VALID_RANGES[key]
                if lo <= v <= hi:
                    values[key] = v
                    found.append(key)
                    break
    gender = None
    m = GENDER_RE.search(text)
    if m:
        g = m.group(1).strip().lower()
        gender = "Male" if g.startswith("m") else "Female"
    else:
        m2 = GENDER_ANY.search(text)
        if m2:
            gender = m2.group(1).capitalize()
    if gender:
        values["Gender"] = gender
        found.append("Gender")
    m = NAME_RE.search(text)
    if m:
        cand = re.split(r"\s{2,}|\n|\bAge\b|\bSex\b|\bGender\b|\bDOB\b", m.group(1), maxsplit=1)[0]
        cand = re.sub(r"[^A-Za-z.'\- ]", "", cand).strip()
        if 2 <= len(cand) <= 40:
            values["Name"] = cand
            found.append("Name")
    preview = text.strip().replace("\r", "")[:600]
    return {"values": values, "found": found, "text_preview": preview}
