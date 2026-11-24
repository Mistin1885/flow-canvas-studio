"""Run one recovery scan on startup and every fifteen minutes in the data service."""

import asyncio
from contextlib import asynccontextmanager
import logging

from . import storage
from .snapshots import scan

INTERVAL_SECONDS = 15 * 60


def scheduled_scan():
    with storage.session(True) as db:
        db.execute("UPDATE scan_status SET state='running',attempted=?,captured=0 WHERE id=1",
                   (storage.now(),))
    try:
        scan(scheduled=True)
    except Exception as exc:
        with storage.session(True) as db:
            db.execute("UPDATE scan_status SET state='failed',failed=?,error=? WHERE id=1",
                       (storage.now(), f"{type(exc).__name__}: {exc}"[:500]))
        raise
    with storage.session(True) as db:
        db.execute("UPDATE scan_status SET state='success',succeeded=? WHERE id=1", (storage.now(),))


@asynccontextmanager
async def scheduler():
    stop = asyncio.Event()

    async def run():
        loop = asyncio.get_running_loop()
        while not stop.is_set():
            deadline = loop.time() + INTERVAL_SECONDS
            try:
                await asyncio.to_thread(scheduled_scan)
            except Exception:
                logging.getLogger(__name__).exception("Scheduled recovery snapshot failed")
            try:
                await asyncio.wait_for(stop.wait(), timeout=max(0.001, deadline - loop.time()))
            except TimeoutError:
                pass

    task = asyncio.create_task(run())
    try:
        yield
    finally:
        stop.set()
        await task
