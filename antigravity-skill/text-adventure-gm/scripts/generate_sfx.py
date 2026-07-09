#!/usr/bin/env python3
"""
Generate license-free UI sound effects for the Text Adventure Engine.

These are synthesized from scratch with the Python standard library, so they are
100% free of any license restrictions — you may ship and modify them freely.
Run this once to populate the `sfx/` folder next to the skill:

    python scripts/generate_sfx.py

Replace any of them with higher-quality CC0 sounds (e.g. from kenney.nl) by
dropping a file with the same name into the `sfx/` folder.
"""
import math
import os
import struct
import wave

SAMPLE_RATE = 44100
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "sfx")


def _write_wav(name, samples):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    # clamp & convert to 16-bit PCM
    frames = bytearray()
    for s in samples:
        v = max(-1.0, min(1.0, s))
        frames += struct.pack("<h", int(v * 32767))
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(bytes(frames))
    print(f"  {name} ({len(samples)/SAMPLE_RATE:.2f}s)")


def _t(n):
    return n / SAMPLE_RATE


def _adsr(i, total, attack=0.01, release=0.1):
    """Simple attack/release envelope (0..1)."""
    t = _t(i)
    dur = _t(total)
    if t < attack:
        return t / attack
    if t > dur - release:
        return max(0.0, (dur - t) / release)
    return 1.0


def tone(freq, dur, vol=0.5, attack=0.01, release=0.08, wave_type="sine"):
    n = int(dur * SAMPLE_RATE)
    out = []
    for i in range(n):
        t = _t(i)
        if wave_type == "square":
            base = 1.0 if math.sin(2 * math.pi * freq * t) >= 0 else -1.0
        elif wave_type == "saw":
            base = 2.0 * ((freq * t) % 1.0) - 1.0
        else:
            base = math.sin(2 * math.pi * freq * t)
        out.append(base * vol * _adsr(i, n, attack, release))
    return out


def sweep(f0, f1, dur, vol=0.5, attack=0.01, release=0.1):
    n = int(dur * SAMPLE_RATE)
    out = []
    phase = 0.0
    for i in range(n):
        frac = i / n
        freq = f0 + (f1 - f0) * frac
        phase += 2 * math.pi * freq / SAMPLE_RATE
        out.append(math.sin(phase) * vol * _adsr(i, n, attack, release))
    return out


def noise_burst(dur, vol=0.5, decay=0.5):
    import random
    n = int(dur * SAMPLE_RATE)
    out = []
    for i in range(n):
        env = math.exp(-i / (decay * SAMPLE_RATE))
        out.append((random.uniform(-1, 1)) * vol * env)
    return out


def mix(*tracks):
    length = max(len(t) for t in tracks)
    out = [0.0] * length
    for t in tracks:
        for i, s in enumerate(t):
            out[i] += s
    return out


def concat(*tracks):
    out = []
    for t in tracks:
        out.extend(t)
    return out


def silence(dur):
    return [0.0] * int(dur * SAMPLE_RATE)


def main():
    print(f"Generating SFX into: {OUT_DIR}")

    # click/select: short high blip
    _write_wav("click.wav", tone(880, 0.06, vol=0.35, release=0.05, wave_type="square"))

    # dice: rattling noise burst
    _write_wav("dice.wav", concat(
        noise_burst(0.08, vol=0.4, decay=0.3),
        silence(0.02),
        noise_burst(0.06, vol=0.3, decay=0.25),
        tone(440, 0.05, vol=0.2),
    ))

    # success: rising two-tone chime
    _write_wav("success.wav", concat(
        tone(659, 0.12, vol=0.4),       # E5
        tone(988, 0.22, vol=0.45),      # B5
    ))

    # fail: descending buzz
    _write_wav("fail.wav", concat(
        tone(220, 0.14, vol=0.4, wave_type="saw"),
        tone(165, 0.22, vol=0.4, wave_type="saw"),
    ))

    # coin: classic two quick high tones
    _write_wav("coin.wav", concat(
        tone(988, 0.05, vol=0.35),      # B5
        tone(1319, 0.18, vol=0.4),      # E6
    ))

    # hit/damage: low noisy thud
    _write_wav("hit.wav", mix(
        noise_burst(0.12, vol=0.45, decay=0.12),
        tone(110, 0.12, vol=0.4, wave_type="square"),
    ))

    # levelup: ascending arpeggio
    _write_wav("levelup.wav", concat(
        tone(523, 0.10, vol=0.35),      # C5
        tone(659, 0.10, vol=0.35),      # E5
        tone(784, 0.10, vol=0.35),      # G5
        tone(1047, 0.28, vol=0.45),     # C6
    ))

    # magic: shimmering upward sweep
    _write_wav("magic.wav", mix(
        sweep(400, 1600, 0.4, vol=0.3),
        sweep(600, 2000, 0.4, vol=0.2, attack=0.05),
    ))

    print("Done. 8 sound effects generated.")


if __name__ == "__main__":
    main()
