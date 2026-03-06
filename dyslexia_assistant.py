"""
dyslexia_assistant.py — Unified Dyslexia Handwriting Transcription & Analysis
==============================================================================
Integrates:
  • Ollama API client      (connect, list models, chat, vision)
  • Live camera feed       (OpenCV → Tkinter)
  • Transcription pipeline (raw dysgraphic → corrected normal text)

Flow:
  1. Startup dialog → enter Ollama URL → select a vision model
  2. Main window opens with live camera preview
  3. Press Spacebar / click "Capture" → current frame sent to Ollama vision model
  4. Raw transcription (errors preserved) is displayed
  5. Corrected / most-probable writing form is displayed alongside
"""

import json
import time
import base64
import threading
import cv2
import os
import tkinter as tk
from tkinter import scrolledtext, messagebox, ttk, filedialog
from PIL import Image, ImageTk
import requests

# ════════════════════════════════════════════════════════════════════
# ██  OLLAMA API CLIENT
# ════════════════════════════════════════════════════════════════════

HEADERS = {
    "ngrok-skip-browser-warning": "1",
    "Content-Type": "application/json",
}

DEFAULT_URL = "https://unjocund-madge-edgingly.ngrok-free.dev"

# Known keywords that indicate a model supports vision / image input
VISION_MODEL_KEYWORDS = [
    "llava", "vision", "vl", "minicpm-v", "bakllava", "moondream",
    "cogvlm", "yi-vl", "internvl", "qwen2-vl", "qwen3-vl",
]

# ── Dysgraphia prompts ──────────────────────────────────────────────

RAW_TRANSCRIPTION_PROMPT = (
    "You are an expert at reading and transcribing dysgraphic and dyslexic handwriting.\n\n"
    "TASK: Transcribe every word in this image EXACTLY as written, preserving all errors.\n\n"
    "RULES:\n"
    "1. Go line by line, left to right, top to bottom.\n"
    "2. Preserve the EXACT spelling, even if it looks wrong (e.g. 'becuase', 'teh', 'wokr').\n"
    "3. Preserve spacing errors — if words run together write them together, if extra gaps exist show them.\n"
    "4. Preserve punctuation exactly — missing periods, extra commas, etc.\n"
    "5. If a letter/word is ambiguous, write your best reading followed by [?] e.g. 'helo[?]'.\n"
    "6. Do NOT autocorrect, do NOT fix grammar, do NOT add words.\n"
    "7. If you see crossed-out or overwritten text, note it as [crossed out: word].\n\n"
    "Output ONLY the transcription, nothing else."
)

ANALYSIS_PROMPT_TEMPLATE = (
    "You are a dysgraphia and dyslexia specialist.\n\n"
    "Below is a RAW transcription of handwriting from a person with dyslexia/dysgraphia. "
    "It contains errors. Your job is to figure out what COMMON, EVERYDAY words were "
    "ACTUALLY intended.\n\n"
    "── RAW TRANSCRIPTION ──\n{raw_text}\n── END ──\n\n"
    "CRITICAL RULES — read these carefully:\n\n"
    "★ ALWAYS prefer the MOST COMMON, HIGH-FREQUENCY English word.\n"
    "  Example: 'dall' → 'ball' (common word) NOT 'dall' → 'dally' (obscure word).\n"
    "  Example: 'glay' → 'play' (common word) NOT 'glay' → 'clay' (less likely in context).\n\n"
    "★ The #1 dyslexia pattern is LETTER REVERSAL. These pairs are constantly confused:\n"
    "  • b ↔ d  (most common! e.g. 'dall' = 'ball', 'doy' = 'boy', 'bog' = 'dog')\n"
    "  • p ↔ q\n"
    "  • p ↔ g  (e.g. 'glay' = 'play')\n"
    "  • n ↔ u\n"
    "  • m ↔ w\n\n"
    "★ Other common patterns:\n"
    "  • Letter transposition (swapped order, e.g. 'form' → 'from')\n"
    "  • Omission (missing letters, e.g. 'becuse' → 'because')\n"
    "  • Insertion (extra letters)\n"
    "  • Phonetic substitution (written by sound, e.g. 'nite' → 'night')\n\n"
    "★ ALWAYS consider the FULL SENTENCE context. Ask yourself:\n"
    "  'Would a normal person say this sentence in daily life?'\n"
    "  Pick the correction that makes the sentence MOST NATURAL and COMMON.\n"
    "  e.g. 'I like to glay dall' → 'I like to play ball' (natural sentence)\n"
    "       NOT → 'I like to play dally' (unnatural sentence)\n\n"
    "INSTRUCTIONS — think step by step:\n"
    "1. List each misspelled or unusual word.\n"
    "2. For each, identify the error pattern (reversal, transposition, etc.).\n"
    "3. Generate 2-3 candidate corrections.\n"
    "4. Pick the candidate that makes the MOST COMMON, NATURAL sentence.\n\n"
    "Format each entry as:\n"
    "  'misspelled' → 'correction' (pattern: explanation | candidates considered: word1, word2)\n"
)

# Combined analysis + correction prompt (merges old steps 2 & 3 into one call)
COMBINED_PROMPT_TEMPLATE = (
    "You are a dysgraphia and dyslexia specialist AND a text reconstructor.\n\n"
    "Below is a RAW transcription of handwriting from a person with dyslexia/dysgraphia. "
    "It contains errors. Your job has TWO PARTS.\n\n"
    "── RAW TRANSCRIPTION ──\n{raw_text}\n── END ──\n\n"
    "CRITICAL RULES — read these carefully:\n\n"
    "★ ALWAYS prefer the MOST COMMON, HIGH-FREQUENCY English word.\n"
    "  Example: 'dall' → 'ball' (common word) NOT 'dall' → 'dally' (obscure word).\n\n"
    "★ The #1 dyslexia pattern is LETTER REVERSAL. These pairs are constantly confused:\n"
    "  • b ↔ d  (most common! e.g. 'dall' = 'ball', 'doy' = 'boy', 'bog' = 'dog')\n"
    "  • p ↔ q, p ↔ g  (e.g. 'glay' = 'play')\n"
    "  • n ↔ u, m ↔ w\n\n"
    "★ Other patterns: transposition, omission, insertion, phonetic substitution.\n\n"
    "★ ALWAYS consider the FULL SENTENCE context — pick the most NATURAL sentence.\n\n"
    "══════════════════════════════════════\n"
    "PART 1 — ERROR ANALYSIS\n"
    "══════════════════════════════════════\n"
    "List each misspelled word, identify the error pattern, generate 2-3 candidates, "
    "and pick the best one.\n"
    "Format: 'misspelled' → 'correction' (pattern: explanation)\n\n"
    "══════════════════════════════════════\n"
    "PART 2 — CORRECTED TEXT\n"
    "══════════════════════════════════════\n"
    "After the analysis, write the FINAL corrected text that the writer INTENDED, "
    "in clean correct English. It must sound NATURAL.\n\n"
    "Use EXACTLY this format:\n\n"
    "=== ERROR ANALYSIS ===\n"
    "(your word-by-word analysis here)\n\n"
    "=== CORRECTED TEXT ===\n"
    "(the final corrected text here)\n"
)

MAX_IMAGE_DIMENSION = 1024  # Resize images to this max before sending


def connect(url=None):
    """
    Validate that an Ollama server is reachable at *url*.
    Returns the cleaned URL or raises SystemExit.
    """
    url = (url or DEFAULT_URL).rstrip("/")
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code not in (200, 404):
            print(f"[WARN] Server responded with {r.status_code}\n{r.text[:300]}")
    except requests.exceptions.ConnectionError:
        raise ConnectionError(f"Cannot reach {url}")
    return url


def list_models(url):
    """Return a list of model-name strings available on the Ollama server."""
    try:
        r = requests.get(f"{url}/api/tags", headers=HEADERS, timeout=15)
        if r.status_code != 200:
            raise RuntimeError(f"Failed to list models ({r.status_code}): {r.text[:400]}")
        models = [m["name"] for m in r.json().get("models", [])]
    except requests.exceptions.ConnectionError:
        raise ConnectionError("Lost connection while listing models")
    if not models:
        raise RuntimeError("No models available on this server")
    return models


def encode_image_bytes_to_base64(image_bytes):
    """Encode raw image bytes (e.g. from cv2.imencode) to a base64 string."""
    return base64.b64encode(image_bytes).decode("utf-8")


def encode_image_file_to_base64(image_path):
    """Read an image file from disk and return its base64 string."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def compress_image_for_api(pil_image, max_dim=MAX_IMAGE_DIMENSION, quality=85):
    """
    Resize a PIL image so its longest edge is at most *max_dim* pixels,
    then JPEG-compress it and return the base64 string.
    This typically cuts payload size by 3–5× compared to sending raw frames.
    """
    img = pil_image.copy()
    img.thumbnail((max_dim, max_dim), Image.LANCZOS)
    if img.mode == "RGBA":
        img = img.convert("RGB")
    from io import BytesIO
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def chat_sync(url, model, messages, images=None, max_retries=4, timeout=300):
    """
    Send a chat request to Ollama and return the full response text.
    Non-streaming wrapper (waits for complete response).
    """
    result = []
    chat_sync_streaming(url, model, messages, images=images,
                        on_token=lambda t: result.append(t),
                        max_retries=max_retries, timeout=timeout)
    return "".join(result) if result else None


def chat_sync_streaming(url, model, messages, images=None,
                        on_token=None, max_retries=4, timeout=300):
    """
    Send a chat request to Ollama, calling *on_token(text)* for each
    streamed token.  Returns the full response string or None on failure.

    Args:
        on_token:  Callable(str) invoked with each new text chunk as it arrives.
    """
    send_messages = [dict(msg) for msg in messages]
    if images and send_messages:
        send_messages[-1]["images"] = images

    for attempt in range(1, max_retries + 1):
        try:
            with requests.post(
                f"{url}/api/chat",
                headers=HEADERS,
                json={"model": model, "messages": send_messages, "stream": True},
                stream=True,
                timeout=timeout,
            ) as r:
                if r.status_code == 504:
                    wait = 15 * attempt
                    time.sleep(wait)
                    continue
                if not r.ok:
                    return None

                full_response = ""
                for line in r.iter_lines():
                    if line:
                        try:
                            chunk = json.loads(line)
                            delta = chunk.get("message", {}).get("content", "")
                            if delta:
                                full_response += delta
                                if on_token:
                                    on_token(delta)
                            if chunk.get("done"):
                                break
                        except json.JSONDecodeError:
                            pass
                return full_response

        except requests.exceptions.Timeout:
            time.sleep(15 * attempt)
        except requests.exceptions.RequestException:
            return None

    return None


# ════════════════════════════════════════════════════════════════════
# ██  STARTUP DIALOG  — URL + Model Selection
# ════════════════════════════════════════════════════════════════════

class StartupDialog:
    """
    A small Tkinter window shown before the main app.
    Asks the user for the Ollama URL and lets them pick a vision model.
    """

    def __init__(self):
        self.url = None
        self.model = None
        self._build_ui()

    def _build_ui(self):
        self.root = tk.Tk()
        self.root.title("Dyslexia Assistant — Setup")
        self.root.geometry("520x520")
        self.root.resizable(False, False)
        self.root.configure(bg="#1e1e2e")
        self.root.call("wm", "attributes", ".", "-topmost", True)

        # ── Title ──
        tk.Label(
            self.root, text="🧠 Dyslexia Assistant", font=("Segoe UI", 20, "bold"),
            bg="#1e1e2e", fg="#cdd6f4",
        ).pack(pady=(25, 5))
        tk.Label(
            self.root, text="Connect to Ollama to get started",
            font=("Segoe UI", 11), bg="#1e1e2e", fg="#a6adc8",
        ).pack(pady=(0, 20))

        # ── URL entry ──
        frame = tk.Frame(self.root, bg="#1e1e2e")
        frame.pack(padx=30, fill=tk.X)

        tk.Label(frame, text="Ollama Server URL", font=("Segoe UI", 10, "bold"),
                 bg="#1e1e2e", fg="#89b4fa").pack(anchor="w")
        self.url_var = tk.StringVar(value=DEFAULT_URL)
        self.url_entry = tk.Entry(
            frame, textvariable=self.url_var, font=("Consolas", 11),
            bg="#313244", fg="#cdd6f4", insertbackground="#cdd6f4",
            relief="flat", bd=0, highlightthickness=1, highlightcolor="#89b4fa",
        )
        self.url_entry.pack(fill=tk.X, ipady=6, pady=(4, 12))

        # ── Connect button ──
        self.connect_btn = tk.Button(
            frame, text="Connect & List Models", font=("Segoe UI", 11, "bold"),
            bg="#89b4fa", fg="#1e1e2e", activebackground="#74c7ec",
            relief="flat", cursor="hand2", command=self._on_connect,
        )
        self.connect_btn.pack(fill=tk.X, ipady=6, pady=(0, 12))

        # ── Status label ──
        self.status_var = tk.StringVar(value="")
        self.status_label = tk.Label(
            frame, textvariable=self.status_var, font=("Segoe UI", 9),
            bg="#1e1e2e", fg="#f38ba8", wraplength=440, justify="left",
        )
        self.status_label.pack(anchor="w", pady=(0, 8))

        # ── Model list ──
        tk.Label(frame, text="Available Models", font=("Segoe UI", 10, "bold"),
                 bg="#1e1e2e", fg="#89b4fa").pack(anchor="w")
        tk.Label(
            frame, text="⚠  You MUST select a vision model (e.g. llava, qwen2-vl, minicpm-v)",
            font=("Segoe UI", 9, "bold"), bg="#1e1e2e", fg="#f9e2af",
            wraplength=440, justify="left",
        ).pack(anchor="w", pady=(2, 2))
        self.model_listbox = tk.Listbox(
            frame, font=("Consolas", 11), height=5,
            bg="#313244", fg="#cdd6f4", selectbackground="#89b4fa",
            selectforeground="#1e1e2e", relief="flat", highlightthickness=0,
        )
        self.model_listbox.pack(fill=tk.X, pady=(4, 12))

        # ── Start button ──
        self.start_btn = tk.Button(
            frame, text="▶  Start Assistant", font=("Segoe UI", 12, "bold"),
            bg="#a6e3a1", fg="#1e1e2e", activebackground="#94e2d5",
            relief="flat", cursor="hand2", state=tk.DISABLED,
            command=self._on_start,
        )
        self.start_btn.pack(fill=tk.X, ipady=8)

    # ── Callbacks ──

    def _on_connect(self):
        self.status_var.set("Connecting...")
        self.connect_btn.config(state=tk.DISABLED)
        self.root.update_idletasks()
        threading.Thread(target=self._connect_thread, daemon=True).start()

    def _connect_thread(self):
        raw_url = self.url_var.get().strip().rstrip("/") or DEFAULT_URL
        try:
            validated_url = connect(raw_url)
            models = list_models(validated_url)
            self.root.after(0, self._populate_models, validated_url, models)
        except (ConnectionError, RuntimeError) as e:
            self.root.after(0, self._show_error, str(e))

    def _populate_models(self, url, models):
        self.url = url
        self.model_listbox.delete(0, tk.END)
        first_vision_idx = None
        for i, m in enumerate(models):
            is_vision = self._is_vision_model(m)
            label = f"✅ {m}" if is_vision else f"   {m}  ⚠ text-only"
            self.model_listbox.insert(tk.END, m)  # store real name
            if is_vision and first_vision_idx is None:
                first_vision_idx = i
        # Auto-select first vision model if available, else first model
        sel = first_vision_idx if first_vision_idx is not None else 0
        if models:
            self.model_listbox.selection_set(sel)
            self.model_listbox.see(sel)
        self.status_var.set(f"✓ Connected — {len(models)} model(s) found")
        self.status_label.config(fg="#a6e3a1")
        self.connect_btn.config(state=tk.NORMAL)
        self.start_btn.config(state=tk.NORMAL)

    @staticmethod
    def _is_vision_model(model_name):
        """Check if a model name looks like a vision-capable model."""
        name_lower = model_name.lower()
        return any(kw in name_lower for kw in VISION_MODEL_KEYWORDS)

    def _show_error(self, msg):
        self.status_var.set(f"✗ {msg}")
        self.status_label.config(fg="#f38ba8")
        self.connect_btn.config(state=tk.NORMAL)

    def _on_start(self):
        sel = self.model_listbox.curselection()
        if not sel:
            self.status_var.set("Please select a model first")
            self.status_label.config(fg="#f38ba8")
            return
        chosen = self.model_listbox.get(sel[0])
        if not self._is_vision_model(chosen):
            # Warn but still allow — user might know what they're doing
            if not messagebox.askyesno(
                "Not a Vision Model",
                f"'{chosen}' does not appear to be a vision model.\n\n"
                "This app needs a model that can read images "
                "(e.g. llava, qwen2-vl, minicpm-v).\n\n"
                "Continue anyway?",
            ):
                return
        self.model = chosen
        self.root.destroy()

    def run(self):
        """Show the dialog. Returns (url, model) or (None, None) if closed."""
        self.root.mainloop()
        return self.url, self.model


# ════════════════════════════════════════════════════════════════════
# ██  MAIN APPLICATION  — Image Input + Transcription + Correction
# ════════════════════════════════════════════════════════════════════

PREVIEW_WIDTH = 520
PREVIEW_HEIGHT = 390

class DyslexiaAssistantApp:
    """
    Main GUI window with:
      • Two input modes: camera snapshot or upload from file
      • Image preview (left panel)
      • Tabbed results area (right panel)
      • 3-step chain-of-thought transcription pipeline via Ollama
    """

    def __init__(self, url, model):
        self.url = url
        self.model = model
        self.current_b64_image = None  # base64 of the image ready to process

        self._build_window()

    # ── UI Construction ──────────────────────────────────────────────

    def _build_window(self):
        self.root = tk.Tk()
        self.root.title(f"Dyslexia Assistant — {self.model}")
        self.root.geometry("1150x720")
        self.root.configure(bg="#1e1e2e")
        self.root.protocol("WM_DELETE_WINDOW", self._on_closing)

        # ── Left: Image input + preview ──────────────────────────────
        left = tk.Frame(self.root, bg="#181825", bd=0, highlightthickness=0)
        left.pack(side=tk.LEFT, padx=(15, 8), pady=15, fill=tk.Y)

        tk.Label(
            left, text="🖼  Image Input", font=("Segoe UI", 13, "bold"),
            bg="#181825", fg="#89b4fa",
        ).pack(pady=(12, 8))

        # ── Two input buttons ──
        btn_frame = tk.Frame(left, bg="#181825")
        btn_frame.pack(padx=10, fill=tk.X)

        self.camera_btn = tk.Button(
            btn_frame, text="📷  Camera Snapshot",
            font=("Segoe UI", 11, "bold"),
            bg="#89b4fa", fg="#1e1e2e", activebackground="#74c7ec",
            relief="flat", cursor="hand2", command=self._on_camera_snapshot,
        )
        self.camera_btn.pack(fill=tk.X, ipady=8, pady=(0, 6))

        self.upload_btn = tk.Button(
            btn_frame, text="📁  Upload from File",
            font=("Segoe UI", 11, "bold"),
            bg="#cba6f7", fg="#1e1e2e", activebackground="#b4befe",
            relief="flat", cursor="hand2", command=self._on_upload_file,
        )
        self.upload_btn.pack(fill=tk.X, ipady=8, pady=(0, 10))

        # ── Image preview area ──
        self.preview_label = tk.Label(
            left, bg="#313244", width=PREVIEW_WIDTH, height=PREVIEW_HEIGHT,
            text="No image loaded\n\nUse a button above to\ncapture or upload an image",
            font=("Segoe UI", 11), fg="#6c7086", compound="center",
        )
        self.preview_label.pack(padx=10, pady=(0, 10))

        # ── Transcribe button (below preview) ──
        self.transcribe_btn = tk.Button(
            left, text="🚀  Transcribe & Correct",
            font=("Segoe UI", 12, "bold"),
            bg="#a6e3a1", fg="#1e1e2e", activebackground="#94e2d5",
            relief="flat", cursor="hand2", state=tk.DISABLED,
            command=self._on_transcribe,
        )
        self.transcribe_btn.pack(fill=tk.X, padx=10, ipady=10, pady=(0, 12))

        # ── Right: Controls + Results ────────────────────────────────
        right = tk.Frame(self.root, bg="#1e1e2e")
        right.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(8, 15), pady=15)

        # Status bar
        self.status_var = tk.StringVar(value=f"Connected to {self.url}  •  Model: {self.model}")
        tk.Label(
            right, textvariable=self.status_var, font=("Segoe UI", 9),
            bg="#1e1e2e", fg="#a6adc8", anchor="w",
        ).pack(fill=tk.X, pady=(0, 8))



        # ── Notebook with tabs for the 3 pipeline outputs ──
        style = ttk.Style()
        style.theme_use("default")
        style.configure("Custom.TNotebook", background="#1e1e2e", borderwidth=0)
        style.configure("Custom.TNotebook.Tab", background="#313244", foreground="#cdd6f4",
                        padding=[12, 6], font=("Segoe UI", 10, "bold"))
        style.map("Custom.TNotebook.Tab",
                  background=[("selected", "#89b4fa")],
                  foreground=[("selected", "#1e1e2e")])

        notebook = ttk.Notebook(right, style="Custom.TNotebook")
        notebook.pack(fill=tk.BOTH, expand=True)

        # ── Tab 1: Raw transcription ──
        raw_frame = tk.Frame(notebook, bg="#1e1e2e")
        notebook.add(raw_frame, text="  📝 Raw Transcription  ")
        tk.Label(
            raw_frame, text="Exact text as written (all errors preserved)",
            font=("Segoe UI", 9), bg="#1e1e2e", fg="#f9e2af", anchor="w",
        ).pack(fill=tk.X, padx=5, pady=(6, 2))
        self.raw_text = scrolledtext.ScrolledText(
            raw_frame, wrap=tk.WORD, font=("Consolas", 11),
            bg="#313244", fg="#cdd6f4", insertbackground="#cdd6f4",
            relief="flat", highlightthickness=0,
        )
        self.raw_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=(0, 5))
        self.raw_text.insert(tk.END, "Waiting for capture...")
        self.raw_text.config(state=tk.DISABLED)

        # ── Tab 2: Error analysis ──
        analysis_frame = tk.Frame(notebook, bg="#1e1e2e")
        notebook.add(analysis_frame, text="  🔍 Error Analysis  ")
        tk.Label(
            analysis_frame, text="Word-by-word dysgraphia / dyslexia pattern breakdown",
            font=("Segoe UI", 9), bg="#1e1e2e", fg="#fab387", anchor="w",
        ).pack(fill=tk.X, padx=5, pady=(6, 2))
        self.analysis_text = scrolledtext.ScrolledText(
            analysis_frame, wrap=tk.WORD, font=("Consolas", 11),
            bg="#313244", fg="#cdd6f4", insertbackground="#cdd6f4",
            relief="flat", highlightthickness=0,
        )
        self.analysis_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=(0, 5))
        self.analysis_text.insert(tk.END, "Waiting for capture...")
        self.analysis_text.config(state=tk.DISABLED)

        # ── Tab 3: Corrected output ──
        corrected_frame = tk.Frame(notebook, bg="#1e1e2e")
        notebook.add(corrected_frame, text="  ✅ Corrected Text  ")
        tk.Label(
            corrected_frame, text="Final reconstructed text (most probable intended writing)",
            font=("Segoe UI", 9), bg="#1e1e2e", fg="#a6e3a1", anchor="w",
        ).pack(fill=tk.X, padx=5, pady=(6, 2))
        self.corrected_text = scrolledtext.ScrolledText(
            corrected_frame, wrap=tk.WORD, font=("Consolas", 11),
            bg="#313244", fg="#cdd6f4", insertbackground="#cdd6f4",
            relief="flat", highlightthickness=0,
        )
        self.corrected_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=(0, 5))
        self.corrected_text.insert(tk.END, "Waiting for capture...")
        self.corrected_text.config(state=tk.DISABLED)

        self.notebook = notebook

    # ── Image Input Methods ──────────────────────────────────────────

    def _show_preview(self, pil_image):
        """Display a PIL image in the preview label, scaled to fit."""
        img = pil_image.copy()
        img.thumbnail((PREVIEW_WIDTH, PREVIEW_HEIGHT), Image.LANCZOS)
        imgtk = ImageTk.PhotoImage(image=img)
        self.preview_label.imgtk = imgtk
        self.preview_label.configure(image=imgtk, text="")

    def _on_camera_snapshot(self):
        """Open a live camera preview window so the user can position their paper."""
        self._set_status("Opening camera…", "#f9e2af")
        self.camera_btn.config(state=tk.DISABLED)
        self.root.update_idletasks()

        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            self._set_status("⚠  Could not open camera", "#f38ba8")
            self.camera_btn.config(state=tk.NORMAL)
            return

        # Store camera handle for the preview loop
        self._cam_cap = cap
        self._cam_frame = None        # latest frame from the camera
        self._cam_running = True       # flag to stop the feed loop
        self._countdown_active = False

        # ── Build the camera preview window ──
        self._cam_win = tk.Toplevel(self.root)
        self._cam_win.title("📷  Camera Preview — Position your paper, then click Take Photo")
        self._cam_win.geometry("700x580")
        self._cam_win.configure(bg="#1e1e2e")
        self._cam_win.resizable(False, False)
        self._cam_win.protocol("WM_DELETE_WINDOW", self._cancel_camera)
        self._cam_win.grab_set()       # make modal
        self._cam_win.focus_force()

        # Live feed label
        self._cam_label = tk.Label(self._cam_win, bg="#313244")
        self._cam_label.pack(padx=15, pady=(15, 8))

        # Countdown overlay label (hidden until countdown starts)
        self._countdown_label = tk.Label(
            self._cam_win, text="", font=("Segoe UI", 28, "bold"),
            bg="#1e1e2e", fg="#f9e2af",
        )
        self._countdown_label.pack(pady=(0, 4))

        # Button row
        btn_row = tk.Frame(self._cam_win, bg="#1e1e2e")
        btn_row.pack(fill=tk.X, padx=15, pady=(0, 15))

        self._cam_take_btn = tk.Button(
            btn_row, text="📸  Take Photo  (3 s countdown)",
            font=("Segoe UI", 12, "bold"),
            bg="#a6e3a1", fg="#1e1e2e", activebackground="#94e2d5",
            relief="flat", cursor="hand2",
            command=self._start_countdown,
        )
        self._cam_take_btn.pack(side=tk.LEFT, expand=True, fill=tk.X, ipady=8, padx=(0, 6))

        self._cam_cancel_btn = tk.Button(
            btn_row, text="❌  Cancel",
            font=("Segoe UI", 12, "bold"),
            bg="#f38ba8", fg="#1e1e2e", activebackground="#eba0ac",
            relief="flat", cursor="hand2",
            command=self._cancel_camera,
        )
        self._cam_cancel_btn.pack(side=tk.RIGHT, expand=True, fill=tk.X, ipady=8, padx=(6, 0))

        # Start the live feed loop
        self._update_camera_feed()

    def _update_camera_feed(self):
        """Continuously display frames from the webcam in the preview window."""
        if not self._cam_running:
            return
        ret, frame = self._cam_cap.read()
        if ret:
            self._cam_frame = frame
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            img = Image.fromarray(rgb)
            img.thumbnail((660, 460), Image.LANCZOS)
            imgtk = ImageTk.PhotoImage(image=img)
            self._cam_label.imgtk = imgtk
            self._cam_label.configure(image=imgtk)
        # Schedule next frame (~30 fps)
        if self._cam_running:
            self._cam_win.after(33, self._update_camera_feed)

    def _start_countdown(self):
        """Begin the 3-second countdown before capturing."""
        if self._countdown_active:
            return
        self._countdown_active = True
        self._cam_take_btn.config(state=tk.DISABLED)
        self._countdown_tick(3)

    def _countdown_tick(self, remaining):
        """Update the countdown display and capture when it reaches 0."""
        if not self._cam_running:
            return
        if remaining > 0:
            self._countdown_label.config(text=f"📸  Capturing in {remaining}…")
            self._cam_win.after(1000, self._countdown_tick, remaining - 1)
        else:
            self._countdown_label.config(text="📸  Captured!")
            self._capture_and_close()

    def _capture_and_close(self):
        """Grab the latest frame, encode it, update main preview, and close camera window."""
        frame = self._cam_frame
        # Stop the feed and release the camera
        self._cam_running = False
        self._cam_cap.release()

        if frame is not None:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(rgb)
            self.current_b64_image = compress_image_for_api(pil_img)
            self._show_preview(pil_img)
            self.transcribe_btn.config(state=tk.NORMAL)
            self._set_status("✓ Snapshot captured — click Transcribe to process", "#a6e3a1")
        else:
            self._set_status("⚠  Could not capture frame", "#f38ba8")

        self._cam_win.destroy()
        self.camera_btn.config(state=tk.NORMAL)

    def _cancel_camera(self):
        """Close the camera preview without capturing anything."""
        self._cam_running = False
        self._cam_cap.release()
        self._cam_win.destroy()
        self.camera_btn.config(state=tk.NORMAL)
        self._set_status("Camera cancelled", "#a6adc8")

    def _on_upload_file(self):
        """Open a file dialog to select an image."""
        file_path = filedialog.askopenfilename(
            title="Select a Handwriting Image",
            filetypes=[
                ("Image files", "*.jpg *.jpeg *.png *.bmp *.webp"),
                ("All files", "*.*"),
            ],
        )
        if not file_path:
            return

        try:
            pil_img = Image.open(file_path)
            self._show_preview(pil_img)
            self.current_b64_image = compress_image_for_api(pil_img)
            self.transcribe_btn.config(state=tk.NORMAL)
            self._set_status(
                f"✓ Loaded: {os.path.basename(file_path)} — click Transcribe to process",
                "#a6e3a1",
            )
        except Exception as e:
            self._set_status(f"⚠  Could not load image: {e}", "#f38ba8")

    # ── Transcription Pipeline Trigger ────────────────────────────────

    def _on_transcribe(self):
        """Start the 3-step pipeline on the currently loaded image."""
        if not self.current_b64_image:
            self._set_status("⚠  No image loaded — capture or upload first", "#f38ba8")
            return

        # Disable input while processing
        self.camera_btn.config(state=tk.DISABLED)
        self.upload_btn.config(state=tk.DISABLED)
        self.transcribe_btn.config(text="⏳  Processing…", state=tk.DISABLED)
        self._set_raw_text("")
        self._set_analysis_text("")
        self._set_corrected_text("")
        self._set_status("Step 1/2 — Reading handwriting from image…", "#f9e2af")
        self.notebook.select(0)

        threading.Thread(
            target=self._transcription_pipeline,
            args=(self.current_b64_image,),
            daemon=True,
        ).start()

    def _append_text_widget(self, widget, text):
        """Append text to a ScrolledText widget (for live streaming)."""
        widget.config(state=tk.NORMAL)
        widget.insert(tk.END, text)
        widget.see(tk.END)
        widget.config(state=tk.DISABLED)

    def _transcription_pipeline(self, b64_image):
        """Background thread: optimized 2-step pipeline with live streaming."""

        # ══════════════════════════════════════════════════════════════
        # STEP 1 — Raw transcription via Ollama vision model (streamed)
        # ══════════════════════════════════════════════════════════════
        def on_raw_token(token):
            self.root.after(0, self._append_text_widget, self.raw_text, token)

        messages = [{"role": "user", "content": RAW_TRANSCRIPTION_PROMPT}]
        raw = chat_sync_streaming(
            self.url, self.model, messages,
            images=[b64_image], on_token=on_raw_token,
        )

        if not raw:
            self.root.after(0, self._pipeline_error, "Transcription failed — check your Ollama server and model.")
            return

        self.root.after(0, self._set_status, "Step 2/2 — Analyzing errors & reconstructing text…", "#fab387")

        # ══════════════════════════════════════════════════════════════
        # STEP 2 — Combined error analysis + correction (streamed)
        #          Merges old steps 2 & 3 into a single API call.
        # ══════════════════════════════════════════════════════════════
        combined_prompt = COMBINED_PROMPT_TEMPLATE.format(raw_text=raw)
        combined_messages = [{"role": "user", "content": combined_prompt}]

        # Stream into the analysis tab while it generates
        def on_combined_token(token):
            self.root.after(0, self._append_text_widget, self.analysis_text, token)

        self.root.after(0, lambda: self.notebook.select(1))
        combined = chat_sync_streaming(
            self.url, self.model, combined_messages, on_token=on_combined_token,
        )

        if not combined:
            combined = "(Analysis unavailable)"

        # Parse the combined response to extract the corrected text
        corrected = ""
        if "=== CORRECTED TEXT ===" in combined:
            corrected = combined.split("=== CORRECTED TEXT ===", 1)[1].strip()
        else:
            # Fallback: use the whole response
            corrected = combined

        if corrected:
            self.root.after(0, self._set_corrected_text, corrected)
            self.root.after(0, lambda: self.notebook.select(2))
        else:
            self.root.after(0, self._set_corrected_text, "(Correction failed — see raw transcription)")

        self.root.after(0, self._pipeline_done)

    # ── GUI helpers (always called on main thread via root.after) ─────

    def _set_text_widget(self, widget, text):
        widget.config(state=tk.NORMAL)
        widget.delete("1.0", tk.END)
        widget.insert(tk.END, text)
        widget.config(state=tk.DISABLED)

    def _set_raw_text(self, text):
        self._set_text_widget(self.raw_text, text)

    def _set_analysis_text(self, text):
        self._set_text_widget(self.analysis_text, text)

    def _set_corrected_text(self, text):
        self._set_text_widget(self.corrected_text, text)

    def _set_status(self, text, color="#a6adc8"):
        self.status_var.set(text)

    def _reset_buttons(self):
        """Re-enable all input buttons after pipeline completes."""
        self.camera_btn.config(state=tk.NORMAL)
        self.upload_btn.config(state=tk.NORMAL)
        self.transcribe_btn.config(text="🚀  Transcribe & Correct", state=tk.NORMAL)

    def _pipeline_error(self, msg):
        self._set_raw_text(f"Error: {msg}")
        self._set_analysis_text("")
        self._set_corrected_text("")
        self._set_status(f"✗ {msg}", "#f38ba8")
        self._reset_buttons()

    def _pipeline_done(self):
        self._set_status("✓ Done — capture or upload another image to continue", "#a6e3a1")
        self._reset_buttons()

    # ── Cleanup ──────────────────────────────────────────────────────

    def _on_closing(self):
        self.root.destroy()

    def run(self):
        self.root.mainloop()


# ════════════════════════════════════════════════════════════════════
# ██  ENTRY POINT
# ════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    # Step 1: Startup dialog — get URL + model
    url, model = StartupDialog().run()

    if not url or not model:
        print("Setup cancelled.")
        exit()

    # Step 2: Launch the main application
    print(f"Starting Dyslexia Assistant with model '{model}' on {url}")
    DyslexiaAssistantApp(url, model).run()
