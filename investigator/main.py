import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import PurePosixPath
from urllib.parse import urlsplit
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from neo4j.exceptions import DriverError, Neo4jError
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .agent import ProviderError
from .config import ROOT, Settings
from .domain import GRAPH_STAGES, STAGES, three_months_ago
from .localization import Language, Localizer, TranslationUnavailable, graph_texts, localized_graph
from .pipeline import Pipeline
from .store import Store
from .video import captions_vtt

MAX_BYTES = 100_000
logger = logging.getLogger(__name__)
settings = Settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.store = Store(settings)
    app.state.localizer = Localizer(settings, app.state.store)
    app.state.pipeline = Pipeline(settings, app.state.store)
    app.state.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="investigation")
    try:
        app.state.store.initialize()
        if settings.aiand_api_key.get_secret_value():
            for key in app.state.store.recover():
                app.state.executor.submit(app.state.pipeline.run, key)
    except (DriverError, Neo4jError) as error:
        logger.warning("Neo4j is not ready (%s)", type(error).__name__)
    yield
    app.state.pipeline.stopping.set()
    app.state.executor.shutdown(cancel_futures=True)
    app.state.store.driver.close()


app = FastAPI(title="KnowlageWhy", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "[::1]", "testserver"]
)


@app.middleware("http")
async def local_mutations(request: Request, call_next):
    if request.method == "POST" and request.headers.get("origin"):
        origin = urlsplit(request.headers["origin"])
        if origin.scheme not in {"http", "https"} or origin.hostname not in {
            "localhost",
            "127.0.0.1",
            "::1",
        }:
            return JSONResponse(
                {"detail": "请从本地工作台发起调查。", "code": "local_only"}, status_code=403
            )
    return await call_next(request)


class AppError(HTTPException):
    def __init__(self, status: int, code: str, detail: str):
        super().__init__(status, detail)
        self.code = code


@app.exception_handler(AppError)
async def app_error_response(request: Request, error: AppError):
    return JSONResponse({"detail": error.detail, "code": error.code}, status_code=error.status_code)


def store():
    return app.state.store


def lookup(key: UUID):
    run = store().get(str(key))
    if run is None:
        raise AppError(404, "run_missing", "调查不存在")
    return run


def database_error(error):
    if str(getattr(error, "code", "")).endswith("Unauthorized"):
        return AppError(503, "db_auth", "Neo4j 认证失败，请核对 .env 里的用户名和密码。")
    return AppError(503, "db_unavailable", "无法访问 Neo4j，请检查实例、连接端口和数据库名。")


@app.get("/api/status")
def status():
    today = datetime.now(ZoneInfo("Asia/Tokyo")).date()
    error = None
    try:
        store().query("RETURN 1")
    except (DriverError, Neo4jError) as exc:
        error = database_error(exc)
    return {
        "neo4j": error is None,
        "database_error": error.detail if error else None,
        "database_error_code": error.code if error else None,
        "aiand": bool(settings.aiand_api_key.get_secret_value()),
        "range": [three_months_ago(today).isoformat(), today.isoformat()],
        "stages": [{"id": key, "label": label, "description": desc} for key, label, desc in STAGES],
    }


@app.get("/api/runs")
def list_runs():
    try:
        return store().list()
    except (DriverError, Neo4jError) as error:
        raise database_error(error) from error


@app.post("/api/runs", status_code=202)
def create_run(file: UploadFile):
    if not settings.aiand_api_key.get_secret_value():
        raise AppError(503, "key_required", "请在 .env 设置 AIAND_API_KEY，随后重启服务。")
    name = PurePosixPath((file.filename or "").replace("\\", "/")).name
    if PurePosixPath(name).suffix.lower() not in {".txt", ".md", ".markdown"}:
        raise AppError(422, "file_type", "请选择 .txt 或 .md 文本文件。")
    payload = file.file.read(MAX_BYTES + 1)
    if len(payload) > MAX_BYTES:
        raise AppError(413, "file_size", "文件大小上限为 100 KB。")
    try:
        document = payload.decode("utf-8-sig").strip()
    except UnicodeDecodeError as error:
        raise AppError(422, "file_encoding", "请使用 UTF-8 编码。") from error
    if not document or "\x00" in document:
        raise AppError(422, "file_empty", "请上传非空的纯文本文件。")
    today = datetime.now(ZoneInfo("Asia/Tokyo")).date()
    try:
        store().initialize()
        key = store().create(
            name[:160], document, three_months_ago(today).isoformat(), today.isoformat()
        )
    except (DriverError, Neo4jError) as error:
        raise database_error(error) from error
    app.state.executor.submit(app.state.pipeline.run, key)
    return {"key": key}


@app.get("/api/runs/{key}")
def read_run(key: UUID):
    try:
        return lookup(key)
    except (DriverError, Neo4jError) as error:
        raise database_error(error) from error


@app.get("/api/runs/{key}/graph/{stage}")
def read_graph(key: UUID, stage: str):
    if stage not in GRAPH_STAGES:
        raise AppError(404, "stage_missing", "图谱阶段不存在")
    try:
        graph = store().graph(str(key), stage)
    except (DriverError, Neo4jError) as error:
        raise database_error(error) from error
    if graph is None:
        raise AppError(404, "graph_missing", "该阶段的图谱尚未生成")
    return graph


@app.post("/api/runs/{key}/retry", status_code=202)
def retry(key: UUID):
    try:
        if not store().claim(str(key), "failed"):
            raise AppError(409, "retry_unavailable", "仅暂停的调查可重试")
        store().update(str(key), status="queued")
    except (DriverError, Neo4jError) as error:
        raise database_error(error) from error
    app.state.executor.submit(app.state.pipeline.run, str(key))
    return {"key": key}


@app.post("/api/runs/{key}/translations/{section}/{language}")
def translate_run(key: UUID, section: str, language: Language):
    try:
        localizer = app.state.localizer
        if section == "video":
            run = lookup(key)
            if not run.get("video_title") or not run.get("narration"):
                raise AppError(404, "video_missing", "日语解说尚未生成")
            texts = {"title": run["video_title"]}
            texts.update({f"cue.{i}": line for i, line in enumerate(run["narration"])})
            translated = texts if language == "ja" else localizer.get(str(key), section, language, texts)
            return {
                "title": translated["title"],
                "narration": [translated[f"cue.{i}"] for i in range(len(run["narration"]))],
            }
        graph = read_graph(key, section)
        if language == "zh":
            return graph
        text = localizer.get(str(key), section, language, graph_texts(graph))
        return localized_graph(graph, text)
    except (DriverError, Neo4jError) as error:
        raise database_error(error) from error
    except (ProviderError, TranslationUnavailable, httpx.HTTPError) as error:
        logger.warning("Translation failed for %s %s (%s)", section, language, type(error).__name__)
        raise AppError(502, "translation_failed", "翻译暂不可用，请重试。") from error


@app.get("/api/runs/{key}/media/{name}")
def media(key: UUID, name: str):
    if name in {"captions.zh.vtt", "captions.en.vtt"}:
        try:
            translation = store().translation(str(key), "video", name.split(".")[1])
        except (DriverError, Neo4jError) as error:
            raise database_error(error) from error
        if translation is None:
            raise AppError(404, "video_missing", "字幕尚未生成")
        lines = [translation[f"cue.{i}"] for i in range(len(translation) - 1)]
        return Response(captions_vtt(lines), media_type="text/vtt")
    types = {"animation.mp4": ("mp4", "video/mp4"), "captions.vtt": ("vtt", "text/vtt")}
    if name not in types:
        raise AppError(404, "video_missing", "媒体文件不存在")
    extension, content_type = types[name]
    path = settings.media_dir / f"{key}.{extension}"
    if not path.is_file():
        raise AppError(404, "video_missing", "动画尚未生成")
    return FileResponse(path, media_type=content_type)


dist = ROOT / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="web")
