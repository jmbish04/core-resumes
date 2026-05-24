#!/usr/bin/env python3
"""
FastAPI bridge for notebooklm-py backed by Chrome Profile 6 cookies.

The server exposes typed HTTP endpoints for the main notebooklm-py APIs plus a
generic RPC bridge and CLI bridge. When NotebookLM auth fails, it refreshes the
notebooklm-py storage_state.json by decrypting Chrome Profile 6 cookies through
the companion sync-cookies.py module, then retries the failed operation once.
"""
from __future__ import annotations

import asyncio
import dataclasses
import enum
import importlib.util
import inspect
import json
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Literal, get_args, get_origin

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from notebooklm import (
    ArtifactType,
    AudioFormat,
    AudioLength,
    ChatGoal,
    ChatMode,
    ChatResponseLength,
    ExportType,
    InfographicDetail,
    InfographicOrientation,
    InfographicStyle,
    NotebookLMClient,
    QuizDifficulty,
    QuizQuantity,
    ReportFormat,
    SharePermission,
    ShareViewLevel,
    SlideDeckFormat,
    SlideDeckLength,
    VideoFormat,
    VideoStyle,
)

SCRIPT_DIR = Path(__file__).resolve().parent
SYNC_SCRIPT_PATH = SCRIPT_DIR / "sync-cookies.py"
NOTEBOOKLM_BIN = SCRIPT_DIR / ".venv" / "bin" / "notebooklm"

DEFAULT_CHROME_PROFILE_DIR = os.environ.get("NOTEBOOKLM_CHROME_PROFILE_DIR", "Profile 6")
DEFAULT_NOTEBOOKLM_PROFILE = os.environ.get("NOTEBOOKLM_PROFILE", "jmbish04")
DEFAULT_HOST_FILTER = os.environ.get("NOTEBOOKLM_COOKIE_HOST_FILTER", "google")

SERVER_API_KEY = os.environ.get("NOTEBOOKLM_FASTAPI_KEY", "").strip()

ENUM_TYPES: dict[str, type[enum.Enum]] = {
    cls.__name__: cls
    for cls in (
        ArtifactType,
        AudioFormat,
        AudioLength,
        ChatGoal,
        ChatMode,
        ChatResponseLength,
        ExportType,
        InfographicDetail,
        InfographicOrientation,
        InfographicStyle,
        QuizDifficulty,
        QuizQuantity,
        ReportFormat,
        SharePermission,
        ShareViewLevel,
        SlideDeckFormat,
        SlideDeckLength,
        VideoFormat,
        VideoStyle,
    )
}

API_NAMESPACES = {
    "notebooks",
    "sources",
    "artifacts",
    "chat",
    "research",
    "notes",
    "settings",
    "sharing",
}


def load_sync_module() -> Any:
    """Load sync-cookies.py even though its filename contains a hyphen."""
    spec = importlib.util.spec_from_file_location("sync_cookies_module", SYNC_SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load sync module from {SYNC_SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules.setdefault("sync_cookies_module", module)
    spec.loader.exec_module(module)
    return module


sync_cookies = load_sync_module()
sync_cookies.configure_logging()


def storage_path(profile: str = DEFAULT_NOTEBOOKLM_PROFILE) -> Path:
    """Return the explicit notebooklm-py storage path."""
    return Path("/Users/126colby/.notebooklm/storage_state.json")


class BridgeSettings(BaseModel):
    """Runtime settings for NotebookLM auth refresh."""

    nlm_profile: str = DEFAULT_NOTEBOOKLM_PROFILE
    chrome_profile_dir: str = DEFAULT_CHROME_PROFILE_DIR
    host_filter: str = DEFAULT_HOST_FILTER


class EmptyBody(BaseModel):
    """Request model for endpoints that accept an optional empty JSON body."""


class CliRequest(BaseModel):
    """Run a notebooklm CLI command with this bridge's storage file."""

    args: list[str] = Field(..., description="Arguments after `notebooklm`, e.g. ['list']")
    timeout: float = 300.0
    allow_interactive: bool = False


class RpcRequest(BaseModel):
    """Generic notebooklm-py API method call."""

    args: list[Any] = Field(default_factory=list)
    kwargs: dict[str, Any] = Field(default_factory=dict)


class NotebookCreateRequest(BaseModel):
    title: str


class NotebookRenameRequest(BaseModel):
    title: str


class ChatAskRequest(BaseModel):
    question: str
    source_ids: list[str] | None = None
    conversation_id: str | None = None


class ChatConfigureRequest(BaseModel):
    goal: str | None = None
    response_length: str | None = None
    custom_prompt: str | None = None


class SourceUrlRequest(BaseModel):
    url: str
    wait: bool = False
    wait_timeout: float = 120.0


class SourceTextRequest(BaseModel):
    title: str
    content: str
    wait: bool = False
    wait_timeout: float = 120.0


class SourceDriveRequest(BaseModel):
    file_id: str
    title: str
    mime_type: str = "application/vnd.google-apps.document"
    wait: bool = False
    wait_timeout: float = 120.0


class SourceFileRequest(BaseModel):
    file_path: str
    mime_type: str | None = None
    wait: bool = False
    wait_timeout: float = 120.0


class SourceFileBufferRequest(BaseModel):
    content_base64: str
    file_name: str
    mime_type: str | None = None


class RenameRequest(BaseModel):
    title: str


class ArtifactGenerateRequest(BaseModel):
    source_ids: list[str] | None = None
    language: str = "en"
    instructions: str | None = None
    audio_format: str | None = None
    audio_length: str | None = None
    video_format: str | None = None
    video_style: str | None = None
    report_format: str | None = None
    custom_prompt: str | None = None
    extra_instructions: str | None = None
    quantity: str | None = None
    difficulty: str | None = None
    orientation: str | None = None
    detail_level: str | None = None
    style: str | None = None
    slide_format: str | None = None
    slide_length: str | None = None


class ArtifactReviseSlideRequest(BaseModel):
    artifact_id: str
    slide_index: int
    prompt: str


class ArtifactWaitRequest(BaseModel):
    task_id: str
    timeout: float = 300.0
    poll_interval: float | None = None


class ArtifactDownloadRequest(BaseModel):
    output_path: str
    artifact_id: str | None = None
    output_format: str | None = None


class ArtifactExportRequest(BaseModel):
    artifact_id: str | None = None
    content: str | None = None
    title: str = "Export"
    export_type: str = "DOCS"


class ResearchStartRequest(BaseModel):
    query: str
    source: Literal["web", "drive"] = "web"
    mode: Literal["fast", "deep"] = "fast"


class ResearchImportRequest(BaseModel):
    task_id: str
    sources: list[dict[str, Any]]


class NoteCreateRequest(BaseModel):
    title: str = "New Note"
    content: str = ""


class NoteUpdateRequest(BaseModel):
    title: str
    content: str


class SharePublicRequest(BaseModel):
    public: bool


class ShareViewLevelRequest(BaseModel):
    level: str


class ShareUserRequest(BaseModel):
    email: str
    permission: str = "VIEWER"
    notify: bool = True
    welcome_message: str = ""


class LanguageRequest(BaseModel):
    language: str


def auth_dependency(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
) -> None:
    """Optionally protect the bridge with NOTEBOOKLM_FASTAPI_KEY."""
    if not SERVER_API_KEY:
        return
    bearer = ""
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip()
    supplied = x_api_key or bearer
    if supplied != SERVER_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


def jsonable(value: Any) -> Any:
    """Convert notebooklm-py dataclasses, enums, and paths to JSON values."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, Path):
        return str(value)
    if dataclasses.is_dataclass(value):
        return {key: jsonable(val) for key, val in dataclasses.asdict(value).items()}
    if isinstance(value, dict):
        return {str(key): jsonable(val) for key, val in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(item) for item in value]
    if hasattr(value, "__dict__"):
        return {key: jsonable(val) for key, val in vars(value).items() if not key.startswith("_")}
    return str(value)


def enum_value(enum_type: type[enum.Enum], value: Any) -> enum.Enum | None:
    """Coerce API strings into notebooklm-py enum members."""
    if value is None or isinstance(value, enum_type):
        return value
    if isinstance(value, str):
        normalized = value.replace("-", "_").upper()
        for member in enum_type:
            if member.name == normalized or str(member.value).replace("-", "_").upper() == normalized:
                return member
    return enum_type(value)


def maybe_enum_annotation(annotation: Any) -> type[enum.Enum] | None:
    """Extract an enum type from a method annotation, including optional unions."""
    if inspect.isclass(annotation) and issubclass(annotation, enum.Enum):
        return annotation
    origin = get_origin(annotation)
    if origin is None:
        return None
    for arg in get_args(annotation):
        found = maybe_enum_annotation(arg)
        if found is not None:
            return found
    return None


def coerce_method_kwargs(method: Any, kwargs: dict[str, Any]) -> dict[str, Any]:
    """Coerce generic RPC kwargs according to notebooklm-py method annotations."""
    signature = inspect.signature(method)
    coerced = dict(kwargs)
    for name, parameter in signature.parameters.items():
        if name not in coerced:
            continue
        enum_type = maybe_enum_annotation(parameter.annotation)
        if enum_type is not None:
            coerced[name] = enum_value(enum_type, coerced[name])
    return coerced


def is_auth_failure(exc: Exception) -> bool:
    """Detect auth failures that should trigger a Chrome-cookie refresh."""
    name = exc.__class__.__name__.lower()
    message = str(exc).lower()
    indicators = ("auth", "unauthorized", "forbidden", "401", "403", "cookie", "csrf", "session")
    return any(token in name or token in message for token in indicators)


async def refresh_storage(settings: BridgeSettings) -> dict[str, Any]:
    """Refresh notebooklm-py auth by decrypting cookies from Chrome Profile 6."""
    args = SimpleNamespace(
        profile_dir=settings.chrome_profile_dir,
        nlm_profile=settings.nlm_profile,
        host=settings.host_filter,
        beekeeper=False,
    )
    cookie_header, path = await asyncio.to_thread(sync_cookies.refresh_from_chrome, args)
    
    # Copy the cookies generated from sync-cookies.py to the targeted storage_state.json
    target = Path("/Users/126colby/.notebooklm/storage_state.json")
    if Path(path) != target:
        import shutil
        import stat
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        target.chmod(stat.S_IRUSR | stat.S_IWUSR)
        
    return {"storage_path": str(target), "cookieLength": len(cookie_header)}


async def ensure_storage(settings: BridgeSettings) -> None:
    """Ensure a storage_state.json exists before constructing a client."""
    if not storage_path(settings.nlm_profile).exists():
        await refresh_storage(settings)


async def with_client(operation: Any, settings: BridgeSettings | None = None) -> Any:
    """Run a notebooklm-py operation with one auth-refresh retry."""
    settings = settings or BridgeSettings()
    await ensure_storage(settings)

    async def run_once() -> Any:
        async with await NotebookLMClient.from_storage(str(storage_path(settings.nlm_profile))) as client:
            return await operation(client)

    try:
        return await run_once()
    except Exception as exc:
        if not is_auth_failure(exc):
            raise
        await refresh_storage(settings)
        return await run_once()


def cli_args_with_storage(args: list[str], settings: BridgeSettings) -> list[str]:
    """Build notebooklm CLI arguments pinned to this bridge's storage file."""
    return [str(NOTEBOOKLM_BIN), "--storage", str(storage_path(settings.nlm_profile)), *args]


app = FastAPI(
    title="NotebookLM FastAPI Bridge",
    description="Local HTTP bridge for notebooklm-py with Chrome Profile 6 cookie refresh.",
    version="0.1.0",
    dependencies=[Depends(auth_dependency)],
)


@app.exception_handler(Exception)
async def exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Return JSON errors for NotebookLM and bridge failures."""
    status = 401 if is_auth_failure(exc) else 500
    return JSONResponse(
        status_code=status,
        content={"ok": False, "error": str(exc), "type": exc.__class__.__name__},
    )


@app.get("/health")
async def health() -> dict[str, Any]:
    """Report bridge readiness without making an outbound NotebookLM call."""
    path = storage_path(DEFAULT_NOTEBOOKLM_PROFILE)
    return {
        "ok": True,
        "storageExists": path.exists(),
        "storagePath": str(path),
        "chromeProfileDir": DEFAULT_CHROME_PROFILE_DIR,
        "notebooklmProfile": DEFAULT_NOTEBOOKLM_PROFILE,
        "authRequired": bool(SERVER_API_KEY),
    }


@app.post("/auth/refresh")
async def refresh_auth(settings: BridgeSettings = BridgeSettings()) -> dict[str, Any]:
    """Force a Chrome Profile 6 cookie refresh into notebooklm-py's storage file."""
    result = await refresh_storage(settings)
    return {"ok": True, **result}


@app.post("/auth/check")
async def check_auth(settings: BridgeSettings = BridgeSettings()) -> dict[str, Any]:
    """Refresh if missing, then run `notebooklm auth check --test --json`."""
    await ensure_storage(settings)
    cmd = cli_args_with_storage(["auth", "check", "--test", "--json"], settings)
    result = await asyncio.to_thread(subprocess.run, cmd, capture_output=True, text=True, timeout=60)
    payload: dict[str, Any] = {"returncode": result.returncode}
    if result.stdout.strip():
        try:
            payload["stdout"] = json.loads(result.stdout)
        except json.JSONDecodeError:
            payload["stdout"] = result.stdout
    if result.stderr.strip():
        payload["stderr"] = result.stderr
    return {"ok": result.returncode == 0, **payload}


@app.post("/cli")
async def run_cli(body: CliRequest, settings: BridgeSettings = BridgeSettings()) -> dict[str, Any]:
    """Expose notebooklm-py's CLI with explicit storage and JSON stdout parsing."""
    if not body.allow_interactive and body.args and body.args[0] == "login":
        raise HTTPException(status_code=400, detail="Interactive `login` is disabled by default.")
    await ensure_storage(settings)
    cmd = cli_args_with_storage(body.args, settings)
    result = await asyncio.to_thread(
        subprocess.run,
        cmd,
        capture_output=True,
        text=True,
        timeout=body.timeout,
    )
    stdout: Any = result.stdout
    if result.stdout.strip():
        try:
            stdout = json.loads(result.stdout)
        except json.JSONDecodeError:
            stdout = result.stdout
    return {
        "ok": result.returncode == 0,
        "returncode": result.returncode,
        "stdout": stdout,
        "stderr": result.stderr,
    }


@app.post("/rpc/{namespace}/{method}")
async def rpc_call(namespace: str, method: str, body: RpcRequest) -> dict[str, Any]:
    """Generic bridge to any public method under a notebooklm-py API namespace."""
    if namespace not in API_NAMESPACES:
        raise HTTPException(status_code=404, detail=f"Unknown namespace: {namespace}")

    async def operation(client: NotebookLMClient) -> Any:
        api = getattr(client, namespace)
        fn = getattr(api, method, None)
        if fn is None:
            # Fallback: convert camelCase method name to snake_case
            snake_method = "".join(["_" + c.lower() if c.isupper() else c for c in method]).lstrip("_")
            fn = getattr(api, snake_method, None)
        if fn is None or method.startswith("_"):
            raise HTTPException(status_code=404, detail=f"Unknown method: {namespace}.{method}")
        kwargs = coerce_method_kwargs(fn, body.kwargs)
        return await fn(*body.args, **kwargs)

    result = await with_client(operation)
    return {"ok": True, "result": jsonable(result)}


@app.post("/notebooks/{notebook_id}/sources/file-buffer")
async def add_file_buffer(
    notebook_id: str,
    body: SourceFileBufferRequest,
    settings: BridgeSettings = BridgeSettings(),
) -> dict[str, Any]:
    """Upload a raw file buffer by decoding base64, writing it to a tempfile, and adding it as a source."""
    await ensure_storage(settings)
    
    import base64
    import tempfile
    
    try:
        content = base64.b64decode(body.content_base64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 content: {exc}")

    suffix = Path(body.file_name).suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        async def operation(client: NotebookLMClient) -> Any:
            return await client.sources.add_file(
                notebook_id,
                tmp_path,
                mime_type=body.mime_type,
            )
        
        result = await with_client(operation, settings)
        return {"ok": True, "source": jsonable(result)}
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@app.get("/notebooks/{notebook_id}/artifacts/download-raw/{kind}/{artifact_id}")
async def download_artifact_raw(
    notebook_id: str,
    kind: str,
    artifact_id: str,
    background_tasks: BackgroundTasks,
    output_format: str | None = Query(default=None),
    settings: BridgeSettings = BridgeSettings(),
) -> FileResponse:
    """Download a completed NotebookLM artifact as raw binary bytes streamed to the client."""
    await ensure_storage(settings)

    import tempfile
    
    suffix = ""
    kind_norm = kind.replace("-", "_")
    if kind_norm == "audio":
        suffix = ".mp3"
    elif kind_norm == "video":
        suffix = ".mp4"
    elif kind_norm == "slide_deck":
        suffix = f".{output_format or 'pdf'}"
    elif kind_norm == "infographic":
        suffix = ".png"

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.close()
    tmp_path = tmp.name

    def cleanup_file():
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

    background_tasks.add_task(cleanup_file)

    async def operation(client: NotebookLMClient) -> Any:
        method_name = f"download_{kind_norm}"
        method = getattr(client.artifacts, method_name, None)
        if method is None:
            raise HTTPException(status_code=404, detail=f"Unknown download type: {kind}")
        
        kwargs: dict[str, Any] = {"artifact_id": artifact_id}
        if kind_norm in {"quiz", "flashcards", "slide_deck"} and output_format:
            kwargs["output_format"] = output_format

        return await method(notebook_id, tmp_path, **kwargs)

    try:
        await with_client(operation, settings)
        
        media_type = "application/octet-stream"
        if kind_norm == "audio":
            media_type = "audio/mpeg"
        elif kind_norm == "video":
            media_type = "video/mp4"
        elif kind_norm == "slide_deck":
            if output_format == "pptx":
                media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            else:
                media_type = "application/pdf"
        elif kind_norm == "infographic":
            media_type = "image/png"

        return FileResponse(
            path=tmp_path,
            media_type=media_type,
            filename=f"{artifact_id}{suffix}",
        )
    except Exception as exc:
        cleanup_file()
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/notebooks")
async def list_notebooks() -> dict[str, Any]:
    result = await with_client(lambda client: client.notebooks.list())
    return {"ok": True, "notebooks": jsonable(result)}


@app.post("/notebooks")
async def create_notebook(body: NotebookCreateRequest) -> dict[str, Any]:
    result = await with_client(lambda client: client.notebooks.create(body.title))
    return {"ok": True, "notebook": jsonable(result)}


@app.get("/notebooks/{notebook_id}")
async def get_notebook(notebook_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.notebooks.get(notebook_id))
    return {"ok": True, "notebook": jsonable(result)}


@app.patch("/notebooks/{notebook_id}")
async def rename_notebook(notebook_id: str, body: NotebookRenameRequest) -> dict[str, Any]:
    result = await with_client(lambda client: client.notebooks.rename(notebook_id, body.title))
    return {"ok": True, "notebook": jsonable(result)}


@app.delete("/notebooks/{notebook_id}")
async def delete_notebook(notebook_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.notebooks.delete(notebook_id))
    return {"ok": True, "deleted": jsonable(result)}


@app.get("/notebooks/{notebook_id}/summary")
async def notebook_summary(notebook_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.notebooks.get_summary(notebook_id))
    return {"ok": True, "summary": jsonable(result)}


@app.get("/notebooks/{notebook_id}/metadata")
async def notebook_metadata(notebook_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.notebooks.get_metadata(notebook_id))
    return {"ok": True, "metadata": jsonable(result)}


@app.get("/notebooks/{notebook_id}/description")
async def notebook_description(notebook_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.notebooks.get_description(notebook_id))
    return {"ok": True, "description": jsonable(result)}


@app.post("/notebooks/{notebook_id}/chat/ask")
async def chat_ask(notebook_id: str, body: ChatAskRequest) -> dict[str, Any]:
    result = await with_client(
        lambda client: client.chat.ask(
            notebook_id,
            body.question,
            source_ids=body.source_ids,
            conversation_id=body.conversation_id,
        ),
    )
    return {"ok": True, "answer": jsonable(result)}


@app.post("/notebooks/{notebook_id}/chat/configure")
async def chat_configure(notebook_id: str, body: ChatConfigureRequest) -> dict[str, Any]:
    result = await with_client(
        lambda client: client.chat.configure(
            notebook_id,
            goal=enum_value(ChatGoal, body.goal) if body.goal else None,
            response_length=enum_value(ChatResponseLength, body.response_length)
            if body.response_length
            else None,
            custom_prompt=body.custom_prompt,
        ),
    )
    return {"ok": True, "result": jsonable(result)}


@app.get("/notebooks/{notebook_id}/chat/history")
async def chat_history(
    notebook_id: str,
    limit: int = 100,
    conversation_id: str | None = None,
) -> dict[str, Any]:
    result = await with_client(
        lambda client: client.chat.get_history(notebook_id, limit=limit, conversation_id=conversation_id),
    )
    return {"ok": True, "history": jsonable(result)}


@app.get("/notebooks/{notebook_id}/sources")
async def list_sources(notebook_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.sources.list(notebook_id))
    return {"ok": True, "sources": jsonable(result)}


@app.post("/notebooks/{notebook_id}/sources/url")
async def add_url_source(notebook_id: str, body: SourceUrlRequest) -> dict[str, Any]:
    result = await with_client(
        lambda client: client.sources.add_url(
            notebook_id,
            body.url,
            wait=body.wait,
            wait_timeout=body.wait_timeout,
        ),
    )
    return {"ok": True, "source": jsonable(result)}


@app.post("/notebooks/{notebook_id}/sources/text")
async def add_text_source(notebook_id: str, body: SourceTextRequest) -> dict[str, Any]:
    result = await with_client(
        lambda client: client.sources.add_text(
            notebook_id,
            body.title,
            body.content,
            wait=body.wait,
            wait_timeout=body.wait_timeout,
        ),
    )
    return {"ok": True, "source": jsonable(result)}


@app.post("/notebooks/{notebook_id}/sources/drive")
async def add_drive_source(notebook_id: str, body: SourceDriveRequest) -> dict[str, Any]:
    result = await with_client(
        lambda client: client.sources.add_drive(
            notebook_id,
            body.file_id,
            body.title,
            mime_type=body.mime_type,
            wait=body.wait,
            wait_timeout=body.wait_timeout,
        ),
    )
    return {"ok": True, "source": jsonable(result)}


@app.post("/notebooks/{notebook_id}/sources/file")
async def add_file_source(notebook_id: str, body: SourceFileRequest) -> dict[str, Any]:
    result = await with_client(
        lambda client: client.sources.add_file(
            notebook_id,
            body.file_path,
            mime_type=body.mime_type,
            wait=body.wait,
            wait_timeout=body.wait_timeout,
        ),
    )
    return {"ok": True, "source": jsonable(result)}


@app.get("/notebooks/{notebook_id}/sources/{source_id}")
async def get_source(notebook_id: str, source_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.sources.get(notebook_id, source_id))
    return {"ok": True, "source": jsonable(result)}


@app.get("/notebooks/{notebook_id}/sources/{source_id}/fulltext")
async def source_fulltext(notebook_id: str, source_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.sources.get_fulltext(notebook_id, source_id))
    return {"ok": True, "fulltext": jsonable(result)}


@app.post("/notebooks/{notebook_id}/sources/{source_id}/refresh")
async def refresh_source(notebook_id: str, source_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.sources.refresh(notebook_id, source_id))
    return {"ok": True, "refreshed": jsonable(result)}


@app.patch("/notebooks/{notebook_id}/sources/{source_id}")
async def rename_source(notebook_id: str, source_id: str, body: RenameRequest) -> dict[str, Any]:
    result = await with_client(lambda client: client.sources.rename(notebook_id, source_id, body.title))
    return {"ok": True, "source": jsonable(result)}


@app.delete("/notebooks/{notebook_id}/sources/{source_id}")
async def delete_source(notebook_id: str, source_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.sources.delete(notebook_id, source_id))
    return {"ok": True, "deleted": jsonable(result)}


@app.get("/notebooks/{notebook_id}/artifacts")
async def list_artifacts(notebook_id: str, artifact_type: str | None = Query(default=None)) -> dict[str, Any]:
    enum_type = enum_value(ArtifactType, artifact_type) if artifact_type else None
    result = await with_client(lambda client: client.artifacts.list(notebook_id, enum_type))
    return {"ok": True, "artifacts": jsonable(result)}


@app.post("/notebooks/{notebook_id}/artifacts/generate/{kind}")
async def generate_artifact(notebook_id: str, kind: str, body: ArtifactGenerateRequest) -> dict[str, Any]:
    async def operation(client: NotebookLMClient) -> Any:
        match kind.replace("-", "_"):
            case "audio":
                return await client.artifacts.generate_audio(
                    notebook_id,
                    source_ids=body.source_ids,
                    language=body.language,
                    instructions=body.instructions,
                    audio_format=enum_value(AudioFormat, body.audio_format) if body.audio_format else None,
                    audio_length=enum_value(AudioLength, body.audio_length) if body.audio_length else None,
                )
            case "video":
                return await client.artifacts.generate_video(
                    notebook_id,
                    source_ids=body.source_ids,
                    language=body.language,
                    instructions=body.instructions,
                    video_format=enum_value(VideoFormat, body.video_format) if body.video_format else None,
                    video_style=enum_value(VideoStyle, body.video_style) if body.video_style else None,
                )
            case "cinematic_video":
                return await client.artifacts.generate_cinematic_video(
                    notebook_id,
                    source_ids=body.source_ids,
                    language=body.language,
                    instructions=body.instructions,
                )
            case "report":
                return await client.artifacts.generate_report(
                    notebook_id,
                    report_format=enum_value(ReportFormat, body.report_format)
                    if body.report_format
                    else ReportFormat.BRIEFING_DOC,
                    source_ids=body.source_ids,
                    language=body.language,
                    custom_prompt=body.custom_prompt,
                    extra_instructions=body.extra_instructions,
                )
            case "study_guide":
                return await client.artifacts.generate_study_guide(
                    notebook_id,
                    source_ids=body.source_ids,
                    language=body.language,
                    extra_instructions=body.extra_instructions,
                )
            case "quiz":
                return await client.artifacts.generate_quiz(
                    notebook_id,
                    source_ids=body.source_ids,
                    instructions=body.instructions,
                    quantity=enum_value(QuizQuantity, body.quantity) if body.quantity else None,
                    difficulty=enum_value(QuizDifficulty, body.difficulty) if body.difficulty else None,
                )
            case "flashcards":
                return await client.artifacts.generate_flashcards(
                    notebook_id,
                    source_ids=body.source_ids,
                    instructions=body.instructions,
                    quantity=enum_value(QuizQuantity, body.quantity) if body.quantity else None,
                    difficulty=enum_value(QuizDifficulty, body.difficulty) if body.difficulty else None,
                )
            case "infographic":
                return await client.artifacts.generate_infographic(
                    notebook_id,
                    source_ids=body.source_ids,
                    language=body.language,
                    instructions=body.instructions,
                    orientation=enum_value(InfographicOrientation, body.orientation)
                    if body.orientation
                    else None,
                    detail_level=enum_value(InfographicDetail, body.detail_level)
                    if body.detail_level
                    else None,
                    style=enum_value(InfographicStyle, body.style) if body.style else None,
                )
            case "slide_deck":
                return await client.artifacts.generate_slide_deck(
                    notebook_id,
                    source_ids=body.source_ids,
                    language=body.language,
                    instructions=body.instructions,
                    slide_format=enum_value(SlideDeckFormat, body.slide_format)
                    if body.slide_format
                    else None,
                    slide_length=enum_value(SlideDeckLength, body.slide_length)
                    if body.slide_length
                    else None,
                )
            case "data_table":
                return await client.artifacts.generate_data_table(
                    notebook_id,
                    source_ids=body.source_ids,
                    language=body.language,
                    instructions=body.instructions,
                )
            case "mind_map":
                return await client.artifacts.generate_mind_map(notebook_id, source_ids=body.source_ids)
            case _:
                raise HTTPException(status_code=404, detail=f"Unknown artifact kind: {kind}")

    result = await with_client(operation)
    return {"ok": True, "generation": jsonable(result)}


@app.post("/notebooks/{notebook_id}/artifacts/poll/{task_id}")
async def poll_artifact(notebook_id: str, task_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.artifacts.poll_status(notebook_id, task_id))
    return {"ok": True, "status": jsonable(result)}


@app.post("/notebooks/{notebook_id}/artifacts/wait")
async def wait_artifact(notebook_id: str, body: ArtifactWaitRequest) -> dict[str, Any]:
    result = await with_client(
        lambda client: client.artifacts.wait_for_completion(
            notebook_id,
            body.task_id,
            timeout=body.timeout,
            poll_interval=body.poll_interval,
        ),
    )
    return {"ok": True, "status": jsonable(result)}


@app.post("/notebooks/{notebook_id}/artifacts/download/{kind}")
async def download_artifact(notebook_id: str, kind: str, body: ArtifactDownloadRequest) -> dict[str, Any]:
    async def operation(client: NotebookLMClient) -> Any:
        method_name = f"download_{kind.replace('-', '_')}"
        method = getattr(client.artifacts, method_name, None)
        if method is None:
            raise HTTPException(status_code=404, detail=f"Unknown download type: {kind}")
        kwargs: dict[str, Any] = {"artifact_id": body.artifact_id}
        if kind.replace("-", "_") in {"quiz", "flashcards", "slide_deck"} and body.output_format:
            kwargs["output_format"] = body.output_format
        return await method(notebook_id, body.output_path, **kwargs)

    result = await with_client(operation)
    return {"ok": True, "path": jsonable(result)}


@app.post("/notebooks/{notebook_id}/artifacts/export")
async def export_artifact(notebook_id: str, body: ArtifactExportRequest) -> dict[str, Any]:
    result = await with_client(
        lambda client: client.artifacts.export(
            notebook_id,
            artifact_id=body.artifact_id,
            content=body.content,
            title=body.title,
            export_type=enum_value(ExportType, body.export_type),
        ),
    )
    return {"ok": True, "export": jsonable(result)}


@app.patch("/notebooks/{notebook_id}/artifacts/{artifact_id}")
async def rename_artifact(notebook_id: str, artifact_id: str, body: RenameRequest) -> dict[str, Any]:
    result = await with_client(lambda client: client.artifacts.rename(notebook_id, artifact_id, body.title))
    return {"ok": True, "result": jsonable(result)}


@app.delete("/notebooks/{notebook_id}/artifacts/{artifact_id}")
async def delete_artifact(notebook_id: str, artifact_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.artifacts.delete(notebook_id, artifact_id))
    return {"ok": True, "deleted": jsonable(result)}


@app.post("/notebooks/{notebook_id}/artifacts/revise-slide")
async def revise_slide(notebook_id: str, body: ArtifactReviseSlideRequest) -> dict[str, Any]:
    result = await with_client(
        lambda client: client.artifacts.revise_slide(
            notebook_id,
            body.artifact_id,
            body.slide_index,
            body.prompt,
        ),
    )
    return {"ok": True, "generation": jsonable(result)}


@app.post("/notebooks/{notebook_id}/research/start")
async def research_start(notebook_id: str, body: ResearchStartRequest) -> dict[str, Any]:
    result = await with_client(lambda client: client.research.start(notebook_id, body.query, body.source, body.mode))
    return {"ok": True, "research": jsonable(result)}


@app.get("/notebooks/{notebook_id}/research/status")
async def research_status(notebook_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.research.poll(notebook_id))
    return {"ok": True, "research": jsonable(result)}


@app.post("/notebooks/{notebook_id}/research/import")
async def research_import(notebook_id: str, body: ResearchImportRequest) -> dict[str, Any]:
    result = await with_client(lambda client: client.research.import_sources(notebook_id, body.task_id, body.sources))
    return {"ok": True, "sources": jsonable(result)}


@app.get("/notebooks/{notebook_id}/notes")
async def list_notes(notebook_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.notes.list(notebook_id))
    return {"ok": True, "notes": jsonable(result)}


@app.post("/notebooks/{notebook_id}/notes")
async def create_note(notebook_id: str, body: NoteCreateRequest) -> dict[str, Any]:
    result = await with_client(lambda client: client.notes.create(notebook_id, title=body.title, content=body.content))
    return {"ok": True, "note": jsonable(result)}


@app.get("/notebooks/{notebook_id}/notes/{note_id}")
async def get_note(notebook_id: str, note_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.notes.get(notebook_id, note_id))
    return {"ok": True, "note": jsonable(result)}


@app.patch("/notebooks/{notebook_id}/notes/{note_id}")
async def update_note(notebook_id: str, note_id: str, body: NoteUpdateRequest) -> dict[str, Any]:
    result = await with_client(lambda client: client.notes.update(notebook_id, note_id, body.content, body.title))
    return {"ok": True, "result": jsonable(result)}


@app.delete("/notebooks/{notebook_id}/notes/{note_id}")
async def delete_note(notebook_id: str, note_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.notes.delete(notebook_id, note_id))
    return {"ok": True, "deleted": jsonable(result)}


@app.get("/notebooks/{notebook_id}/mind-maps")
async def list_mind_maps(notebook_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.notes.list_mind_maps(notebook_id))
    return {"ok": True, "mindMaps": jsonable(result)}


@app.delete("/notebooks/{notebook_id}/mind-maps/{mind_map_id}")
async def delete_mind_map(notebook_id: str, mind_map_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.notes.delete_mind_map(notebook_id, mind_map_id))
    return {"ok": True, "deleted": jsonable(result)}


@app.get("/notebooks/{notebook_id}/sharing")
async def sharing_status(notebook_id: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.sharing.get_status(notebook_id))
    return {"ok": True, "sharing": jsonable(result)}


@app.post("/notebooks/{notebook_id}/sharing/public")
async def sharing_public(notebook_id: str, body: SharePublicRequest) -> dict[str, Any]:
    result = await with_client(lambda client: client.sharing.set_public(notebook_id, body.public))
    return {"ok": True, "sharing": jsonable(result)}


@app.post("/notebooks/{notebook_id}/sharing/view-level")
async def sharing_view_level(notebook_id: str, body: ShareViewLevelRequest) -> dict[str, Any]:
    result = await with_client(
        lambda client: client.sharing.set_view_level(notebook_id, enum_value(ShareViewLevel, body.level)),
    )
    return {"ok": True, "result": jsonable(result)}


@app.post("/notebooks/{notebook_id}/sharing/users")
async def sharing_add_user(notebook_id: str, body: ShareUserRequest) -> dict[str, Any]:
    result = await with_client(
        lambda client: client.sharing.add_user(
            notebook_id,
            body.email,
            permission=enum_value(SharePermission, body.permission),
            notify=body.notify,
            welcome_message=body.welcome_message,
        ),
    )
    return {"ok": True, "sharing": jsonable(result)}


@app.patch("/notebooks/{notebook_id}/sharing/users/{email}")
async def sharing_update_user(notebook_id: str, email: str, body: ShareUserRequest) -> dict[str, Any]:
    result = await with_client(
        lambda client: client.sharing.update_user(
            notebook_id,
            email,
            enum_value(SharePermission, body.permission),
        ),
    )
    return {"ok": True, "sharing": jsonable(result)}


@app.delete("/notebooks/{notebook_id}/sharing/users/{email}")
async def sharing_remove_user(notebook_id: str, email: str) -> dict[str, Any]:
    result = await with_client(lambda client: client.sharing.remove_user(notebook_id, email))
    return {"ok": True, "sharing": jsonable(result)}


@app.get("/settings/language")
async def get_language() -> dict[str, Any]:
    result = await with_client(lambda client: client.settings.get_output_language())
    return {"ok": True, "language": jsonable(result)}


@app.post("/settings/language")
async def set_language(body: LanguageRequest) -> dict[str, Any]:
    result = await with_client(lambda client: client.settings.set_output_language(body.language))
    return {"ok": True, "language": jsonable(result)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "notebooklm_fastapi_server:app",
        host=os.environ.get("NOTEBOOKLM_FASTAPI_HOST", "127.0.0.1"),
        port=int(os.environ.get("NOTEBOOKLM_FASTAPI_PORT", "8789")),
        reload=os.environ.get("NOTEBOOKLM_FASTAPI_RELOAD") == "1",
    )
