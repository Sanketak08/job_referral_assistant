from pathlib import Path
import os
import yaml
from dotenv import load_dotenv


class Config:
    def __init__(self, path: str = "config.yaml"):
        load_dotenv()
        self.path = Path(path)
        with self.path.open("r", encoding="utf-8") as f:
            self.raw = yaml.safe_load(f)

    def section(self, *keys, default=None):
        value = self.raw
        for key in keys:
            if not isinstance(value, dict) or key not in value:
                return default
            value = value[key]
        return value

    def env(self, key: str, required: bool = True) -> str | None:
        value = os.getenv(key)
        if required and not value:
            raise RuntimeError(f"Missing environment variable: {key}")
        return value
