"""Cricbuzz scraper — replaces RapidAPI as the primary source of career stats.

The `scraper` package holds two related but independent modules:

- `cricinfo_loader`  — ESPN Cricinfo → raw_profiles.json for the ML pipeline
                       (features.py → pipeline.py). Was `scraper.py` at the
                       ml/ root, moved here to fix a name collision with
                       this package directory.
- `cricbuzz_scrape`  — Cricbuzz HTML scraper, powers the /scrape/* FastAPI
                       endpoints consumed by api-server and the Hero ticker.
- `router`           — FastAPI router exposing cricbuzz_scrape over HTTP.

`load_or_fetch_all` is re-exported here so main.py's existing
`from scraper import load_or_fetch_all` keeps working unchanged.
"""

from . import cricbuzz_scrape, router
from .cricinfo_loader import load_or_fetch_all

__all__ = ["cricbuzz_scrape", "router", "load_or_fetch_all"]
