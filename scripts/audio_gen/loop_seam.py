#!/usr/bin/env python3
"""Trim loop SFX for gallery hard-restart: drop edge silence, fit duration, equalize head/tail."""

from __future__ import annotations

import argparse
import math
import struct
import wave
from pathlib import Path


def read_wav(path: Path):
    import array

    with wave.open(str(path), "rb") as wf:
        ch = wf.getnchannels()
        sw = wf.getsampwidth()
        rate = wf.getframerate()
        n = wf.getnframes()
        raw = wf.readframes(n)
    if sw != 2:
        raise SystemExit(f"{path}: need 16-bit PCM")
    fmt = f"<{n * ch}h"
    samples = list(struct.unpack(fmt, raw))
    if ch == 1:
        return rate, [array.array("h", samples)]
    left = array.array("h", samples[0::2])
    right = array.array("h", samples[1::2])
    return rate, [left, right]


def write_wav(path: Path, rate: int, channels: list) -> None:
    import array

    if len(channels) == 1:
        data = channels[0]
    else:
        inter = array.array("h")
        for i in range(len(channels[0])):
            inter.append(channels[0][i])
            inter.append(channels[1][i])
        data = inter
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(len(channels))
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(data.tobytes())


def rms(samples: list[int]) -> float:
    if not samples:
        return 0.0
    s = sum(v * v for v in samples)
    return math.sqrt(s / len(samples))


def trim_silence(ch: list, rate: int, thresh: int, min_run: int) -> list:
    import array

    n = len(ch)
    start = 0
    win = max(1, int(rate * 0.005))
    while start < n:
        if rms(ch[start : start + min(win, n - start)]) > thresh:
            break
        start += win
    end = n
    while end > start:
        s = max(start, end - win)
        if rms(ch[s:end]) > thresh:
            break
        end -= win
    return array.array("h", ch[start:end])


def fit_duration(ch: list, rate: int, duration: float) -> list:
    import array

    target = int(round(rate * duration))
    n = len(ch)
    if n == target:
        return ch
    if n > target:
        return array.array("h", ch[:target])
    out = array.array("h", ch)
    while len(out) < target:
        need = target - len(out)
        out.extend(ch[: min(need, len(ch))])
    return out[:target]


def seam_blend(ch: list, rate: int, xfade_ms: float) -> list:
    import array

    n = len(ch)
    xn = min(n // 4, int(rate * xfade_ms / 1000))
    if xn < 8:
        return ch
    out = array.array("h", ch)
    for i in range(xn):
        t = i / (xn - 1) if xn > 1 else 1.0
        h, tail = out[i], out[n - xn + i]
        mix = int((1 - t) * h + t * tail)
        mix2 = int(t * h + (1 - t) * tail)
        out[i] = max(-32768, min(32767, mix))
        out[n - xn + i] = max(-32768, min(32767, mix2))
    return out


def process_file(src: Path, dst: Path, duration: float, xfade_ms: float, silence_db: float) -> None:
    rate, channels = read_wav(src)
    thresh = int(32767 * (10 ** (silence_db / 20)))
    trimmed = [trim_silence(c, rate, thresh, 1) for c in channels]
    fitted = [fit_duration(c, rate, duration) for c in trimmed]
    seamed = [seam_blend(c, rate, xfade_ms) for c in fitted]
    dst.parent.mkdir(parents=True, exist_ok=True)
    write_wav(dst, rate, seamed)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src_dir")
    ap.add_argument("dst_dir")
    ap.add_argument("--duration", type=float, required=True)
    ap.add_argument("--xfade-ms", type=float, default=45)
    ap.add_argument("--silence-db", type=float, default=-42)
    args = ap.parse_args()
    src = Path(args.src_dir)
    dst = Path(args.dst_dir)
    files = sorted(src.glob("candidate_*.wav"))
    if not files:
        raise SystemExit("no candidate_*.wav")
    for f in files:
        process_file(f, dst / f.name, args.duration, args.xfade_ms, args.silence_db)
        print(f.name, "->", dst / f.name)


if __name__ == "__main__":
    main()
