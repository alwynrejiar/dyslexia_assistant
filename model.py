"""
model.py — Google Gemini Vision & Chat Client Module
Drop-in replacement for the Ollama/Anthropic model.py.

Uses Google AI Studio (Gemini) — FREE tier via aistudio.google.com
  • gemini-2.5-flash       → best quality, free, supports vision
  • gemini-3-flash-preview → fastest, free, supports vision

Speed: ~5–15 seconds total (vs 3–5 minutes with local Ollama)
Cost:  FREE on Google AI Studio free tier

Install:
    pip install google-genai Pillow
"""

import io
import base64
from pathlib import Path
from google import genai
from google.genai import types

# ── Constants ────────────────────────────────────────────────────

# Best free model for handwriting analysis (vision + fast + free)
DEFAULT_MODEL = "gemini-2.5-flash"

IMAGE_TYPES = {
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".gif":  "image/gif",
    ".webp": "image/webp",
    ".bmp":  "image/bmp",
}


# ── Client ───────────────────────────────────────────────────────

def make_client(api_key: str) -> genai.Client:
    """Create and return a Google Gemini client."""
    return genai.Client(api_key=api_key)


def validate_api_key(api_key: str) -> tuple[bool, str]:
    """
    Test the API key with a minimal call.
    Returns (success: bool, message: str).
    """
    if not api_key or len(api_key) < 20:
        return False, "Key looks too short — check you copied it fully"
    try:
        client = make_client(api_key)
        models = list(client.models.list())
        if models:
            return True, f"Connected · {DEFAULT_MODEL}"
        return True, "Connected to Google AI Studio"
    except Exception as e:
        msg = str(e)
        if "API_KEY_INVALID" in msg or "invalid" in msg.lower():
            return False, "Invalid API key — check aistudio.google.com"
        if "quota" in msg.lower():
            return False, "Quota exceeded — wait a moment and retry"
        return False, f"Connection error: {msg[:120]}"


def make_claude_client(api_key: str):
    """Create and return an Anthropic Claude client."""
    import anthropic
    return anthropic.Anthropic(api_key=api_key)


def validate_claude_api_key(api_key: str) -> tuple[bool, str]:
    """
    Test the Anthropic API key.
    Returns (success: bool, message: str).
    """
    if not api_key or len(api_key) < 20 or not api_key.startswith("sk-ant"):
        return False, "Key looks invalid — should start with sk-ant..."
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        # Make a tiny request to validate key
        msg = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=10,
            messages=[{"role": "user", "content": "hi"}]
        )
        return True, "Connected · Claude 3.5 Sonnet / Haiku"
    except Exception as e:
        msg = str(e)
        if "authentication" in msg.lower() or "invalid x-api-key" in msg.lower() or "not valid" in msg.lower():
            return False, "Invalid API key — check console.anthropic.com"
        if "credit balance" in msg.lower() or "insufficient_quota" in msg.lower():
            return False, "Anthropic requires prepaying (e.g. $5) to use the API. Pls fund."
        return False, f"Connection error: {msg[:120]}"

# ── Image helpers ────────────────────────────────────────────────

def encode_image_file(image_path: str) -> tuple[bytes, str]:
    """
    Read an image file and return (raw_bytes, media_type).
    Raises ValueError for unsupported formats.
    """
    ext = Path(image_path).suffix.lower()
    media_type = IMAGE_TYPES.get(ext)
    if not media_type:
        raise ValueError(f"Unsupported image type: {ext}. Use JPG, PNG, WebP or BMP.")
    with open(image_path, "rb") as f:
        return f.read(), media_type


def encode_image_bytes(image_bytes: bytes, media_type: str = "image/jpeg") -> tuple[bytes, str]:
    """Pass through raw image bytes with media type."""
    return image_bytes, media_type


def compress_image(image_bytes: bytes, max_dim: int = 1200, quality: int = 85) -> bytes:
    """
    Resize and JPEG-compress an image for faster API transfer.
    Returns compressed JPEG bytes.
    """
    from PIL import Image
    img = Image.open(io.BytesIO(image_bytes))
    img.thumbnail((max_dim, max_dim))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def _make_image_part(image_bytes: bytes, media_type: str) -> types.Part:
    """Create a Gemini image Part from raw bytes."""
    return types.Part.from_bytes(data=image_bytes, mime_type=media_type)


# ── Step 1: Raw Transcription ────────────────────────────────────

def transcribe_stream(
    client: genai.Client,
    image_bytes: bytes,
    media_type: str = "image/jpeg",
    on_chunk=None,
    model: str = DEFAULT_MODEL,
) -> str:
    """
    Step 1 — Transcribe handwriting EXACTLY as written (preserve all errors).

    Args:
        client:      Gemini client instance.
        image_bytes: Raw image bytes.
        media_type:  Image MIME type.
        on_chunk:    Optional callback(partial_text) for live streaming UI updates.
        model:       Gemini model string.

    Returns:
        Full raw transcription string.
    """
    prompt = (
        "You are an expert at reading dysgraphic and dyslexic handwriting. "
        "Transcribe the handwritten text in this image EXACTLY as written. "
        "Preserve every misspelling, reversed letter, phonetic spelling, "
        "omission, transposition, capitalisation error, and spacing error. "
        "Do NOT autocorrect or fix anything — accurate error preservation is "
        "essential for diagnosing the writer's dyslexia/dysgraphia. "
        "Output ONLY the raw transcription, no commentary or explanation."
    )

    image_part = _make_image_part(image_bytes, media_type)
    full_text = ""

    for chunk in client.models.generate_content_stream(
        model=model,
        contents=[image_part, prompt],
    ):
        delta = chunk.text or ""
        full_text += delta
        if on_chunk and delta:
            on_chunk(full_text)

    return full_text.strip()


def transcribe_stream_claude(
    client,
    image_bytes: bytes,
    media_type: str = "image/jpeg",
    on_chunk=None,
    model: str = "claude-3-5-sonnet-20241022",
) -> str:
    """Claude Step 1: Transcription"""
    import anthropic
    b64_img = base64.b64encode(image_bytes).decode('utf-8')
    prompt = (
        "You are an expert at reading dysgraphic and dyslexic handwriting. "
        "Transcribe the handwritten text in this image EXACTLY as written. "
        "Preserve every misspelling, reversed letter, phonetic spelling, "
        "omission, transposition, capitalisation error, and spacing error. "
        "Do NOT autocorrect or fix anything — accurate error preservation is "
        "essential for diagnosing the writer's dyslexia/dysgraphia. "
        "Output ONLY the raw transcription, no commentary or explanation."
    )
    full_text = ""
    with client.messages.stream(
        max_tokens=1500,
        model=model,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": b64_img
                        }
                    },
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            }
        ]
    ) as stream:
        for text in stream.text_stream:
            full_text += text
            if on_chunk:
                on_chunk(full_text)
                
    return full_text.strip()

# ── Step 2: Error Analysis + Correction ─────────────────────────

def analyse_and_correct_stream(
    client: genai.Client,
    raw_transcription: str,
    on_analysis_chunk=None,
    on_corrected_chunk=None,
    model: str = DEFAULT_MODEL,
) -> tuple[str, str]:
    """
    Step 2 — Combined error analysis + correction in one API call.
    Uses XML delimiters to split the streaming response into two sections.

    Args:
        client:              Gemini client instance.
        raw_transcription:   Output from transcribe_stream().
        on_analysis_chunk:   Callback(partial_text) for streaming analysis tab.
        on_corrected_chunk:  Callback(partial_text) for streaming corrected tab.
        model:               Gemini model string.

    Returns:
        (analysis_text, corrected_text) tuple.
    """
    prompt = (
        f"The following text was transcribed from a handwriting sample written by "
        f"someone with dyslexia or dysgraphia. The transcription preserves all "
        f"original errors:\n\n"
        f"<raw_transcription>\n{raw_transcription}\n</raw_transcription>\n\n"
        f"Respond in EXACTLY this format, with no extra text outside the tags:\n\n"
        f"<analysis>\n"
        f"For each error, write one bullet:\n"
        f"• Written: [word as written] → Intended: [correct word] · "
        f"Type: [REV=reversal / PHON=phonetic / OMIT=omission / "
        f"TRANS=transposition / CAP=capitalisation / SPACE=spacing / "
        f"SUB=substitution / ADD=addition / OTHER]\n\n"
        f"End with a short Summary paragraph describing the overall "
        f"dyslexia/dysgraphia indicators observed.\n"
        f"</analysis>\n\n"
        f"<corrected>\n"
        f"[The fully corrected text. Fix all errors. Preserve the author's "
        f"original meaning, tone, and voice exactly.]\n"
        f"</corrected>"
    )

    full_text = ""

    for chunk in client.models.generate_content_stream(
        model=model,
        contents=[prompt],
    ):
        delta = chunk.text or ""
        full_text += delta

        # Stream analysis section live
        if "<analysis>" in full_text:
            a_start = full_text.find("<analysis>") + len("<analysis>")
            a_end = full_text.find("</analysis>") if "</analysis>" in full_text else len(full_text)
            partial = full_text[a_start:a_end].strip()
            if partial and on_analysis_chunk:
                on_analysis_chunk(partial)

        # Stream corrected section live
        if "<corrected>" in full_text:
            c_start = full_text.find("<corrected>") + len("<corrected>")
            c_end = full_text.find("</corrected>") if "</corrected>" in full_text else len(full_text)
            partial = full_text[c_start:c_end].strip()
            if partial and on_corrected_chunk:
                on_corrected_chunk(partial)

    # Final clean parse after stream ends
    def extract(tag):
        start = full_text.find(f"<{tag}>")
        end   = full_text.find(f"</{tag}>")
        if start == -1:
            return ""
        return full_text[start + len(f"<{tag}>") : end if end != -1 else len(full_text)].strip()

    return extract("analysis"), extract("corrected")


def analyse_and_correct_stream_claude(
    client,
    raw_transcription: str,
    on_analysis_chunk=None,
    on_corrected_chunk=None,
    model: str = "claude-3-5-sonnet-20241022",
) -> tuple[str, str]:
    """Claude Step 2: Analysis + Correction"""
    import anthropic
    prompt = (
        f"The following text was transcribed from a handwriting sample written by "
        f"someone with dyslexia or dysgraphia. The transcription preserves all "
        f"original errors:\n\n"
        f"<raw_transcription>\n{raw_transcription}\n</raw_transcription>\n\n"
        f"Respond in EXACTLY this format, with no extra text outside the tags:\n\n"
        f"<analysis>\n"
        f"For each error, write one bullet:\n"
        f"• Written: [word as written] → Intended: [correct word] · "
        f"Type: [REV=reversal / PHON=phonetic / OMIT=omission / "
        f"TRANS=transposition / CAP=capitalisation / SPACE=spacing / "
        f"SUB=substitution / ADD=addition / OTHER]\n\n"
        f"End with a short Summary paragraph describing the overall "
        f"dyslexia/dysgraphia indicators observed.\n"
        f"</analysis>\n\n"
        f"<corrected>\n"
        f"[The fully corrected text. Fix all errors. Preserve the author's "
        f"original meaning, tone, and voice exactly.]\n"
        f"</corrected>"
    )
    
    full_text = ""
    with client.messages.stream(
        max_tokens=2500,
        model=model,
        messages=[{"role": "user", "content": prompt}]
    ) as stream:
        for text in stream.text_stream:
            full_text += text
            if "<analysis>" in full_text:
                a_start = full_text.find("<analysis>") + len("<analysis>")
                a_end = full_text.find("</analysis>") if "</analysis>" in full_text else len(full_text)
                partial = full_text[a_start:a_end].strip()
                if partial and on_analysis_chunk:
                    on_analysis_chunk(partial)
            if "<corrected>" in full_text:
                c_start = full_text.find("<corrected>") + len("<corrected>")
                c_end = full_text.find("</corrected>") if "</corrected>" in full_text else len(full_text)
                partial = full_text[c_start:c_end].strip()
                if partial and on_corrected_chunk:
                    on_corrected_chunk(partial)
                    
    def extract(tag):
        start = full_text.find(f"<{tag}>")
        end   = full_text.find(f"</{tag}>")
        if start == -1: return ""
        return full_text[start + len(f"<{tag}>") : end if end != -1 else len(full_text)].strip()

    return extract("analysis"), extract("corrected")

# ── Standalone test ──────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    api_key = input("Paste your Google AI Studio API key: ").strip()
    ok, msg = validate_api_key(api_key)
    print(f"{'✓' if ok else '✗'} {msg}")
    if not ok:
        sys.exit(1)

    client = make_client(api_key)
    image_path = input("Image path to test: ").strip()

    print("\n── Step 1: Transcribing ──")
    img_bytes, mtype = encode_image_file(image_path)
    img_bytes = compress_image(img_bytes)
    raw = transcribe_stream(client, img_bytes, mtype,
                            on_chunk=lambda t: print(f"\r{t}", end=""))
    print(f"\n\nRaw: {raw}")

    print("\n── Step 2: Analysing + Correcting ──")
    analysis, corrected = analyse_and_correct_stream(
        client, raw,
        on_analysis_chunk=lambda t: print(f"\r[ANALYSIS] {t[-80:]}", end=""),
        on_corrected_chunk=lambda t: print(f"\r[CORRECTED] {t[-80:]}", end=""),
    )
    print(f"\n\nAnalysis:\n{analysis}")
    print(f"\nCorrected:\n{corrected}")