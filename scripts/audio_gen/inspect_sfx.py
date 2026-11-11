#!/usr/bin/env python3
"""报告候选实际时长、最大瞬时响度和真峰值，不修改原音频。"""
import json
import subprocess
import sys
from pathlib import Path
from normalize_sfx import measure

rows = []
for path in sorted(Path(sys.argv[1]).glob('candidate_*.wav')):
    result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                             '-of', 'json', str(path)], capture_output=True, text=True, check=True)
    loudness, peak = measure(path)
    rows.append({'file': path.name, 'duration': float(json.loads(result.stdout)['format']['duration']),
                 'lufs': loudness if loudness > -70 else None,
                 'peak': peak if peak > -70 else None})
print(json.dumps(rows, allow_nan=False))
