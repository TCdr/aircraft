"""Generates the GPWS voice clips that the FlyByWire sound bank does not have, AVOID TERRAIN and AVOID OBSTACLE, in the
voice of the bank's own GPWS words.

The word AVOID is said by the Piper text-to-speech engine with the en_US-bryce-medium voice (public domain), then turned
into the voice of the bank's GPWS words by the Seed-VC voice converter (GPL-3.0), which takes the bank words themselves
as its voice reference. It is given the loudspeaker tone and the loudness of the bank words and joined to the bank's own
TERRAIN and OBSTACLE recordings.

Usage, with the Python of a Seed-VC environment (its requirements, plus numpy, soundfile and librosa):
  python generate.py --piper <piper executable> --voice <en_US-bryce-medium.onnx> --seed-vc <Seed-VC checkout>
                     --vgmstream <vgmstream-cli executable> [--banks <folder>] [--avoid <converted AVOID wav>]
                     [--out <folder>]

--banks is the folder of the A32NX sound banks (FBW_A320_NEO_*.PC.PCK): the large-files submodule by default, or an
installed package's sound folder.

Writes sound/gpws_avoid_terrain.wav and sound/gpws_avoid_obstacle.wav into the A32NX sound folder (or --out). Seed-VC
gives a different AVOID on every run: listen before replacing the committed clips. --avoid joins an AVOID converted
before, which rebuilds the committed clips exactly.
"""

import argparse
import os
import struct
import subprocess
import sys
import tempfile

import librosa
import numpy as np
import soundfile as sf

REPO = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
A32NX_SOUND_DIR = os.path.join(
    REPO, 'fbw-a32nx', 'src', 'base', 'flybywire-aircraft-a320-neo', 'SimObjects', 'AirPlanes', 'FlyByWire_A320_NEO',
    'sound')
BANKS = ['FBW_A320_NEO_1.PC.PCK', 'FBW_A320_NEO_2.PC.PCK', 'FBW_A320_NEO_3.PC.pck']
LARGE_FILES_SOUND_DIR = os.path.join(
    REPO, 'large-files', 'fbw-a32nx', 'src', 'base', 'flybywire-aircraft-a320-neo', 'SimObjects', 'AirPlanes',
    'FlyByWire_A320_NEO', 'sound')

RATE = 48000

# Media ids of the bank's GPWS words (found by transcribing the bank's short clips)
TERRAIN = 657372572
OBSTACLE = 274929881
# The voice reference of the converter: PULL UP, TERRAIN AHEAD, TOO LOW TERRAIN, DON'T SINK, TOO LOW GEAR, TOO LOW FLAPS,
# GLIDESLOPE
REFERENCE_WORDS = [178403563, 505133233, 3301749, 296584154, 867272646, 981123248, 138820988]

CLIPS = {'avoid_terrain': TERRAIN, 'avoid_obstacle': OBSTACLE}

# Design choice: the pause between AVOID and the bank word, chosen by ear
GAP_S = 0.05

# Design choice: the clips are made 10 dB louder than the bank words, a limiter holding their peaks at -1 dBFS. At the
# level of the bank words they sound much quieter in the sim than the bank's GPWS words: the sound bank's events are
# played louder than the Wave Data slots these clips go through.
LOUDER_DB = 10
PEAK_DBFS = -1

# The EGPWC starts the warning words again every 1.5 s (alert_logic.rs WARNING_REPEAT): a longer clip would be cut by
# its own repeat.
MAX_LENGTH_S = 1.4


def read_banks(sound_dir: str) -> dict[int, tuple[str, int]]:
    """Unpacks the Wwise packages into their sound banks; returns each media id with its bank file and subsong."""
    media = {}
    out = tempfile.mkdtemp()
    for name in BANKS:
        data = open(os.path.join(sound_dir, name), 'rb').read()
        _, lang_size, bank_lut_size = struct.unpack_from('<III', data, 8)
        lut = 28 + lang_size
        count = struct.unpack_from('<I', data, lut)[0]
        for i in range(count):
            bank_id, block, size, start, _ = struct.unpack_from('<IIIII', data, lut + 4 + 20 * i)
            path = os.path.join(out, f'{bank_id}.bnk')
            bank = data[start * block:start * block + size]
            with open(path, 'wb') as f:
                f.write(bank)
            pos = 0
            while pos + 8 <= len(bank):
                tag, chunk_size = bank[pos:pos + 4], struct.unpack_from('<I', bank, pos + 4)[0]
                if tag == b'DIDX':
                    for subsong, entry in enumerate(range(pos + 8, pos + 8 + chunk_size, 12), start=1):
                        media[struct.unpack_from('<I', bank, entry)[0]] = (path, subsong)
                pos += 8 + chunk_size
    return media


def decode(vgmstream: str, media: dict[int, tuple[str, int]], media_id: int, tmp: str) -> np.ndarray:
    bank, subsong = media[media_id]
    path = os.path.join(tmp, f'{media_id}.wav')
    subprocess.run([vgmstream, '-s', str(subsong), '-o', path, bank], check=True, capture_output=True)
    data, rate = sf.read(path)
    assert rate == RATE
    return trim(data.mean(axis=1) if data.ndim > 1 else data)


def trim(x: np.ndarray, rel_db: float = -34) -> np.ndarray:
    win = int(0.01 * RATE)
    env = np.convolve(np.abs(x), np.ones(win) / win, mode='same')
    loud = np.nonzero(env > env.max() * 10 ** (rel_db / 20))[0]
    return fade(x[max(0, loud[0] - win):loud[-1] + 2 * win])


def fade(x: np.ndarray, s: float = 0.008) -> np.ndarray:
    n = int(s * RATE)
    x = x.copy()
    x[:n] *= np.linspace(0, 1, n)
    x[-n:] *= np.linspace(1, 0, n)
    return x


def smoothed_spectrum(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Long-term power spectrum, averaged over a third of an octave"""
    frames = [x[i:i + 2048] * np.hanning(2048) for i in range(0, len(x) - 2048, 512)]
    power = np.mean([np.abs(np.fft.rfft(f)) ** 2 for f in frames], axis=0)
    freqs = np.fft.rfftfreq(2048, 1 / RATE)
    smooth = np.array([power[(freqs > f / 2 ** (1 / 6)) & (freqs < f * 2 ** (1 / 6))].mean() if f > 0 else power[0]
                       for f in freqs])
    return freqs, smooth


def match_tone(x: np.ndarray, reference: np.ndarray) -> np.ndarray:
    """The loudspeaker tone of the bank words, as an equalizer from the difference of the two spectra"""
    freqs, wanted = smoothed_spectrum(reference)
    _, actual = smoothed_spectrum(x)
    gain_db = 10 * np.log10(wanted / actual)
    gain_db -= np.median(gain_db[(freqs > 300) & (freqs < 3000)])
    curve = np.interp(np.fft.rfftfreq(len(x), 1 / RATE), freqs, 10 ** (np.clip(gain_db, -18, 12) / 20))
    return np.fft.irfft(np.fft.rfft(x) * curve, len(x))


def louder(x: np.ndarray) -> np.ndarray:
    """Raises the level by LOUDER_DB; a limiter that looks 5 ms ahead keeps the peaks at PEAK_DBFS"""
    y = x * 10 ** (LOUDER_DB / 20)
    limit = 10 ** (PEAK_DBFS / 20)
    win = int(0.005 * RATE)
    padded = np.pad(np.abs(y), win)
    envelope = np.lib.stride_tricks.sliding_window_view(padded, 2 * win + 1).max(axis=1)
    gain = np.minimum(1.0, limit / np.maximum(envelope, 1e-9))
    # smoothed, so the gain does not jump; the window of the maximum above is wider, so the peaks stay limited
    gain = np.convolve(np.pad(gain, win, mode='edge'), np.ones(win) / win, mode='same')[win:-win]
    return np.clip(y * gain, -limit, limit)


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(x ** 2)))


def convert_avoid(args, reference_path: str, tmp: str) -> np.ndarray:
    source = os.path.join(tmp, 'avoid_source.wav')
    subprocess.run([args.piper, '-m', args.voice, '-f', source, '-q'], input=b'Avoid', check=True, capture_output=True)
    subprocess.run([sys.executable, 'inference.py', '--source', source, '--target', reference_path, '--output', tmp,
                    '--diffusion-steps', '40', '--length-adjust', '1.0', '--inference-cfg-rate', '0.7',
                    '--f0-condition', 'True', '--auto-f0-adjust', 'True', '--semi-tone-shift', '0'],
                   cwd=args.seed_vc, check=True, capture_output=True)
    converted = next(os.path.join(tmp, f) for f in os.listdir(tmp) if f.startswith('vc_'))
    data, rate = sf.read(converted)
    return librosa.resample(data if data.ndim == 1 else data.mean(axis=1), orig_sr=rate, target_sr=RATE)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--piper', required=True)
    parser.add_argument('--voice', required=True)
    parser.add_argument('--seed-vc', required=True)
    parser.add_argument('--vgmstream', required=True)
    parser.add_argument('--banks', default=LARGE_FILES_SOUND_DIR)
    parser.add_argument('--avoid')
    parser.add_argument('--out', default=A32NX_SOUND_DIR)
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        media = read_banks(args.banks)
        if args.avoid:
            avoid, _ = sf.read(args.avoid)
        else:
            reference_words = [decode(args.vgmstream, media, word, tmp) for word in REFERENCE_WORDS]
            pause = np.zeros(int(0.25 * RATE))
            reference = np.concatenate([np.concatenate([word, pause]) for word in reference_words])
            reference_path = os.path.join(tmp, 'reference.wav')
            sf.write(reference_path, reference, RATE)
            avoid = trim(match_tone(convert_avoid(args, reference_path, tmp), reference))
            avoid *= np.mean([rms(word) for word in reference_words]) / rms(avoid)

        for name, ending_id in CLIPS.items():
            clip = np.concatenate([avoid, np.zeros(int(GAP_S * RATE)), decode(args.vgmstream, media, ending_id, tmp)])
            clip = louder(clip)
            length = len(clip) / RATE
            if length > MAX_LENGTH_S:
                sys.exit(f'{name}: {length:.2f} s, longer than {MAX_LENGTH_S} s')
            sf.write(os.path.join(args.out, f'gpws_{name}.wav'), np.stack([clip, clip], axis=1), RATE,
                     subtype='PCM_16')
            print(f'{name:16} {length:.2f} s, {20 * np.log10(rms(clip)):.1f} dBFS RMS')


if __name__ == '__main__':
    main()
