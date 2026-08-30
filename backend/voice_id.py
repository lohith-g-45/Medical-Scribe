"""
Voice-based speaker identification.

Produces a fixed-size embedding ("voiceprint") from a short audio clip using Resemblyzer's
pretrained speaker encoder, and compares embeddings via cosine similarity. Used to tell a
doctor's enrolled voice apart from a patient's, regardless of what either of them says or
which language they're speaking in — unlike text-content heuristics, this is acoustic, not
linguistic, so it works identically across languages.
"""

import io
import logging
from typing import List

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)


class VoiceIdentifier:
    def __init__(self):
        logger.info("Loading Resemblyzer voice encoder...")
        from resemblyzer import VoiceEncoder, preprocess_wav
        self._preprocess_wav = preprocess_wav
        self.encoder = VoiceEncoder()
        logger.info("✅ Voice encoder ready")

    def embed_from_bytes(self, audio_bytes: bytes) -> List[float]:
        """Compute a 256-dim speaker embedding from a WAV/PCM audio clip."""
        wav, sample_rate = sf.read(io.BytesIO(audio_bytes), dtype="float32", always_2d=False)
        if wav.ndim > 1:
            wav = wav.mean(axis=1)  # downmix to mono

        processed = self._preprocess_wav(wav, source_sr=sample_rate)
        embedding = self.encoder.embed_utterance(processed)
        return embedding.tolist()

    @staticmethod
    def cosine_similarity(a: List[float], b: List[float]) -> float:
        va = np.asarray(a, dtype=np.float32)
        vb = np.asarray(b, dtype=np.float32)
        denom = (np.linalg.norm(va) * np.linalg.norm(vb))
        if denom == 0:
            return 0.0
        return float(np.dot(va, vb) / denom)
