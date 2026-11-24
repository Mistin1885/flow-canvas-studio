"""Run one recovery scan on startup and every fifteen minutes in the data service."""

import asyncio
from contextlib import asynccontextmanager
import logging

from .snapshots import scan

INTERVAL_SECONDS = 15 * 60


@asynccontextmanager
async def scheduler():
    stop = asyncio.Event()

    async def run():
        loop = asyncio.get_running_loop()
        while not stop.is_set():
            deadline = loop.time() + INTERVAL_SECONDS
            try:
                await asyncio.to_thread(scan)
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
