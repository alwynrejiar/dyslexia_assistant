import logging
import os
import sys
from pathlib import Path
from typing import Optional

from dotenv import dotenv_values

# Allow importing project-root model.py when running from backend/.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import model

logger = logging.getLogger(__name__)

_CLIENT: Optional[object] = None
_PLACEHOLDER_KEYS = {
    "your_key_here",
    "your-api-key",
    "your_api_key",
    "changeme",
}


def _clean_api_key(value: Optional[str]) -> str:
    key = (value or "").strip()
    if (key.startswith('"') and key.endswith('"')) or (key.startswith("'") and key.endswith("'")):
        key = key[1:-1].strip()
    return key


def _is_placeholder_key(value: str) -> bool:
    return value.strip().lower() in _PLACEHOLDER_KEYS


def _read_key_from_env_file(path: Path) -> str:
    if not path.exists():
        return ""
    try:
        return _clean_api_key(str(dotenv_values(path).get("GEMINI_API_KEY", "")))
    except Exception:
        return ""


def initialize_client(api_key: Optional[str] = None) -> bool:
    global _CLIENT

    backend_env = Path(__file__).resolve().parents[1] / ".env"
    root_env = PROJECT_ROOT / ".env"

    requested_key = _clean_api_key(api_key)
    runtime_env_key = _clean_api_key(os.getenv("GEMINI_API_KEY", ""))
    root_file_key = _read_key_from_env_file(root_env)
    backend_file_key = _read_key_from_env_file(backend_env)

    key_candidates = [requested_key, runtime_env_key, root_file_key, backend_file_key]
    key = ""
    for candidate in key_candidates:
        if candidate and not _is_placeholder_key(candidate):
            key = candidate
            break

    if not key:
        logger.warning("GEMINI_API_KEY is missing. /analyze will fail until configured.")
        _CLIENT = None
        return False

    if backend_file_key and _is_placeholder_key(backend_file_key):
        logger.warning("Ignoring placeholder GEMINI_API_KEY in backend/.env")

    _CLIENT = model.make_client(key)
    logger.info("Gemini client initialized")
    return True


def client_ready() -> bool:
    return _CLIENT is not None


def _run_with_client(client: object, image_bytes: bytes, media_type: str) -> tuple[str, str, str]:
    # Reuse existing project compression logic from model.py.
    compressed_bytes = model.compress_image(image_bytes, max_dim=1200, quality=85)

    raw_text = model.transcribe_stream(
        client=client,
        image_bytes=compressed_bytes,
        media_type="image/jpeg",
    )

    analysis, corrected = model.analyse_and_correct_stream(
        client=client,
        raw_transcription=raw_text,
    )

    return raw_text, analysis, corrected


def run_pipeline(image_bytes: bytes, media_type: str) -> tuple[str, str, str]:
    if _CLIENT is None:
        raise RuntimeError("Gemini client is not initialized")

    return _run_with_client(_CLIENT, image_bytes, media_type)


def run_pipeline_with_api_key(image_bytes: bytes, media_type: str, api_key: str) -> tuple[str, str, str]:
    key = _clean_api_key(api_key)
    if not key:
        raise RuntimeError("Gemini API key is empty")

    request_client = model.make_client(key)
    return _run_with_client(request_client, image_bytes, media_type)
