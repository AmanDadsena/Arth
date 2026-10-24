"""Scheme eligibility: a small rules engine over data/schemes.json.

Deliberately not the model: eligibility must be explainable and repeatable,
so every result carries the rule's own reason text.
"""

import json
from functools import cache
from pathlib import Path

from ..schemas import Lang, SchemeAnswers, SchemeMatch, SchemeResult

DATA = Path(__file__).resolve().parent.parent / "data" / "schemes.json"

_OPS = {
    "eq": lambda a, b: a == b,
    "ne": lambda a, b: a != b,
    "in": lambda a, b: a in b,
    "not_in": lambda a, b: a not in b,
    "gt": lambda a, b: a > b,
    "gte": lambda a, b: a >= b,
    "lt": lambda a, b: a < b,
    "lte": lambda a, b: a <= b,
}


@cache
def _load() -> dict:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    fields = set(SchemeAnswers.model_fields) | {f.alias for f in SchemeAnswers.model_fields.values() if f.alias}
    # Validate once at load so a typo in the JSON fails loudly, not silently.
    problems = []
    for s in data["schemes"]:
        if not s["checks"] or s["checks"][-1]["when"] != []:
            problems.append(f"{s['id']}: last check must be the default")
        for check in s["checks"]:
            for cond in check["when"]:
                if cond["op"] not in _OPS:
                    problems.append(f"{s['id']}: unknown op {cond['op']}")
                if cond["field"] not in fields:
                    problems.append(f"{s['id']}: unknown field {cond['field']}")
        problems += [f"{s['id']}: unknown document {d}" for d in s["documents"] if d not in data["documents"]]
    if problems:
        raise ValueError("schemes.json: " + "; ".join(problems))
    return data


def scheme_ids() -> set[str]:
    return {s["id"] for s in _load()["schemes"]}


def _holds(cond: dict, answers: dict) -> bool:
    return _OPS[cond["op"]](answers[cond["field"]], cond["value"])


def match(answers: SchemeAnswers, lang: Lang) -> SchemeMatch:
    data = _load()
    values = answers.model_dump(by_alias=True)
    results = []
    for s in data["schemes"]:
        check = next(c for c in s["checks"] if all(_holds(w, values) for w in c["when"]))
        results.append(SchemeResult(
            id=s["id"],
            name=s["name"][lang],
            eligible=check["eligible"],
            reasons=[check["reason"][lang]],
            benefit=s["benefit"][lang],
            documents=[data["documents"][d][lang] for d in s["documents"]],
            official_url=s["officialUrl"],
        ))
    results.sort(key=lambda r: not r.eligible)  # stable: eligible first, file order kept
    return SchemeMatch(schemes=results)
