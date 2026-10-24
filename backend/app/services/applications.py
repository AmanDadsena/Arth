"""Scheme application tracker: what a farmer applied for, and what to do next.

Rules, not the model. Official last dates change every season and differ by
state, so Arth never invents them: the farmer enters their own (often read off
a notice in Kagaz), and the home brief reminds them when it is close.
"""

from datetime import date

from .. import pii
from ..errors import ApiError
from ..schemas import ActionItem, Application, ApplicationInput, Lang
from . import schemes

MAX_APPLICATIONS = 30
REMIND_DAYS = 7

_NEXT = {
    "docs": {
        "en": "Get the {n} remaining documents ready",
        "hi": "बाकी {n} दस्तावेज़ तैयार करें",
        "mr": "उरलेली {n} कागदपत्रे तयार करा",
    },
    "apply": {
        "en": "All documents ready. Apply on the official website or at your nearest CSC",
        "hi": "सारे दस्तावेज़ तैयार हैं। आधिकारिक वेबसाइट पर या नज़दीकी CSC पर आवेदन करें",
        "mr": "सर्व कागदपत्रे तयार आहेत. अधिकृत वेबसाइटवर किंवा जवळच्या CSC मध्ये अर्ज करा",
    },
    "applied": {
        "en": "Keep your reference number safe and check the status on the official website",
        "hi": "अपना संदर्भ नंबर संभालकर रखें और आधिकारिक वेबसाइट पर स्थिति देखें",
        "mr": "तुमचा संदर्भ क्रमांक जपून ठेवा आणि अधिकृत वेबसाइटवर स्थिती तपासा",
    },
    "approved": {
        "en": "Approved. Check your bank passbook for the benefit",
        "hi": "मंज़ूर हुआ। लाभ के लिए अपनी बैंक पासबुक देखें",
        "mr": "मंजूर झाले. लाभासाठी तुमचे बँक पासबुक तपासा",
    },
    "rejected": {
        "en": "Ask at your nearest CSC or agriculture office why, and apply again if you are eligible",
        "hi": "नज़दीकी CSC या कृषि कार्यालय में कारण पूछें, और पात्र हों तो फिर से आवेदन करें",
        "mr": "जवळच्या CSC किंवा कृषी कार्यालयात कारण विचारा, आणि पात्र असल्यास पुन्हा अर्ज करा",
    },
}

_REMIND = {
    "title": {
        "en": "Apply for {name} by {date}",
        "hi": "{name} के लिए {date} तक आवेदन करें",
        "mr": "{name} साठी {date} पर्यंत अर्ज करा",
    },
    "today": {"en": "today", "hi": "आज", "mr": "आज"},
    "detail": {
        "en": "{n} days left. {next}",
        "hi": "{n} दिन बाकी। {next}",
        "mr": "{n} दिवस उरले. {next}",
    },
}


def _scheme(scheme_id: str) -> dict:
    s = next((s for s in schemes._load()["schemes"] if s["id"] == scheme_id), None)
    if s is None:
        raise ApiError(404, "unknown_scheme", "Unknown scheme")
    return s


def validate(scheme_id: str, body: ApplicationInput) -> dict:
    """Check an update against the scheme and privacy rules; return what to store."""
    s = _scheme(scheme_id)
    if any(i >= len(s["documents"]) for i in body.docs_ready):
        raise ApiError(400, "invalid_request", "Invalid fields: docsReady")
    if body.reference_no and pii.find_pii(body.reference_no):
        # An Aadhaar, PAN, phone or account number doesn't belong here; the application number does.
        raise ApiError(400, "reference_is_personal_id",
                       "That looks like a personal ID number. Enter the application or reference number instead.")
    data = body.model_dump(by_alias=True, mode="json")
    data["note"] = pii.redact_text(data["note"]) if data.get("note") else None
    return data


def next_step(stored: dict, total_docs: int, lang: Lang) -> str:
    status = stored["status"]
    if status == "preparing":
        missing = total_docs - len(stored.get("docsReady") or [])
        return _NEXT["docs"][lang].format(n=missing) if missing > 0 else _NEXT["apply"][lang]
    return _NEXT[status][lang]


def view(stored: dict, lang: Lang) -> Application:
    s = _scheme(stored["schemeId"])
    docs = [schemes._load()["documents"][d][lang] for d in s["documents"]]
    return Application(
        scheme_id=s["id"],
        name=s["name"][lang],
        official_url=s["officialUrl"],
        status=stored["status"],
        documents=docs,
        docs_ready=stored.get("docsReady") or [],
        applied_on=stored.get("appliedOn"),
        reference_no=stored.get("referenceNo"),
        last_date=stored.get("lastDate"),
        note=stored.get("note"),
        next_step=next_step(stored, len(docs), lang),
        created_at=stored["createdAt"],
        updated_at=stored["updatedAt"],
    )


def ordered(apps: list[Application]) -> list[Application]:
    """Open applications first, nearest last date first; ties: most recently updated first."""
    apps = sorted(apps, key=lambda a: a.updated_at, reverse=True)
    return sorted(apps, key=lambda a: (a.status not in ("preparing", "applied"), a.last_date or date.max))


def reminders(stored: list[dict], lang: Lang, today: date) -> list[ActionItem]:
    out = []
    for st in stored:
        if st["status"] != "preparing" or not st.get("lastDate"):
            continue
        last = date.fromisoformat(st["lastDate"])
        left = (last - today).days
        if not 0 <= left <= REMIND_DAYS:
            continue
        app = view(st, lang)
        when = _REMIND["today"][lang] if left == 0 else last.strftime("%d-%m-%Y")
        out.append(ActionItem(
            id=f"apply-{app.scheme_id}",
            type="scheme",
            priority="high" if left <= 3 else "medium",
            source="calendar",
            route="/schemes",
            title=_REMIND["title"][lang].format(name=app.name, date=when),
            detail=_REMIND["detail"][lang].format(n=left, next=app.next_step),
        ))
    return out
