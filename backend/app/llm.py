"""The only module that talks to the model (Gemma 4 via a local Ollama).

- Structured output: every call passes a JSON schema in Ollama's `format`,
  and the reply is validated with Pydantic; one retry with the error appended.
- A semaphore caps concurrent generations so one laptop GPU is not thrashed.
- `keep_alive` keeps the model resident; a warm-up call runs at startup.
- Prompts live in app/prompts/*.txt so they can be read and explained.
- Nothing personal is sent: callers pass media, crop, language and numbers only.
"""

import asyncio
import json
import logging
import time
from functools import cache
from pathlib import Path
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from .errors import ApiError

log = logging.getLogger("arth.llm")
PROMPTS = Path(__file__).parent / "prompts"
LANG_NAMES = {"en": "English", "hi": "Hindi (Devanagari script)", "mr": "Marathi (Devanagari script)"}

T = TypeVar("T", bound=BaseModel)


@cache
def prompt(name: str) -> str:
    text = (PROMPTS / f"{name}.txt").read_text(encoding="utf-8")
    # Lines starting with '#' document the prompt for humans; the model never sees them.
    return "\n".join(line for line in text.splitlines() if not line.startswith("#")).strip()


class LLM:
    def __init__(self, http: httpx.AsyncClient, base_url: str, model: str, *, label: str,
                 timeout_s: float, max_concurrency: int, num_ctx: int):
        self._http = http
        self._url = base_url.rstrip("/") + "/api/chat"
        self.model = model
        self.label = label  # shown to farmers as "Analyzed by ..."
        self._timeout = timeout_s
        self._num_ctx = num_ctx
        self._sem = asyncio.Semaphore(max_concurrency)

    async def _chat(self, messages: list[dict], schema: dict | None, temperature: float,
                    deadline: float) -> str:
        body = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "keep_alive": "30m",
            "think": False,  # extraction wants the answer, not a reasoning trace
            "options": {"temperature": temperature, "num_ctx": self._num_ctx},
        }
        if schema is not None:
            body["format"] = schema
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ApiError(504, "ai_timeout", "The assistant took too long. Please try again.")
        try:
            async with asyncio.timeout(remaining):
                async with self._sem:
                    r = await self._http.post(self._url, json=body, timeout=remaining)
        except TimeoutError:
            raise ApiError(504, "ai_timeout", "The assistant took too long. Please try again.") from None
        except httpx.HTTPError:
            raise ApiError(503, "ai_unavailable", "The assistant is not running. Please try again.") from None
        if r.status_code != 200:
            log.warning("ollama returned %d", r.status_code)
            raise ApiError(503, "ai_unavailable", "The assistant is not ready. Please try again.")
        return r.json().get("message", {}).get("content", "")

    async def structured(self, name: str, out: type[T], *, user_text: str,
                         images: list[str] | None = None, temperature: float = 0.1) -> T:
        """Run prompt `name` with optional images; return a validated `out`."""
        deadline = time.monotonic() + self._timeout
        user: dict = {"role": "user", "content": user_text}
        if images:
            user["images"] = images
        messages = [{"role": "system", "content": prompt(name)}, user]
        schema = out.model_json_schema()
        started = time.perf_counter()
        for attempt in (1, 2):
            raw = await self._chat(messages, schema, temperature, deadline)
            try:
                result = out.model_validate_json(raw)
                log.info("llm %s ok in %.0fms (attempt %d)", name, (time.perf_counter() - started) * 1000, attempt)
                return result
            except ValidationError as e:
                # Log field locations only: the raw output may quote the document.
                log.warning("llm %s invalid output: %s", name, [err["loc"] for err in e.errors()][:5])
                messages = [
                    *messages,
                    {"role": "assistant", "content": raw[:4000]},
                    {"role": "user", "content": "That JSON did not match the schema: "
                     + json.dumps([{"loc": err["loc"], "msg": err["msg"]} for err in e.errors()][:10])
                     + ". Reply again with only corrected JSON."},
                ]
        raise ApiError(502, "ai_bad_output", "The assistant could not read this clearly. Please try again.")

    async def ready(self) -> bool:
        try:
            r = await self._http.post(self._url.replace("/api/chat", "/api/show"),
                                      json={"model": self.model}, timeout=2.0)
            return r.status_code == 200
        except httpx.HTTPError:
            return False

    async def warm_up(self) -> None:
        """Load the model into memory so the first farmer request isn't slow."""
        try:
            await self._http.post(self._url, timeout=120.0, json={
                "model": self.model, "messages": [{"role": "user", "content": "ok"}],
                "stream": False, "keep_alive": "30m", "options": {"num_predict": 1},
            })
        except httpx.HTTPError:
            log.warning("model warm-up failed; is Ollama running?")
