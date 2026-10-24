"""On-device PII redaction (docs/SPEC.md §5.4).

Runs on every piece of model-produced or user-produced text before it is
returned, stored or logged. Deterministic regex + checksum, no model involved,
so it is fast, testable and cannot be talked out of redacting.
"""

import re
from dataclasses import dataclass

# --- Verhoeff checksum (used by UIDAI for the last Aadhaar digit) -------------
# Tables from the published algorithm: d = dihedral group D5 multiplication,
# p = position permutation, inv = inverse element.
_D = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 2, 3, 4, 0, 6, 7, 8, 9, 5),
    (2, 3, 4, 0, 1, 7, 8, 9, 5, 6),
    (3, 4, 0, 1, 2, 8, 9, 5, 6, 7),
    (4, 0, 1, 2, 3, 9, 5, 6, 7, 8),
    (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
    (6, 5, 9, 8, 7, 1, 0, 4, 3, 2),
    (7, 6, 5, 9, 8, 2, 1, 0, 4, 3),
    (8, 7, 6, 5, 9, 3, 2, 1, 0, 4),
    (9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
)
_P = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 5, 7, 6, 2, 8, 3, 0, 9, 4),
    (5, 8, 0, 3, 7, 9, 6, 1, 4, 2),
    (8, 9, 1, 6, 0, 4, 3, 5, 2, 7),
    (9, 4, 5, 3, 1, 2, 6, 8, 7, 0),
    (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
    (2, 7, 9, 3, 8, 0, 6, 4, 1, 5),
    (7, 0, 4, 6, 9, 1, 3, 2, 5, 8),
)
_INV = (0, 4, 3, 2, 1, 5, 6, 7, 8, 9)


def verhoeff_valid(number: str) -> bool:
    if not number.isdigit():
        return False
    c = 0
    for i, ch in enumerate(reversed(number)):
        c = _D[c][_P[i % 8][int(ch)]]
    return c == 0


def verhoeff_check_digit(number: str) -> str:
    c = 0
    for i, ch in enumerate(reversed(number)):
        c = _D[c][_P[(i + 1) % 8][int(ch)]]
    return str(_INV[c])


def is_aadhaar(number: str) -> bool:
    digits = re.sub(r"[\s-]", "", number)
    return len(digits) == 12 and digits[0] in "23456789" and verhoeff_valid(digits)


# --- Redaction ----------------------------------------------------------------

# Devanagari digits ०-९ -> 0-9 so "२३४५ ..." is caught too. Same length, so
# offsets in the normalised text are valid in the original.
_DEVANAGARI = str.maketrans("०१२३४५६७८९", "0123456789")

_AADHAAR = re.compile(r"(?<!\d)[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}(?!\d)")
_PAN = re.compile(r"(?<![A-Z0-9])[A-Z]{5}\d{4}[A-Z](?![A-Z0-9])")
_IFSC = re.compile(r"(?<![A-Z0-9])[A-Z]{4}0[A-Z0-9]{6}(?![A-Z0-9])")
_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE = re.compile(r"(?<!\d)(?:\+91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)")
_ACCOUNT_KEYWORD = re.compile(
    r"(?:a/c|acc(?:oun)?t|account|khata|खाता|खाते|बँक|बैंक)\D{0,25}?(\d[\d\s-]{7,22}\d)",
    re.IGNORECASE,
)

LABELS = {
    "aadhaar": "Aadhaar",
    "pan": "PAN",
    "ifsc": "IFSC",
    "bank_account": "Bank account",
    "phone": "Phone",
    "email": "Email",
}


@dataclass(frozen=True)
class Finding:
    type: str
    start: int
    end: int
    masked: str


def _keep_last(raw: str, keep: int, fill: str = "X") -> str:
    digits = re.sub(r"\D", "", raw)
    return fill * (len(digits) - keep) + digits[-keep:]


def _mask_aadhaar(raw: str) -> str:
    return "XXXX-XXXX-" + re.sub(r"\D", "", raw)[-4:]


def find_pii(text: str) -> list[Finding]:
    norm = text.translate(_DEVANAGARI)
    found: list[Finding] = []
    taken: list[tuple[int, int]] = []

    def add(kind: str, start: int, end: int, masked: str) -> None:
        if any(start < e and end > s for s, e in taken):
            return  # an earlier, more specific pattern already covers this span
        taken.append((start, end))
        found.append(Finding(kind, start, end, masked))

    # Order matters: specific, checksummed patterns first.
    for m in _AADHAAR.finditer(norm):
        if is_aadhaar(m.group()):
            add("aadhaar", m.start(), m.end(), _mask_aadhaar(m.group()))
    for m in _EMAIL.finditer(norm):
        add("email", m.start(), m.end(), "[EMAIL]")
    for m in _PAN.finditer(norm):
        add("pan", m.start(), m.end(), "XXXXX" + m.group()[5:9] + "X")
    for m in _IFSC.finditer(norm):
        add("ifsc", m.start(), m.end(), m.group()[:4] + "0XXXXXX")
    for m in _ACCOUNT_KEYWORD.finditer(norm):
        digits = re.sub(r"\D", "", m.group(1))
        if 9 <= len(digits) <= 18:
            add("bank_account", m.start(1), m.end(1), _keep_last(m.group(1), 4))
    for m in _PHONE.finditer(norm):
        add("phone", m.start(), m.end(), _keep_last(m.group(), 2))
    # Any remaining 12-digit run that looks like Aadhaar but fails the checksum
    # is still masked: a misread digit must not leak the other eleven.
    for m in _AADHAAR.finditer(norm):
        add("aadhaar", m.start(), m.end(), _mask_aadhaar(m.group()))

    return sorted(found, key=lambda f: f.start)


def redact(text: str) -> tuple[str, list[Finding]]:
    findings = find_pii(text)
    out, last = [], 0
    for f in findings:
        out.append(text[last : f.start])
        out.append(f.masked)
        last = f.end
    out.append(text[last:])
    return "".join(out), findings


def redact_text(text: str) -> str:
    return redact(text)[0]


def redact_obj(value, kinds: set[str] | None = None):
    """Redact every string inside a JSON-like value. Collects finding kinds."""
    if isinstance(value, str):
        red, findings = redact(value)
        if kinds is not None:
            kinds.update(f.type for f in findings)
        return red
    if isinstance(value, list):
        return [redact_obj(v, kinds) for v in value]
    if isinstance(value, dict):
        return {k: redact_obj(v, kinds) for k, v in value.items()}
    return value
