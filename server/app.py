"""Local model service. Bind only to loopback; Vite proxies /api/model."""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from .model import UniTalkerProvider, read_wav

provider = UniTalkerProvider()
load_error = None
busy = asyncio.Lock()


@asynccontextmanager
async def lifespan(app):
    global load_error
    try:
        await run_in_threadpool(provider.load)
    except Exception as error:
        load_error = str(error)
        logging.exception("Model failed to load")
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/api/model/health")
def health():
    return {**provider.health(), "error": load_error}


@app.post("/api/model/infer")
async def infer(request: Request):
    if busy.locked():
        raise HTTPException(429, "Model is busy; retry after the current clip")
    async with busy:
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > 2_000_000:
                raise HTTPException(413, "Audio exceeds the 60-second limit")
        try:
            audio = read_wav(bytes(data))
        except ValueError as error:
            raise HTTPException(400, str(error)) from error
        if load_error:
            raise HTTPException(503, load_error)
        try:
            return await run_in_threadpool(provider.predict, audio)
        except Exception as error:
            logging.exception("Inference failed")
            raise HTTPException(500, "Model inference failed; see the local service log") from error
