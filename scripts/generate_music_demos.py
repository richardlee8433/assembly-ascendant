from pathlib import Path
import math
import wave

import numpy as np


SR = 44100
RNG = np.random.default_rng(20260811)
OUT = Path(__file__).resolve().parents[1] / "public" / "audio"


def hz(note: int) -> float:
    return 440.0 * 2 ** ((note - 69) / 12)


def envelope(length: int, attack: float, release: float, sustain: float = 0.82) -> np.ndarray:
    env = np.full(length, sustain, dtype=np.float32)
    a = min(length, max(1, int(attack * SR)))
    r = min(length, max(1, int(release * SR)))
    env[:a] = np.linspace(0, sustain, a, dtype=np.float32)
    env[-r:] *= np.linspace(1, 0, r, dtype=np.float32)
    return env


def instrument(name: str, note: int, duration: float, velocity: float) -> np.ndarray:
    n = max(1, int(duration * SR))
    t = np.arange(n, dtype=np.float32) / SR
    f = hz(note)

    if name == "piano":
        sig = sum((1 / (k ** 1.35)) * np.sin(2 * np.pi * f * k * t + k * 0.13) for k in range(1, 7))
        sig *= np.exp(-t * (1.6 + f / 900))
        sig += RNG.normal(0, 0.025, n) * np.exp(-t * 38)
        env = envelope(n, 0.004, min(0.35, duration * 0.45), 1.0)
    elif name == "bell":
        ratios = (1, 2.01, 3.97, 5.43)
        sig = sum(np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * (1.2 + i * 0.8)) / (i + 1)
                  for i, ratio in enumerate(ratios))
        env = envelope(n, 0.003, min(0.6, duration * 0.7), 1.0)
    elif name == "strings":
        vibrato = 1 + 0.0023 * np.sin(2 * np.pi * 5.1 * t)
        phase = 2 * np.pi * f * np.cumsum(vibrato) / SR
        sig = np.zeros(n, dtype=np.float32)
        for detune, weight in ((-0.006, 0.34), (0, 0.45), (0.005, 0.34)):
            p = phase * (1 + detune)
            sig += weight * sum(np.sin(k * p) / k for k in range(1, 7))
        env = envelope(n, 0.55, 0.75, 0.72)
    elif name == "choir":
        vibrato = 1 + 0.0018 * np.sin(2 * np.pi * 4.7 * t)
        phase = 2 * np.pi * f * np.cumsum(vibrato) / SR
        sig = (0.7 * np.sin(phase) + 0.33 * np.sin(2 * phase) + 0.18 * np.sin(3 * phase)
               + 0.09 * np.sin(5 * phase))
        sig *= 0.85 + 0.15 * np.sin(2 * np.pi * 0.28 * t)
        env = envelope(n, 0.75, 0.9, 0.7)
    elif name == "brass":
        phase = 2 * np.pi * f * t
        bright = np.minimum(1, t / 0.16)
        sig = np.sin(phase)
        for k in range(2, 9):
            sig += bright * np.sin(k * phase + k * 0.04) / (k ** 0.82)
        sig = np.tanh(sig * 0.72)
        env = envelope(n, 0.09, 0.38, 0.8)
    elif name == "synth":
        phase = 2 * np.pi * f * t
        sig = 0.62 * np.sin(phase) + 0.25 * np.sin(2 * phase) + 0.12 * np.sin(3 * phase)
        sig += 0.13 * np.sin(phase * 0.5)
        env = envelope(n, 0.035, 0.3, 0.84)
    elif name == "bass":
        phase = 2 * np.pi * f * t
        sig = 0.83 * np.sin(phase) + 0.24 * np.sin(2 * phase) + 0.1 * np.sin(3 * phase)
        env = envelope(n, 0.018, 0.22, 0.9)
    elif name == "staccato":
        phase = 2 * np.pi * f * t
        sig = sum(np.sin(k * phase) / (k ** 1.15) for k in range(1, 6))
        sig *= np.exp(-t * 5.2)
        env = envelope(n, 0.008, min(0.16, duration * 0.5), 1.0)
    else:
        raise ValueError(name)
    return (sig * env * velocity).astype(np.float32)


def add_note(track: np.ndarray, at: float, duration: float, note: int, velocity: float,
             voice: str, pan: float = 0.0) -> None:
    sound = instrument(voice, note, duration, velocity)
    start = int(at * SR)
    end = min(len(track), start + len(sound))
    if start >= len(track) or end <= 0:
        return
    sound = sound[:end - start]
    left = math.sqrt((1 - pan) / 2)
    right = math.sqrt((1 + pan) / 2)
    track[start:end, 0] += sound * left
    track[start:end, 1] += sound * right


def add_kick(track: np.ndarray, at: float, velocity: float, cinematic: bool = False) -> None:
    duration = 0.62 if cinematic else 0.28
    n = int(duration * SR)
    t = np.arange(n, dtype=np.float32) / SR
    phase = 2 * np.pi * np.cumsum((118 if cinematic else 105) * np.exp(-t * 18) + 38) / SR
    sig = np.sin(phase) * np.exp(-t * (5.5 if cinematic else 12)) * velocity
    if cinematic:
        sig += RNG.normal(0, 0.08, n) * np.exp(-t * 8) * velocity
    add_mono(track, at, sig, 0)


def add_snare(track: np.ndarray, at: float, velocity: float, wide: bool = False) -> None:
    duration = 0.34 if wide else 0.18
    n = int(duration * SR)
    t = np.arange(n, dtype=np.float32) / SR
    noise = RNG.normal(0, 1, n).astype(np.float32)
    noise = np.concatenate(([0], np.diff(noise))).astype(np.float32)
    body = np.sin(2 * np.pi * 185 * t) * 0.32
    sig = (noise * 0.28 + body) * np.exp(-t * (10 if wide else 18)) * velocity
    add_mono(track, at, sig, 0.15)


def add_cymbal(track: np.ndarray, at: float, velocity: float, length: float = 1.8) -> None:
    n = int(length * SR)
    t = np.arange(n, dtype=np.float32) / SR
    noise = RNG.normal(0, 1, n).astype(np.float32)
    noise = np.concatenate(([0], np.diff(noise))).astype(np.float32)
    shimmer = sum(np.sin(2 * np.pi * f * t + RNG.random() * 6.28) for f in (4210, 5630, 6970, 8310))
    sig = (noise * 0.10 + shimmer * 0.035) * np.exp(-t * 2.2) * velocity
    add_mono(track, at, sig, -0.2)


def add_orchestral_impact(track: np.ndarray, at: float, velocity: float) -> None:
    duration = 1.8
    n = int(duration * SR)
    t = np.arange(n, dtype=np.float32) / SR
    low_phase = 2 * np.pi * np.cumsum(72 * np.exp(-t * 7) + 29) / SR
    low = np.sin(low_phase) * np.exp(-t * 2.7)
    metal = RNG.normal(0, 1, n).astype(np.float32)
    metal = np.concatenate(([0], np.diff(metal))).astype(np.float32) * np.exp(-t * 3.8)
    sig = (low * 0.9 + metal * 0.075) * velocity
    add_mono(track, at, sig, 0)


def add_riser(track: np.ndarray, at: float, duration: float, velocity: float) -> None:
    n = int(duration * SR)
    t = np.arange(n, dtype=np.float32) / SR
    noise = RNG.normal(0, 1, n).astype(np.float32)
    noise = np.concatenate(([0], np.diff(noise))).astype(np.float32)
    sweep = np.sin(2 * np.pi * (180 * t + 760 * (t ** 2) / max(duration, .01)))
    env = np.sin(np.linspace(0, np.pi / 2, n, dtype=np.float32)) ** 2
    sig = (noise * 0.055 + sweep * 0.08) * env * velocity
    add_mono(track, at, sig, -0.25)


def add_mono(track: np.ndarray, at: float, sig: np.ndarray, pan: float) -> None:
    start = int(at * SR)
    end = min(len(track), start + len(sig))
    if start >= len(track):
        return
    sig = sig[:end - start]
    track[start:end, 0] += sig * math.sqrt((1 - pan) / 2)
    track[start:end, 1] += sig * math.sqrt((1 + pan) / 2)


def space_reverb(dry: np.ndarray, amount: float) -> np.ndarray:
    wet = dry.copy()
    for delay, gain, cross in ((0.083, 0.22, False), (0.147, 0.16, True), (0.263, 0.11, False), (0.419, 0.075, True), (0.677, 0.045, False)):
        d = int(delay * SR)
        source = dry[:-d, ::-1] if cross else dry[:-d]
        wet[d:] += source * gain * amount
    return wet


CHORDS = [
    (50, 57, 61, 64),  # Dmaj9
    (50, 56, 59, 64),  # E/D, Lydian colour
    (47, 54, 57, 62),  # Bm7
    (43, 50, 54, 57),  # Gmaj7
]
THEME = [(0, 74, 1), (1, 76, 1), (2, 78, 2), (4, 81, 1.5), (5.5, 80, .5), (6, 78, 1), (7, 76, 1)]
ANSWER = [(0, 74, 1), (1, 71, 1), (2, 69, 2), (4, 66, 1), (5, 69, 1), (6, 71, 2)]


def melodic_scifi() -> tuple[np.ndarray, float]:
    bpm = 88
    beat = 60 / bpm
    bars = 28
    duration = bars * 4 * beat + 3.0
    mix = np.zeros((int(duration * SR), 2), dtype=np.float32)

    for bar in range(bars):
        at = bar * 4 * beat
        chord = CHORDS[bar % 4]
        section = 0 if bar < 4 else 1 if bar < 12 else 2 if bar < 20 else 3
        for i, note in enumerate(chord):
            add_note(mix, at, 4.35 * beat, note + 12, 0.035 + section * 0.008, "strings", (i - 1.5) * 0.22)
        if section >= 2:
            add_note(mix, at, 4.2 * beat, chord[0], 0.06, "choir", -0.08)
            add_note(mix, at, 4.2 * beat, chord[2], 0.045, "choir", 0.1)
        arp = (chord[0] + 24, chord[1] + 24, chord[2] + 24, chord[3] + 24,
               chord[2] + 24, chord[1] + 24, chord[3] + 24, chord[1] + 24)
        for eighth, note in enumerate(arp):
            voice = "bell" if section == 0 else "piano"
            add_note(mix, at + eighth * beat / 2, beat * (0.72 if voice == "piano" else 1.25), note,
                     0.042 + section * 0.006, voice, -0.35 + (eighth % 3) * 0.23)
        if section >= 1:
            for q in (0, 2):
                add_note(mix, at + q * beat, beat * 1.6, chord[0], 0.065, "bass", -0.05)
        if section >= 2:
            add_kick(mix, at, 0.34 + section * 0.06)
            add_kick(mix, at + 2 * beat, 0.28 + section * 0.05)
            add_snare(mix, at + beat, 0.20 + section * 0.04)
            add_snare(mix, at + 3 * beat, 0.23 + section * 0.04)
        if section == 3 and bar % 4 == 0:
            add_cymbal(mix, at, 0.22)

    for start_bar, melody, voice, velocity in ((4, THEME, "synth", 0.09), (8, ANSWER, "synth", 0.085),
                                                (12, THEME, "piano", 0.11), (16, ANSWER, "piano", 0.105),
                                                (20, THEME, "synth", 0.14), (24, ANSWER, "synth", 0.13)):
        base = start_bar * 4 * beat
        for offset, note, length in melody:
            add_note(mix, base + offset * beat, length * beat * 0.94, note, velocity, voice, 0.08)
            if start_bar >= 20:
                add_note(mix, base + offset * beat, length * beat, note - 12, velocity * 0.45, "strings", -0.12)
    return space_reverb(mix, 0.82), duration


def epic_strategy() -> tuple[np.ndarray, float]:
    bpm = 74
    beat = 60 / bpm
    bars = 28
    duration = bars * 4 * beat + 4.0
    mix = np.zeros((int(duration * SR), 2), dtype=np.float32)

    dark_chords = [
        (38, 45, 50, 53, 64),  # Dm(add9), vast and unresolved
        (38, 46, 51, 55, 57),  # Ebmaj/D, Phrygian mystery
        (34, 41, 46, 50, 53),  # Bbmaj(add9)
        (36, 43, 48, 50, 55),  # Csus2
        (38, 45, 50, 53, 57),  # Dm
        (33, 40, 45, 48, 52),  # Am(add11)
        (34, 41, 46, 50, 53),  # Bbmaj(add9)
        (36, 43, 48, 52, 55),  # Cmaj
    ]
    epic_theme = [
        (0, 62, 2.5), (2.5, 69, 1), (3.5, 70, .5),
        (4, 69, 1.5), (5.5, 65, .5), (6, 64, 1), (7, 62, 1),
    ]
    epic_answer = [
        (0, 62, 1), (1, 65, 1), (2, 67, 1), (3, 69, 2),
        (5, 72, 1), (6, 70, 1), (7, 69, 1),
    ]

    for bar in range(bars):
        at = bar * 4 * beat
        chord = dark_chords[bar % len(dark_chords)]
        section = 0 if bar < 4 else 1 if bar < 12 else 2 if bar < 20 else 3
        for i, note in enumerate(chord):
            octave = 12 if i > 1 else 0
            add_note(mix, at, 4.35 * beat, note + octave, 0.038 + section * 0.011,
                     "strings", (i - 2) * 0.24)
        # Human-like choir is the mysterious bed; it opens wider in the final act.
        if section == 0 or section >= 2:
            add_note(mix, at, 4.45 * beat, chord[1] + 12, 0.045 + section * 0.015, "choir", -0.38)
            add_note(mix, at, 4.45 * beat, chord[3] + 12, 0.042 + section * 0.014, "choir", 0.36)
        if section >= 1:
            ostinato = (chord[0] + 12, chord[2] + 12, chord[0] + 19, chord[2] + 12,
                        chord[0] + 12, chord[3] + 12, chord[0] + 19, chord[2] + 12)
            for eighth, note in enumerate(ostinato):
                add_note(mix, at + eighth * beat / 2, beat * 0.40, note,
                         0.06 + section * 0.014, "staccato", -0.46 if eighth % 2 == 0 else 0.44)
        # Long pedal tones make the scale feel planetary rather than rhythmic-pop.
        add_note(mix, at, 4.15 * beat, chord[0], 0.085 + section * 0.018, "bass", 0)
        if section >= 2:
            add_note(mix, at, 2.0 * beat, chord[0] - 12, 0.07 + section * 0.015, "bass", -0.08)
        if section >= 1:
            add_orchestral_impact(mix, at, 0.48 + section * 0.13)
            if bar % 2 == 1 or section == 3:
                add_kick(mix, at + 2 * beat, 0.46 + section * 0.09, True)
        if section >= 2:
            add_snare(mix, at + 2 * beat, 0.34 + section * 0.07, True)
        if bar in (4, 12, 20, 24):
            add_cymbal(mix, at, 0.36 + section * 0.07, 3.2)

    # Section transitions breathe first, then arrive with unmistakable scale.
    for target_bar in (12, 20):
        target = target_bar * 4 * beat
        add_riser(mix, target - 4 * beat, 4 * beat, 0.72)
        add_orchestral_impact(mix, target, 0.95)

    entries = ((4, epic_theme, 0.15), (8, epic_answer, 0.145),
               (12, epic_theme, 0.20), (16, epic_answer, 0.19),
               (20, epic_theme, 0.27), (24, epic_answer, 0.25))
    for start_bar, melody, velocity in entries:
        base = start_bar * 4 * beat
        for offset, note, length in melody:
            add_note(mix, base + offset * beat, length * beat * 0.96, note, velocity, "brass", -0.12)
            if start_bar >= 20:
                add_note(mix, base + offset * beat, length * beat, note + 12,
                         velocity * 0.46, "strings", 0.28)
                add_note(mix, base + offset * beat, length * beat, note - 12,
                         velocity * 0.48, "brass", -0.32)
    return space_reverb(mix, 0.90), duration


def write_wav(path: Path, mix: np.ndarray, fade_end: float = 2.2) -> None:
    fade = min(len(mix), int(fade_end * SR))
    mix[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)[:, None]
    peak = float(np.max(np.abs(mix)))
    mix = np.tanh(mix / max(peak, 0.001) * 1.35) * 0.82
    pcm = (mix * 32767).astype("<i2")
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SR)
        wav.writeframes(pcm.tobytes())


if __name__ == "__main__":
    one, _ = melodic_scifi()
    write_wav(OUT / "theme-01-melodic-scifi.wav", one)
    del one
    two, _ = epic_strategy()
    write_wav(OUT / "theme-02-epic-mysterious-v2.wav", two)
    print(f"Created music demos in {OUT}")
