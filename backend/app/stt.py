"""Speech to text behind one `transcribe(audio, lang)` call, so the engine can be swapped.

Default: Gemma 4's own audio input (ARTH_STT_BACKEND=gemma). Measured live on
E2B: ~0.5 s per clip once warm, no extra download, same model as everything else.
Fallback: faster-whisper on CPU (ARTH_STT_BACKEND=whisper), downloaded on first use.

Audio is decoded in memory with PyAV; nothing touches disk.
"""

import asyncio
import base64
import io
import logging
import wave

from fastapi.concurrency import run_in_threadpool

from .errors import ApiError

log = logging.getLogger("arth.stt")
SAMPLE_RATE = 16_000
LANG_NAMES = {"en": "English", "hi": "Hindi", "mr": "Marathi"}


def to_wav16k(raw: bytes, max_seconds: float) -> bytes:
    """Any browser recording (webm/ogg/mp4/wav) -> 16 kHz mono 16-bit WAV, in memory."""
    import av  # installed with faster-whisper; imported lazily like the rest of the audio stack

    pcm = bytearray()
    try:
        with av.open(io.BytesIO(raw)) as container:
            resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
            for frame in container.decode(audio=0):
                for out in resampler.resample(frame):
                    pcm += bytes(out.planes[0])[: out.samples * 2]
                    if len(pcm) > max_seconds * SAMPLE_RATE * 2:
                        raise ApiError(400, "audio_too_long", "Please keep the recording under 15 seconds.")
    except ApiError:
        raise
    except Exception:  # PyAV raises many error types for corrupt input
        raise ApiError(415, "unsupported_audio", "This recording could not be played.") from None
    if len(pcm) < 0.3 * SAMPLE_RATE * 2:
        raise ApiError(400, "audio_too_short", "The recording is too short. Please speak again.")
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(bytes(pcm))
    return out.getvalue()


class GemmaSTT:
    def __init__(self, llm, max_seconds: float, timeout_s: float = 8.0):
        self._llm = llm
        self._max_seconds = max_seconds
        self._timeout = timeout_s  # leaves room for the intent call inside the frontend's 20 s

    async def load(self) -> None:
        return None  # the LLM warm-up loads the model, audio included

    async def transcribe(self, audio_bytes: bytes, lang: str) -> str:
        wav = await run_in_threadpool(to_wav16k, audio_bytes, self._max_seconds)
        return await self._llm.transcribe(base64.b64encode(wav).decode(), LANG_NAMES.get(lang, lang), self._timeout)


class WhisperSTT:
    def __init__(self, model_name: str, device: str, compute_type: str, max_seconds: float):
        self._name, self._device, self._compute = model_name, device, compute_type
        self._max_seconds = max_seconds
        self._model = None
        self._loading: asyncio.Task | None = None
        self._lock = asyncio.Lock()  # one CPU transcription at a time is fastest overall

    def _load(self):
        from faster_whisper import WhisperModel  # heavy import, only when STT is used
        return WhisperModel(self._name, device=self._device, compute_type=self._compute)

    async def _load_once(self) -> None:
        try:
            self._model = await run_in_threadpool(self._load)
            log.info("whisper model %s loaded", self._name)
        except Exception:
            log.error("whisper model %s failed to load (first use downloads it)", self._name)

    def _start_loading(self) -> asyncio.Task:
        if self._loading is None or (self._loading.done() and self._model is None):
            self._loading = asyncio.create_task(self._load_once())
        return self._loading

    async def load(self) -> None:
        """Load (downloading on first use) in the background; called at startup."""
        if self._model is None:
            await asyncio.shield(self._start_loading())

    def _run(self, audio_bytes: bytes, lang: str) -> str:
        from faster_whisper import decode_audio
        try:
            audio = decode_audio(io.BytesIO(audio_bytes), sampling_rate=SAMPLE_RATE)
        except Exception:  # PyAV raises many error types for corrupt input
            raise ApiError(415, "unsupported_audio", "This recording could not be played.") from None
        if len(audio) > self._max_seconds * SAMPLE_RATE:
            raise ApiError(400, "audio_too_long", "Please keep the recording under 15 seconds.")
        if len(audio) < 0.3 * SAMPLE_RATE:
            raise ApiError(400, "audio_too_short", "The recording is too short. Please speak again.")
        segments, _ = self._model.transcribe(audio, language=lang, beam_size=2, vad_filter=True,
                                             condition_on_previous_text=False)
        return " ".join(s.text.strip() for s in segments).strip()

    async def transcribe(self, audio_bytes: bytes, lang: str) -> str:
        # Never make a farmer wait on a model download: answer at once and keep
        # loading in the background (live finding: a request hung for minutes).
        if self._model is None:
            self._start_loading()
            raise ApiError(503, "stt_loading", "Voice input is getting ready. Please try again in a minute.")
        async with self._lock:
            return await run_in_threadpool(self._run, audio_bytes, lang)
