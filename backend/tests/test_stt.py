import asyncio
import threading
import time

import pytest

from app.errors import ApiError
from app.stt import WhisperSTT


def test_transcribe_fails_fast_while_model_loads(monkeypatch):
    """Live finding: a voice request hung for minutes while Whisper downloaded."""
    release = threading.Event()
    stt = WhisperSTT("small", "cpu", "int8", 15.5)
    monkeypatch.setattr(stt, "_load", lambda: release.wait(5) and object())

    async def scenario():
        started = time.perf_counter()
        with pytest.raises(ApiError) as err:
            await stt.transcribe(b"audio", "mr")
        assert err.value.status == 503 and err.value.code == "stt_loading"
        assert time.perf_counter() - started < 0.5  # answered at once, not after the load
        first_task = stt._loading
        with pytest.raises(ApiError):
            await stt.transcribe(b"audio", "mr")
        assert stt._loading is first_task  # one background load, not one per request
        release.set()
        await first_task
        assert stt._model is not None

    asyncio.run(scenario())


def test_failed_load_is_retried_on_next_request(monkeypatch):
    calls = []

    def flaky():
        calls.append(1)
        if len(calls) == 1:
            raise OSError("network down")
        return object()

    stt = WhisperSTT("small", "cpu", "int8", 15.5)
    monkeypatch.setattr(stt, "_load", flaky)

    async def scenario():
        await stt.load()  # first attempt fails, logged, no exception
        assert stt._model is None
        with pytest.raises(ApiError):
            await stt.transcribe(b"audio", "mr")  # kicks off a retry
        await stt._loading
        assert stt._model is not None and len(calls) == 2

    asyncio.run(scenario())


# --- Gemma native audio ----------------------------------------------------------

import base64  # noqa: E402
import io  # noqa: E402
import math  # noqa: E402
import struct  # noqa: E402
import wave  # noqa: E402

from app.stt import GemmaSTT, to_wav16k  # noqa: E402


def tone_wav(seconds: float, rate: int = 22050) -> bytes:
    frames = b"".join(struct.pack("<h", int(8000 * math.sin(2 * math.pi * 440 * i / rate)))
                      for i in range(int(seconds * rate)))
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(frames)
    return out.getvalue()


def test_to_wav16k_resamples_to_16k_mono():
    wav = to_wav16k(tone_wav(2.0), 15.5)
    with wave.open(io.BytesIO(wav)) as w:
        assert (w.getframerate(), w.getnchannels(), w.getsampwidth()) == (16000, 1, 2)
        assert abs(w.getnframes() / 16000 - 2.0) < 0.1


@pytest.mark.parametrize(("audio", "code"), [
    (tone_wav(17.0), "audio_too_long"),
    (tone_wav(0.1), "audio_too_short"),
    (b"RIFF\x00\x00\x00\x00WAVEgarbage" * 10, "unsupported_audio"),
], ids=["too_long", "too_short", "corrupt"])  # short ids: the bytes would overflow a Windows env var
def test_to_wav16k_rejects(audio, code):
    with pytest.raises(ApiError) as err:
        to_wav16k(audio, 15.5)
    assert err.value.code == code


def test_gemma_stt_sends_16k_wav_and_language():
    seen = {}

    class FakeLLM:
        async def transcribe(self, wav_b64, lang_name, timeout_s):
            seen.update(wav=base64.b64decode(wav_b64), lang=lang_name, timeout=timeout_s)
            return "आज कांद्याचा भाव काय आहे"

    text = asyncio.run(GemmaSTT(FakeLLM(), 15.5).transcribe(tone_wav(1.0), "mr"))
    assert text == "आज कांद्याचा भाव काय आहे"
    assert seen["lang"] == "Marathi" and seen["timeout"] <= 10
    with wave.open(io.BytesIO(seen["wav"])) as w:
        assert w.getframerate() == 16000
