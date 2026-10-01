"""UniTalker ONNX provider. Model tensor order stays out of the avatar protocol.

The checkpoint and tensor order come from dlp3d-ai/audio2face (see notices).
Inference uses neutral conditioning (10). JEV owns intentional emotion.
"""
import io
import json
import math
import os
from pathlib import Path
import threading
import time
import wave

import numpy as np
import onnxruntime as ort

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = Path(os.environ.get("REALPET_MODEL_PATH", ROOT / "models/unitalker_v0.4.0_base.onnx"))
NAMES = [name[0].lower() + name[1:] for name in json.loads(
    (Path(__file__).parent / "unitalker_channels.json").read_text())]
SAMPLE_RATE = 16000
FPS = 30
MAX_SECONDS = 60


def read_wav(data: bytes) -> np.ndarray:
    try:
        with wave.open(io.BytesIO(data)) as source:
            if (source.getnchannels(), source.getsampwidth(), source.getframerate()) != (1, 2, SAMPLE_RATE):
                raise ValueError("Expected mono 16-bit PCM WAV at 16000 Hz")
            frames = source.getnframes()
            if not SAMPLE_RATE // 10 <= frames <= SAMPLE_RATE * MAX_SECONDS:
                raise ValueError("Audio must be between 0.1 and 60 seconds")
            pcm = source.readframes(frames)
            if len(pcm) != frames * 2:
                raise ValueError("Truncated WAV audio")
        return np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
    except (wave.Error, EOFError) as error:
        raise ValueError("Invalid PCM WAV audio") from error


class UniTalkerProvider:
    def __init__(self):
        self.session = None
        self.lock = threading.Lock()

    def load(self):
        if self.session is not None:
            return
        if not MODEL_PATH.is_file():
            raise FileNotFoundError("Model missing. Run npm run model:setup")
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        options.log_severity_level = 3
        requested = os.environ.get("REALPET_MODEL_DEVICE", "cuda")
        providers = ["CPUExecutionProvider"]
        if requested == "cuda":
            ort.preload_dlls(directory="")
            providers.insert(0, "CUDAExecutionProvider")
        self.session = ort.InferenceSession(str(MODEL_PATH), sess_options=options, providers=providers)

    def health(self):
        return {
            "provider": "unitalker-onnx-v0.4.0", "installed": MODEL_PATH.is_file(),
            "loaded": self.session is not None,
            "device": self.session.get_providers()[0] if self.session else "not loaded",
            "channels": len(NAMES), "schema": "arkit-52-v1",
            "maxSeconds": MAX_SECONDS, "sampleRate": SAMPLE_RATE,
        }

    def predict(self, audio: np.ndarray):
        with self.lock:
            self.load()
            started = time.perf_counter()
            duration_ms = len(audio) / SAMPLE_RATE * 1000
            n_frames = math.ceil(len(audio) * FPS / SAMPLE_RATE)
            result = np.zeros((n_frames, len(NAMES)), dtype=np.float32)
            # Four-second blocks with 400 ms of left/right context. This bounds
            # WavLM attention memory while preserving surrounding articulation.
            block_samples = 4 * SAMPLE_RATE
            context = int(0.4 * SAMPLE_RATE)
            for start in range(0, len(audio), block_samples):
                end = min(len(audio), start + block_samples)
                left, right = max(0, start - context), min(len(audio), end + context)
                window = audio[left:right]
                if len(window) < 8512:
                    window = np.pad(window, (0, 8512 - len(window)))
                window = (window - window.mean()) / np.sqrt(window.var() + 1e-7)
                count = int(len(window) * FPS / SAMPLE_RATE)
                output = self.session.run(None, {
                    "audio": window.reshape(1, -1).astype(np.float32),
                    "emo_id": np.array([10], dtype=np.int32),
                    "time_steps": np.array([count], dtype=np.int32),
                })[0][0]
                if output.shape != (count, len(NAMES)) or not np.isfinite(output).all():
                    raise RuntimeError("Model returned invalid blendshape output")
                first = round(start * FPS / SAMPLE_RATE)
                last = min(n_frames, math.ceil(end * FPS / SAMPLE_RATE))
                offset = round((start - left) * FPS / SAMPLE_RATE)
                indices = np.minimum(np.arange(last - first) + offset, count - 1)
                result[first:last] = np.clip(output[indices], 0, 1)

            # Silence gating is amplitude-only, not phoneme/vowel detection.
            # It prevents the network's resting bias from opening a silent mouth.
            mouth_indices = [i for i, name in enumerate(NAMES) if name.startswith(("mouth", "jaw"))]
            for i in range(n_frames):
                center = round(i * SAMPLE_RATE / FPS)
                segment = audio[max(0, center - 640):min(len(audio), center + 640)]
                rms = float(np.sqrt(np.mean(segment ** 2))) if len(segment) else 0
                gate = float(np.clip((rms - 0.002) / 0.01, 0, 1))
                result[i, mouth_indices] *= gate

            return {
                "schema": "arkit-52-v1", "fps": FPS, "durationMs": duration_ms,
                "provider": "unitalker-onnx-v0.4.0", "device": self.health()["device"],
                "inferenceMs": round((time.perf_counter() - started) * 1000),
                "conditioning": "neutral", "missingChannels": ["tongueOut"],
                "frames": [{"timeMs": round(i * 1000 / FPS, 4),
                            "weights": {name: round(float(value), 5) for name, value in zip(NAMES, row)}}
                           for i, row in enumerate(result)],
            }
