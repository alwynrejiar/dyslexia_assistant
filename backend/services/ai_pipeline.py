import logging
import os
import sys
import base64
import json
import urllib.error
import urllib.request
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

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_DEFAULT_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-flash")

TRANSCRIBE_PROMPT = (
    "You are an expert at reading dysgraphic and dyslexic handwriting. "
    "Transcribe the handwritten text in this image EXACTLY as written. "
    "Preserve every misspelling, reversed letter, phonetic spelling, "
    "omission, transposition, capitalisation error, and spacing error. "
    "Do NOT autocorrect or fix anything - accurate error preservation is "
    "essential for diagnosing the writer's dyslexia/dysgraphia. "
    "Output ONLY the raw transcription, no commentary or explanation."
)


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


def _analysis_prompt(raw_transcription: str) -> str:
    return (
        "The following text was transcribed from a handwriting sample written by "
        "someone with dyslexia or dysgraphia. The transcription preserves all "
        "original errors:\n\n"
        f"<raw_transcription>\n{raw_transcription}\n</raw_transcription>\n\n"
        "Respond in EXACTLY this format, with no extra text outside the tags:\n\n"
        "<analysis>\n"
        "For each error, write one bullet:\n"
        "- Written: [word as written] -> Intended: [correct word] · "
        "Type: [REV=reversal / PHON=phonetic / OMIT=omission / "
        "TRANS=transposition / CAP=capitalisation / SPACE=spacing / "
        "SUB=substitution / ADD=addition / OTHER]\n\n"
        "End with a short Summary paragraph describing the overall "
        "dyslexia/dysgraphia indicators observed.\n"
        "</analysis>\n\n"
        "<corrected>\n"
        "[The fully corrected text. Fix all errors. Preserve the author's "
        "original meaning, tone, and voice exactly.]\n"
        "</corrected>"
    )


def _extract_tag(text: str, tag: str) -> str:
    start = text.find(f"<{tag}>")
    end = text.find(f"</{tag}>")
    if start == -1:
        return ""
    return text[start + len(f"<{tag}>") : end if end != -1 else len(text)].strip()


def _openrouter_request(
    api_key: str,
    prompt: str,
    image_bytes: Optional[bytes] = None,
    media_type: str = "image/jpeg",
    max_tokens: int = 2000,
) -> str:
    user_content: list[dict[str, object]] = [{"type": "text", "text": prompt}]
    if image_bytes is not None:
        data_url = f"data:{media_type};base64,{base64.b64encode(image_bytes).decode('utf-8')}"
        user_content.insert(0, {"type": "image_url", "image_url": {"url": data_url}})

    payload = {
        "model": OPENROUTER_DEFAULT_MODEL,
        "messages": [{"role": "user", "content": user_content}],
        "temperature": 0.1,
        "max_tokens": max_tokens,
    }

    request = urllib.request.Request(
        OPENROUTER_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://127.0.0.1",
            "X-Title": "DyslexaRead",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore") if exc.fp else ""
        if exc.code in (401, 403):
            raise RuntimeError("Invalid OpenRouter API key")
        if exc.code == 402:
            raise RuntimeError(f"OpenRouter credits/quota issue (402): {body[:300]}")
        raise RuntimeError(f"OpenRouter API error ({exc.code}): {body[:300]}")
    except urllib.error.URLError as exc:
        raise RuntimeError(f"OpenRouter network error: {exc}")

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        raise RuntimeError("OpenRouter returned invalid JSON")

    choices = parsed.get("choices") or []
    if not choices:
        raise RuntimeError(f"OpenRouter returned no choices: {body[:300]}")

    message = choices[0].get("message") or {}
    content = message.get("content", "")
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        chunks: list[str] = []
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                chunks.append(item["text"])
        return "\n".join(chunks).strip()

    return ""


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


def run_pipeline_with_openrouter_api_key(image_bytes: bytes, media_type: str, api_key: str) -> tuple[str, str, str]:
    key = _clean_api_key(api_key)
    if not key:
        raise RuntimeError("OpenRouter API key is empty")

    compressed_bytes = model.compress_image(image_bytes, max_dim=1200, quality=85)
    raw_text = _openrouter_request(
        api_key=key,
        prompt=TRANSCRIBE_PROMPT,
        image_bytes=compressed_bytes,
        media_type="image/jpeg",
        max_tokens=1200,
    )
    if not raw_text:
        raise RuntimeError("OpenRouter returned empty transcription")

    analysis_response = _openrouter_request(
        api_key=key,
        prompt=_analysis_prompt(raw_text),
        max_tokens=2200,
    )
    analysis = _extract_tag(analysis_response, "analysis")
    corrected = _extract_tag(analysis_response, "corrected")

    if not analysis and not corrected:
        # Fallback if model ignored tag format.
        corrected = analysis_response.strip()

    return raw_text, analysis, corrected
