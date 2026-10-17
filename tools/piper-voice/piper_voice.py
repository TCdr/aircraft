"""The Piper text-to-speech steps shared by the voice clip generators (tools/fws-voice and tools/raas-voice): synthesize
a text, give it the sound of a flight deck loudspeaker, trim and normalize it, and write it as a 16-bit mono WAV file.
"""

import re
import subprocess
import wave

import numpy as np

LENGTH_SCALE = '0.9'
PEAK_DBFS = -3.0
SILENCE_THRESHOLD = 0.02
FADE_S = 0.005
HIGH_PASS_HZ = 150


def snake(word: str) -> str:
    return re.sub(r'([A-Z])', r'_\1', word).lower()


def synthesize(piper: str, model: str, text: str, path: str) -> None:
    subprocess.run([piper, '-m', model, '-f', path, '--length_scale', LENGTH_SCALE, '-q'], input=text.encode(),
                   check=True, capture_output=True)


def read(path: str) -> tuple[np.ndarray, int]:
    with wave.open(path, 'rb') as w:
        rate = w.getframerate()
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
    return data, rate


def process(data: np.ndarray, rate: int) -> np.ndarray:
    # High-pass (first order): the thin sound of a flight deck loudspeaker
    rc = 1 / (2 * np.pi * HIGH_PASS_HZ)
    alpha = rc / (rc + 1 / rate)
    out = np.empty_like(data)
    prev_x = prev_y = 0.0
    for i, x in enumerate(data):
        prev_y = alpha * (prev_y + x - prev_x)
        prev_x = x
        out[i] = prev_y
    loud = np.nonzero(np.abs(out) > SILENCE_THRESHOLD * np.max(np.abs(out)))[0]
    out = out[max(0, loud[0] - int(0.01 * rate)):loud[-1] + int(0.02 * rate)]
    fade = int(FADE_S * rate)
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade:] *= np.linspace(1, 0, fade)
    return out / np.max(np.abs(out)) * 10 ** (PEAK_DBFS / 20)


def write(path: str, data: np.ndarray, rate: int) -> None:
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((data * 32767).astype(np.int16).tobytes())
