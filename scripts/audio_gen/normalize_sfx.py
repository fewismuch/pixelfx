#!/usr/bin/env python3
"""批量统一音效响度：先出报告和预览，试听确认后再覆盖原文件。

测量用 EBU R128 瞬时响度（400ms 窗口）的最大值，适合零点几秒的短音效；
调整只做整体增益，不压缩不限幅，增益受真峰值上限约束（会在报告里标出）。

默认按类别各自对齐：每个目标目录下的一级子目录算一类（如 audio/sfx/voices），
各自对齐到本类中位数，只修类内忽大忽小，类与类之间的轻重保持不变；
SPLIT_GROUPS 里的目录混了多种声音，再往下按子目录分类（可用 --split 覆盖）；
传 --target 则改为全部对齐到同一个值。

用法（在项目根目录执行）：
  python3 scripts/audio_gen/normalize_sfx.py                  # 测量 + 生成预览与报告
  python3 scripts/audio_gen/normalize_sfx.py --target -18    # 全部对齐到同一个值
  python3 scripts/audio_gen/normalize_sfx.py --all            # 包含未被游戏引用的素材
  python3 scripts/audio_gen/normalize_sfx.py --apply          # 用预览覆盖原文件（原文件先备份）

预览输出到 .scratch/sfx_normalize/preview/（目录结构同原文件），
报告为其中的 report.md；备份在 .scratch/sfx_normalize/backup/<时间>/。
"""

import argparse
import json
import re
import shutil
import statistics
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREVIEW_DIR = ROOT / ".scratch/sfx_normalize/preview"
BACKUP_DIR = ROOT / ".scratch/sfx_normalize/backup"
MANIFEST = PREVIEW_DIR / "manifest.json"
AUDIO_EXTS = {".wav", ".ogg", ".mp3"}
# 扫描引用时看的目录；addons、.godot、tools 不算游戏引用
REF_SCAN_DIRS = ["audio", "gameplay", "scenes", "components", "autoload", "resources"]
REF_SCAN_EXTS = {".tres", ".tscn", ".gd"}
REF_PATTERN = re.compile(r'res://[^"\s]+\.(?:wav|ogg|mp3)')
# 短于瞬时窗口的音效补静音后才能测出 M 值
PAD_SECONDS = 0.5
SILENT_LUFS = -70.0
# 混了多种声音的目录，再按下一级子目录分类（如 inventory/coins、inventory/bags）
SPLIT_GROUPS = ["audio/sfx/inventory"]

M_RE = re.compile(r"\bM:\s*(-?[\d.]+|-inf)")
PEAK_RE = re.compile(r"Peak:\s*(-?[\d.]+|-inf)\s*dBFS")


def find_referenced() -> set[Path]:
    used: set[Path] = set()
    for d in REF_SCAN_DIRS:
        base = ROOT / d
        if not base.is_dir():
            continue
        for f in base.rglob("*"):
            if f.suffix not in REF_SCAN_EXTS or not f.is_file():
                continue
            for m in REF_PATTERN.findall(f.read_text(errors="ignore")):
                used.add((ROOT / m.removeprefix("res://")).resolve())
    return used


def collect(targets: list[str], include_all: bool, split: list[str]) -> dict[Path, str]:
    """返回 {文件: 类别}；类别为目标目录下的一级子目录，直接放在目标目录里的文件归目标目录本身。"""
    files: dict[Path, str] = {}
    for t in targets:
        p = (ROOT / t).resolve()
        if p.is_file() and p.suffix.lower() in AUDIO_EXTS:
            files[p] = str(p.parent.relative_to(ROOT))
        elif p.is_dir():
            for f in p.rglob("*"):
                if f.suffix.lower() not in AUDIO_EXTS:
                    continue
                rel = f.relative_to(p)
                group = p / rel.parts[0] if len(rel.parts) > 1 else p
                group_rel = str(group.relative_to(ROOT))
                sub = f.relative_to(group).parts
                if group_rel in split and len(sub) > 1:
                    group_rel = f"{group_rel}/{sub[0]}"
                files[f] = group_rel
    if not include_all:
        used = find_referenced()
        files = {f: g for f, g in files.items() if f in used}
    return dict(sorted(files.items()))


def measure(path: Path) -> tuple[float, float]:
    """返回 (最大瞬时响度 LUFS, 真峰值 dBTP)。"""
    proc = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
            "-af", f"apad=pad_dur={PAD_SECONDS},ebur128=peak=true:framelog=info",
            "-f", "null", "-",
        ],
        capture_output=True, text=True,
    )
    values = [float(v) for v in M_RE.findall(proc.stderr) if v != "-inf"]
    peaks = PEAK_RE.findall(proc.stderr)
    m_max = max(values) if values else float("-inf")
    peak = float(peaks[-1]) if peaks and peaks[-1] != "-inf" else float("-inf")
    return m_max, peak


def probe_codec(path: Path) -> str:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0",
         "-show_entries", "stream=codec_name", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    ).stdout.strip()
    return out


def codec_args(path: Path) -> list[str]:
    ext = path.suffix.lower()
    if ext == ".wav":
        # 保持原采样格式（16/24/32 位等）
        return ["-c:a", probe_codec(path) or "pcm_s16le"]
    if ext == ".ogg":
        return ["-c:a", "libvorbis", "-q:a", "6"]
    return ["-c:a", "libmp3lame", "-q:a", "2"]


def render(src: Path, dst: Path, gain_db: float) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
         "-af", f"volume={gain_db:.2f}dB", "-map_metadata", "-1",
         *codec_args(src), str(dst)],
        check=True,
    )


def measure_one(path: Path, group: str) -> dict:
    m_max, peak = measure(path)
    return {"path": str(path.relative_to(ROOT)), "group": group, "lufs": m_max,
            "peak": peak, "target": None, "gain": 0.0, "note": ""}


def group_targets(rows: list[dict], fixed: float | None) -> dict[str, float]:
    groups: dict[str, list[float]] = {}
    for r in rows:
        if r["lufs"] > SILENT_LUFS:
            groups.setdefault(r["group"], []).append(r["lufs"])
    if fixed is not None:
        return {g: fixed for g in groups}
    return {g: round(statistics.median(v), 1) for g, v in groups.items()}


def plan_one(row: dict, target: float | None, args) -> dict:
    if target is None or row["lufs"] <= SILENT_LUFS:
        row["note"] = "静音/测不出，跳过"
        return row
    row["target"] = target
    gain = target - row["lufs"]
    headroom = args.ceiling - row["peak"]
    if gain > headroom + 0.05:
        gain = headroom
        row["note"] = f"受峰值限制，仍比目标轻 {target - (row['lufs'] + gain):.1f} dB"
    if abs(gain) < args.tolerance:
        row["note"] = row["note"] or "已在容差内，不改"
        return row
    row["gain"] = round(gain, 2)
    render(ROOT / row["path"], PREVIEW_DIR / row["path"], gain)
    return row


def write_report(rows: list[dict], targets: dict[str, float], args) -> Path:
    changed = [r for r in rows if r["gain"] != 0.0]
    mode = "全部对齐到同一目标" if args.target is not None else "按类别各自对齐到本类中位数"
    lines = [
        "# 音效响度统一报告",
        "",
        f"- 模式：{mode}（最大瞬时响度 LUFS），真峰值上限 {args.ceiling} dBTP，"
        f"容差 ±{args.tolerance} dB",
        f"- 共 {len(rows)} 个文件，需调整 {len(changed)} 个；预览文件在本目录下，结构同原路径",
        "- 确认后执行 `python3 scripts/audio_gen/normalize_sfx.py --apply` 覆盖原文件",
        "",
        "## 各类目标",
        "",
        "| 类别 | 文件数 | 目标 LUFS | 原范围 LUFS | 需调整 |",
        "|---|---|---|---|---|",
    ]
    for g, target in sorted(targets.items(), key=lambda kv: -kv[1]):
        members = [r for r in rows if r["group"] == g]
        levels = [r["lufs"] for r in members if r["lufs"] > SILENT_LUFS]
        n_changed = sum(1 for r in members if r["gain"] != 0.0)
        lines.append(
            f"| {g} | {len(members)} | {target:.1f} | {min(levels):.1f} ~ {max(levels):.1f} "
            f"| {n_changed} |"
        )
    lines += [
        "",
        "## 逐个文件（按调整幅度排序）",
        "",
        "| 文件 | 原响度 LUFS | 原峰值 dBTP | 目标 | 增益 dB | 备注 |",
        "|---|---|---|---|---|---|",
    ]
    for r in sorted(rows, key=lambda r: -abs(r["gain"])):
        target = f"{r['target']:.1f}" if r["target"] is not None else "-"
        lines.append(
            f"| {r['path']} | {r['lufs']:.1f} | {r['peak']:.1f} | {target} "
            f"| {r['gain']:+.1f} | {r['note']} |"
        )
    report = PREVIEW_DIR / "report.md"
    report.write_text("\n".join(lines) + "\n")
    MANIFEST.write_text(json.dumps(changed, ensure_ascii=False, indent=2))
    return report


def apply() -> None:
    if not MANIFEST.exists():
        sys.exit("没有预览清单，先不带 --apply 跑一遍")
    rows = json.loads(MANIFEST.read_text())
    backup = BACKUP_DIR / datetime.now().strftime("%Y%m%d_%H%M%S")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    (BACKUP_DIR / ".gdignore").touch()
    for r in rows:
        src = PREVIEW_DIR / r["path"]
        dst = ROOT / r["path"]
        if not src.exists():
            print(f"缺预览文件，跳过：{r['path']}")
            continue
        (backup / r["path"]).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(dst, backup / r["path"])
        shutil.copy2(src, dst)
    print(f"已覆盖 {len(rows)} 个文件，原文件备份在 {backup.relative_to(ROOT)}")
    print("打开 Godot 编辑器后会自动重新导入")


def main() -> None:
    parser = argparse.ArgumentParser(description="批量统一音效响度")
    parser.add_argument("targets", nargs="*", default=["audio/sfx"],
                        help="要处理的文件或目录（相对项目根目录），默认 audio/sfx")
    parser.add_argument("--target", type=float, default=None,
                        help="全部对齐到这个最大瞬时响度 LUFS；不传则按类别对齐到本类中位数")
    parser.add_argument("--ceiling", type=float, default=-1.0,
                        help="真峰值上限 dBTP，默认 -1")
    parser.add_argument("--tolerance", type=float, default=1.0,
                        help="与目标相差不超过此值（dB）则不改，默认 1")
    parser.add_argument("--split", nargs="*", default=SPLIT_GROUPS,
                        help="再按下一级子目录分类的目录，默认 audio/sfx/inventory；传空则不细分")
    parser.add_argument("--all", action="store_true",
                        help="包含未被游戏引用的素材（默认只处理被 .tres/.tscn/.gd 引用的）")
    parser.add_argument("--apply", action="store_true",
                        help="用上次生成的预览覆盖原文件")
    args = parser.parse_args()

    if args.apply:
        apply()
        return

    files = collect(args.targets, args.all, [s.rstrip('/') for s in args.split])
    if not files:
        sys.exit("没有找到要处理的音频文件")
    if PREVIEW_DIR.exists():
        shutil.rmtree(PREVIEW_DIR)
    PREVIEW_DIR.mkdir(parents=True)
    (ROOT / ".scratch/.gdignore").touch()

    with ThreadPoolExecutor(max_workers=8) as pool:
        rows = list(pool.map(lambda kv: measure_one(*kv), files.items()))
        targets = group_targets(rows, args.target)
        rows = list(pool.map(lambda r: plan_one(r, targets.get(r["group"]), args), rows))
    report = write_report(rows, targets, args)
    changed = sum(1 for r in rows if r["gain"] != 0.0)
    print(f"测量 {len(rows)} 个，需调整 {changed} 个；报告：{report.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
