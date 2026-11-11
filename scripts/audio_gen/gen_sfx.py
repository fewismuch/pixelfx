#!/usr/bin/env python3
"""火山引擎 seed-audio 音效生成：同一提示词并发生成多个候选。

用法：
  python3 scripts/audio_gen/gen_sfx.py .scratch/sfx/<名字> <名字前缀> "<提示词>" [-n 5] [--format wav] [--ref 参考.wav ...]

--ref 可传最多 3 条参考音频（≤30 秒、≤10MB，wav/mp3/pcm/ogg_opus），
按顺序对应提示词里的 @音频1、@音频2、@音频3。

API Key 读取顺序：环境变量 VOLC_SPEECH_API_KEY → ~/.config/volc_speech/api_key
"""

import argparse
import base64
import json
import os
import sys
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

API_URL = "https://openspeech.bytedance.com/api/v3/tts/create"
MAX_CONCURRENCY = 5


def load_key() -> str:
    key = os.environ.get("VOLC_SPEECH_API_KEY")
    if key:
        return key.strip()
    path = Path.home() / ".config/volc_speech/api_key"
    if path.exists():
        return path.read_text().strip()
    sys.exit("缺少 API Key：设置 VOLC_SPEECH_API_KEY 或写入 ~/.config/volc_speech/api_key")


def generate(key: str, prompt: str, fmt: str, out_path: Path, refs: list[str] | None = None) -> str:
    body = {
        "model": "seed-audio-1.0",
        "text_prompt": prompt,
        "audio_config": {"format": fmt},
    }
    if refs:
        body["references"] = [{"audio_data": b} for b in refs]
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Api-Key": key,
            "X-Api-Request-Id": str(uuid.uuid4()),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            logid = resp.headers.get("X-Tt-Logid", "")
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return f"{out_path.name}: HTTP {e.code} {e.read().decode('utf-8', 'replace')}"
    audio = data.get("audio")
    if not audio:
        return f"{out_path.name}: 失败 code={data.get('code')} msg={data.get('message')} logid={logid}"
    out_path.write_bytes(base64.b64decode(audio))
    return f"{out_path.name}: {data.get('duration')}s (计费 {data.get('original_duration')}s)"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out_dir")
    ap.add_argument("name")
    ap.add_argument("prompt")
    ap.add_argument("-n", type=int, default=5, help="生成数量，默认 5")
    ap.add_argument("--format", default="wav", choices=["wav", "mp3", "pcm", "ogg_opus"])
    ap.add_argument("--ref", action="append", default=[], help="参考音频，可重复，最多 3 条")
    args = ap.parse_args()

    key = load_key()
    if len(args.ref) > 3:
        sys.exit("参考音频最多 3 条")
    refs = [base64.b64encode(Path(r).read_bytes()).decode("ascii") for r in args.ref]
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    ext = "ogg" if args.format == "ogg_opus" else args.format
    paths = [out_dir / f"{args.name}_{i + 1:02d}.{ext}" for i in range(args.n)]

    with ThreadPoolExecutor(max_workers=min(args.n, MAX_CONCURRENCY)) as pool:
        for line in pool.map(lambda p: generate(key, args.prompt, args.format, p, refs), paths):
            print(line)


if __name__ == "__main__":
    main()
