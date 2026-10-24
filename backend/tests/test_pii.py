import pytest

from app import pii

BASE = "23412341234"
VALID_AADHAAR = BASE + pii.verhoeff_check_digit(BASE)
BAD_CHECKSUM = BASE + str((int(VALID_AADHAAR[-1]) + 1) % 10)


def spaced(n: str) -> str:
    return f"{n[:4]} {n[4:8]} {n[8:]}"


class TestVerhoeff:
    def test_known_vectors(self):
        # Published example: 236 -> check digit 3
        assert pii.verhoeff_check_digit("236") == "3"
        assert pii.verhoeff_valid("2363")
        assert not pii.verhoeff_valid("2364")

    def test_generated_aadhaar_valid(self):
        assert pii.is_aadhaar(VALID_AADHAAR)
        assert pii.is_aadhaar(spaced(VALID_AADHAAR))
        assert not pii.is_aadhaar(BAD_CHECKSUM)

    @pytest.mark.parametrize("n", ["0" + VALID_AADHAAR[1:], "1" + VALID_AADHAAR[1:], "12345", "abcd", ""])
    def test_rejects_non_aadhaar(self, n):
        assert not pii.is_aadhaar(n)

    def test_single_digit_errors_caught(self):
        for i in range(12):
            for d in "0123456789":
                if d == VALID_AADHAAR[i]:
                    continue
                assert not pii.verhoeff_valid(VALID_AADHAAR[:i] + d + VALID_AADHAAR[i + 1:])


class TestRedact:
    def test_aadhaar_masked_keeps_last4(self):
        text, f = pii.redact(f"Aadhaar: {spaced(VALID_AADHAAR)} ok")
        assert VALID_AADHAAR[:8] not in text.replace(" ", "")
        assert f"XXXX-XXXX-{VALID_AADHAAR[-4:]}" in text
        assert [x.type for x in f] == ["aadhaar"]

    def test_aadhaar_with_bad_checksum_still_masked(self):
        text, f = pii.redact(f"UID {BAD_CHECKSUM}")
        assert BAD_CHECKSUM not in text
        assert f[0].type == "aadhaar"

    def test_devanagari_digits(self):
        dev = VALID_AADHAAR.translate(str.maketrans("0123456789", "०१२३४५६७८९"))
        text, f = pii.redact(f"आधार {dev}")
        assert dev not in text and f[0].type == "aadhaar"

    def test_pan(self):
        text, f = pii.redact("PAN ABCDE1234F.")
        assert text == "PAN XXXXX1234X." and f[0].type == "pan"

    def test_ifsc(self):
        text, _ = pii.redact("IFSC SBIN0001234")
        assert "SBIN0XXXXXX" in text and "0001234" not in text

    @pytest.mark.parametrize("phone", ["9876543210", "+91 9876543210", "+91-98765 43210", "09876543210"])
    def test_phone(self, phone):
        text, f = pii.redact(f"call {phone} now")
        assert "987654" not in text and f[0].type == "phone"
        assert text.endswith("10 now")

    def test_email(self):
        text, _ = pii.redact("mail ramesh.patil@example.com")
        assert "ramesh" not in text and "[EMAIL]" in text

    @pytest.mark.parametrize("prefix", ["A/c no. ", "Account number: ", "khata ", "खाता क्र. ", "बँक खाते "])
    def test_bank_account_near_keyword(self, prefix):
        text, f = pii.redact(prefix + "123456789012345")
        assert "1234567890" not in text and "2345" in text
        assert f[0].type == "bank_account"

    def test_plain_numbers_untouched(self):
        s = "Loan ₹1,60,000 due 2026-11-15, 2.5 acres, survey 123/4, 15 L tank"
        assert pii.redact_text(s) == s

    def test_multiple_and_offsets(self):
        s = f"PAN ABCDE1234F phone 9876543210 aadhaar {VALID_AADHAAR}"
        text, f = pii.redact(s)
        assert [x.type for x in f] == ["pan", "phone", "aadhaar"]
        assert "ABCDE" not in text and "98765" not in text

    def test_redact_obj_nested_collects_kinds(self):
        kinds: set[str] = set()
        out = pii.redact_obj({"a": ["x 9876543210"], "b": {"c": "ABCDE1234F"}, "n": 3}, kinds)
        assert kinds == {"phone", "pan"}
        assert out["n"] == 3 and "98765" not in out["a"][0]
