import asyncio
import uuid
from time import perf_counter

import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from utils.logging_config import (
    configure_logging,
    get_logger,
    reset_request_id,
    set_request_id,
    shorten,
)


configure_logging()
logger = get_logger("http")

from routers import ai, annotation, exchange, filesystem, project, taxonomy, vis

app = FastAPI(title="MultiAnno Backend")


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Trace every HTTP request, including requests that never finish."""

    request_id = uuid.uuid4().hex[:12]
    token = set_request_id(request_id)
    started = perf_counter()
    client = request.client
    client_text = (
        f"{client.host}:{client.port}" if client is not None else "unknown"
    )
    query = shorten(request.url.query, 1000) if request.url.query else "-"
    logger.info(
        "REQUEST_START method=%s path=%s query=%s client=%s content_length=%s",
        request.method,
        request.url.path,
        query,
        client_text,
        request.headers.get("content-length", "-"),
    )

    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "REQUEST_RETURNED method=%s path=%s status=%s duration_ms=%.1f",
            request.method,
            request.url.path,
            response.status_code,
            (perf_counter() - started) * 1000,
        )

        # Streaming endpoints return before their generator has finished.
        # Keep the request context alive until the stream really ends so
        # progress/error records retain the same request id.
        body_iterator = getattr(response, "body_iterator", None)
        if body_iterator is not None:
            stream_token = token

            async def logged_body_iterator():
                try:
                    async for chunk in body_iterator:
                        yield chunk
                    logger.info(
                        "REQUEST_STREAM_END method=%s path=%s duration_ms=%.1f",
                        request.method,
                        request.url.path,
                        (perf_counter() - started) * 1000,
                    )
                except asyncio.CancelledError:
                    logger.warning(
                        "REQUEST_STREAM_CANCELLED method=%s path=%s duration_ms=%.1f",
                        request.method,
                        request.url.path,
                        (perf_counter() - started) * 1000,
                    )
                    raise
                except Exception:
                    logger.exception(
                        "REQUEST_STREAM_ERROR method=%s path=%s duration_ms=%.1f",
                        request.method,
                        request.url.path,
                        (perf_counter() - started) * 1000,
                    )
                    raise
                finally:
                    reset_request_id(stream_token)

            response.body_iterator = logged_body_iterator()
            token = None
        return response
    except Exception:
        logger.exception(
            "REQUEST_ERROR method=%s path=%s duration_ms=%.1f",
            request.method,
            request.url.path,
            (perf_counter() - started) * 1000,
        )
        raise
    finally:
        if token is not None:
            reset_request_id(token)


@app.get("/api/health", tags=["System"])
async def health_check():
    logger.info("HEALTH_CHECK")
    return JSONResponse(
        content={"status": "ok"},
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
        },
    )


# 🌟 把这个无敌显微镜加在这里（紧跟在 app = FastAPI() 之后）
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    body = await request.body()
    body_text = body.decode("utf-8", errors="replace") if body else "Empty"
    logger.warning(
        "VALIDATION_ERROR method=%s path=%s body=%s errors=%s",
        request.method,
        request.url.path,
        shorten(body_text),
        shorten(exc.errors()),
    )
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": body.decode("utf-8") if body else ""},
    )


# 跨域配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册所有路由模块
app.include_router(filesystem.router)
app.include_router(project.router)
app.include_router(annotation.router)
app.include_router(taxonomy.router)
app.include_router(ai.router)
app.include_router(vis.router)
app.include_router(exchange.router)


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8090, reload=False)
