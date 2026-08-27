# ml/keep_alive.py
# ─────────────────────────────────────────────────────────────────────────────
# Self-ping keep-alive for Render free tier (Python equivalent of
# api-server's src/workers/keepAlive.ts).
#
# Render spins down free web services after ~15 minutes of inactivity.
# This module spawns an asyncio task that pings our own /health endpoint
# every 10 minutes, keeping the instance warm so users never hit a
# 30-50s cold start on the scraper.
#
# Only active when KEEP_ALIVE_ENABLED=true (set in the Render dashboard).
# No-op locally — no reason to ping yourself on localhost.
# ─────────────────────────────────────────────────────────────────────────────

import asyncio
import os
import time
import urllib.request
import urllib.error


INTERVAL_S = 10 * 60          # 10 minutes — well under Render's 15-min idle cutoff
PING_TIMEOUT_S = 15           # bound the per-ping wait so a stuck network never wedges the loop
_task: asyncio.Task | None = None


def _self_url() -> str:
    """RENDER_EXTERNAL_URL is auto-injected by Render for web services."""
    base = os.environ.get("RENDER_EXTERNAL_URL") or f"http://localhost:{os.environ.get('PORT', '8000')}"
    return f"{base.rstrip('/')}/health"


def _ping_once() -> int:
    """Sync ping; runs in a thread so it doesn't block the event loop."""
    url = _self_url()
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=PING_TIMEOUT_S) as resp:
            return resp.status
    except urllib.error.URLError as e:
        print(f"[keep-alive] Ping failed: url={url} error={e.reason}")
        return 0
    except Exception as e:
        print(f"[keep-alive] Ping failed: url={url} error={e}")
        return 0


async def _ping_loop() -> None:
    """Background task: ping forever, every INTERVAL_S."""
    # Fire once immediately so the first external request after a sleep
    # doesn't have to wait the full interval for a wake-up.
    await asyncio.to_thread(_ping_once)
    while True:
        await asyncio.sleep(INTERVAL_S)
        await asyncio.to_thread(_ping_once)


def start_keep_alive() -> None:
    """Spawn the keep-alive background task. No-op if disabled or already running."""
    global _task
    if not os.environ.get("KEEP_ALIVE_ENABLED"):
        print("[keep-alive] Disabled (KEEP_ALIVE_ENABLED not set)")
        return
    if _task is not None and not _task.done():
        return
    _task = asyncio.create_task(_ping_loop())
    print(f"[keep-alive] Started — pinging {_self_url()} every {INTERVAL_S // 60} min")


def stop_keep_alive() -> None:
    """Cancel the background task. Called on shutdown."""
    global _task
    if _task is not None and not _task.done():
        _task.cancel()
        _task = None
    print("[keep-alive] Stopped")
