import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from models.schemas import AnalyzeResponse, HealthResponse
from services.ai_pipeline import (
    client_ready,
    initialize_client,
    run_pipeline,
    run_pipeline_with_api_key,
    run_pipeline_with_openrouter_api_key,
)
from utils.image_utils import normalized_mime, validate_image_bytes, validate_upload_file

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("dyslexaread.api")

PIPELINE_TIMEOUT_SECONDS = 120


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_client()
    yield


app = FastAPI(
    title="DyslexaRead API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        client_ready=client_ready(),
    )


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    file: UploadFile = File(...),
    x_gemini_api_key: str | None = Header(default=None),
    x_openrouter_api_key: str | None = Header(default=None),
) -> AnalyzeResponse:
    validate_upload_file(file)

    image_bytes = await file.read()
    validate_image_bytes(image_bytes)

    media_type = normalized_mime(file.content_type)
    logger.info("Processing image: name=%s content_type=%s size=%s", file.filename, media_type, len(image_bytes))

    try:
        if x_openrouter_api_key:
            pipeline_fn = run_pipeline_with_openrouter_api_key
            pipeline_args = (image_bytes, media_type, x_openrouter_api_key)
        elif x_gemini_api_key:
            pipeline_fn = run_pipeline_with_api_key
            pipeline_args = (image_bytes, media_type, x_gemini_api_key)
        else:
            pipeline_fn = run_pipeline
            pipeline_args = (image_bytes, media_type)

        raw, analysis, corrected = await asyncio.wait_for(
            run_in_threadpool(pipeline_fn, *pipeline_args),
            timeout=PIPELINE_TIMEOUT_SECONDS,
        )
    except TimeoutError:
        logger.exception("Analysis request timed out")
        raise HTTPException(status_code=504, detail="Analysis timed out")
    except RuntimeError as exc:
        if "OpenRouter credits/quota issue (402)" in str(exc):
            raise HTTPException(
                status_code=402,
                detail="OpenRouter credits are insufficient for this request. Add credits or use Gemini key/backend .env key.",
            )
        logger.exception("Client configuration error")
        raise HTTPException(status_code=500, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        if "Invalid OpenRouter API key" in str(exc):
            raise HTTPException(
                status_code=401,
                detail="Invalid OpenRouter API key. Remove extra quotes/spaces and try again.",
            )
        if "API_KEY_INVALID" in str(exc) or "API key not valid" in str(exc):
            raise HTTPException(
                status_code=401,
                detail="Invalid Gemini API key. Remove extra quotes/spaces and try again, or clear the key to use backend .env.",
            )
        logger.exception("Analysis failed")
        raise HTTPException(status_code=502, detail=f"AI processing failed: {exc}")

    return AnalyzeResponse(raw=raw, analysis=analysis, corrected=corrected)


ROOT_DIR = Path(__file__).resolve().parents[1]
app.mount("/", StaticFiles(directory=ROOT_DIR, html=True), name="static")
