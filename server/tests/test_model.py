import io
import unittest
import wave
from unittest.mock import patch
import numpy as np
from server.model import NAMES, UniTalkerProvider, read_wav


def wav_bytes(seconds=1, rate=16000, channels=1):
    stream = io.BytesIO()
    with wave.open(stream, "wb") as output:
        output.setnchannels(channels); output.setsampwidth(2); output.setframerate(rate)
        output.writeframes(bytes(int(seconds * rate) * channels * 2))
    return stream.getvalue()


class AudioInputTest(unittest.TestCase):
    def test_decode_and_reject_invalid_audio(self):
        self.assertEqual(read_wav(wav_bytes()).shape, (16000,))
        for data in [b"not audio", wav_bytes(rate=22050), wav_bytes(channels=2),
                     wav_bytes(seconds=0.05), wav_bytes(seconds=61), wav_bytes()[:-10]]:
            with self.assertRaises(ValueError): read_wav(data)

    def test_channel_order_is_named_and_unique(self):
        self.assertEqual(len(NAMES), 51)
        self.assertEqual(len(set(NAMES)), 51)
        self.assertEqual(NAMES[19], "jawOpen")

    def test_windowing_preserves_length_and_silence_closes_mouth(self):
        class Session:
            def get_providers(self): return ["test"]
            def run(self, names, inputs):
                return [np.full((1, int(inputs["time_steps"][0]), 51), 0.5, dtype=np.float32)]
        model = UniTalkerProvider(); model.session = Session()
        result = model.predict(np.zeros(16000 * 5 + 100, dtype=np.float32))
        self.assertEqual(len(result["frames"]), 151)
        self.assertLess(result["frames"][-1]["timeMs"], result["durationMs"])
        self.assertTrue(all(f["weights"]["jawOpen"] == 0 for f in result["frames"]))
        self.assertEqual(result["missingChannels"], ["tongueOut"])

    def test_model_failure_is_not_replaced_by_fake_animation(self):
        class Session:
            def run(self, *args): raise RuntimeError("broken model")
        model = UniTalkerProvider(); model.session = Session()
        with self.assertRaisesRegex(RuntimeError, "broken model"):
            model.predict(np.zeros(16000, dtype=np.float32))


if __name__ == "__main__": unittest.main()
