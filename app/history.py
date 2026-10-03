import json
from pathlib import Path
from datetime import datetime, timezone


def append_run(path: str, payload: dict):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)

    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **payload,
    }

    with p.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
