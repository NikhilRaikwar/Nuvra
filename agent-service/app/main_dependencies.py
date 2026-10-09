from app.api.run_store import RunStore
from app.config import get_settings

run_store = RunStore(get_settings())


def get_run_store() -> RunStore:
    return run_store


async def start_run_store() -> None:
    await run_store.start()


async def stop_run_store() -> None:
    await run_store.stop()
