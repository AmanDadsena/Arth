"""Speech to text behind one function, so the engine can be swapped.

Default: faster-whisper on CPU (int8). It keeps the GPU free for Gemma and
avoids CUDA DLL setup on Windows. Audio is decoded in memory with PyAV
(bundled with faster-whisper); nothing touches disk.
"""

import asyncio
import io
import logging

from fastapi.concurrency import run_in_threadpool

from .errors import ApiError

log = logging.getLogger("arth.stt")
SAMPLE_RATE = 16_000


class WhisperSTT:
    def __init__(self, model_name: str, device: str, compute_type: str, max_seconds: float):
        self._name, self._device, self._compute = model_name, device, compute_type
        self._max_seconds = max_seconds
        self._model = None
        self._lock = asyncio.Lock()  # one CPU transcription at a time is fastest overall

    def _load(self):
        from faster_whisper import WhisperModel  # heavy import, only when STT is used
        return WhisperModel(self._name, device=self._device, compute_type=self._compute)

    async def load(self) -> None:
        if self._model is None:
            self._model = await run_in_threadpool(self._load)

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
        async with self._lock:
            try:
                await self.load()
            except Exception:
                log.error("whisper model failed to load")
                raise ApiError(503, "stt_unavailable", "Voice input is not ready. Please type instead.") from None
            return await run_in_threadpool(self._run, audio_bytes, lang)
