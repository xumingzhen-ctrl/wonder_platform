"""P1: batch fetch disclosure-page snapshots for static-channel companies."""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_base import Fetcher

ROOT = Path(__file__).resolve().parent.parent
CODES = ["CTF", "YF", "BOC", "HSBC", "HANG", "CLO"]

cfg = json.load(open(ROOT / "config" / "insurers.json"))

import datetime
today = datetime.date.today().isoformat()

for code in CODES:
    ent = cfg[code]["legal_entities"][0]
    url = ent["urls"]["zh_cn"]
    try:
        snap = Fetcher(code, today).get_static(url, note="P1 initial fetch")
        print(f"{code}: status={snap.status} bytes={snap.bytes} -> {snap.dir}")
    except Exception as e:
        print(f"{code}: FETCH FAILED: {e}")
