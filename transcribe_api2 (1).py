"""
transcribe_api2.py — Dysgraphia Handwriting Transcription & Analysis
Powered entirely by Ollama (local/remote LLM server).

Flow:
1. Connect to Ollama server (asks for URL every run)
2. Select a vision model (for transcription + analysis)
3. Select an image of handwriting via file browser
4. Transcribe it using the Ollama vision model
5. Chat with the AI to analyse the transcription
"""

import os
import tkinter as tk
from tkinter import filedialog

# ── Ollama integration ───────────────────────────────────────────
import model as ollama


# ── Image Selection ──────────────────────────────────────────────
def select_image():
    """Opens a file dialog to select an image."""
    root = tk.Tk()
    root.withdraw()
    root.call('wm', 'attributes', '.', '-topmost', True)

    print("\nOpening file browser... Please select an image.")
    file_path = filedialog.askopenfilename(
        title="Select a Dysgraphia Handwriting Image",
        filetypes=[
            ("Image files", "*.jpg *.jpeg *.png"),
            ("All files", "*.*"),
        ],
    )
    return file_path


# ── Post-Transcription Analysis Chat ────────────────────────────
def analyse_transcription(url, model_name, transcription_text):
    """
    Start an interactive Ollama chat session pre-loaded with the
    transcription so the user can ask about dysgraphia patterns,
    errors, corrections, etc.
    """
    print("\n" + "─" * 50)
    print("  AI Analysis Mode")
    print("─" * 50)
    print("Ask questions about the transcription. Type 'quit' to exit.\n")

    system_prompt = (
        "You are a dysgraphia analysis assistant. The user has just transcribed "
        "a sample of handwriting from an image. The raw transcription (with all "
        "original errors preserved) is provided below.\n\n"
        "Your job is to help the user:\n"
        "• Identify spelling, grammar, and spacing errors\n"
        "• Spot patterns typical of dysgraphia (letter reversals, inconsistent "
        "spacing, missing words, etc.)\n"
        "• Provide a corrected version if asked\n"
        "• Answer any questions about the handwriting sample\n\n"
        "── TRANSCRIPTION ──\n"
        f"{transcription_text}\n"
        "── END TRANSCRIPTION ──"
    )

    ollama.interactive_chat(url, model_name, system_prompt=system_prompt)


# ── Main ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 50)
    print("  Dysgraphia Transcription & Analysis Tool")
    print("        Powered by Ollama")
    print("=" * 50)

    # ── Step 1: Connect to Ollama ──
    print("\n[Step 1] Connect to Ollama server")
    url_input = input(
        f"Enter Ollama URL [{ollama.DEFAULT_URL}]: "
    ).strip().rstrip("/") or ollama.DEFAULT_URL

    try:
        url = ollama.connect(url_input)
        print(f"✓ Connected to {url}")
    except SystemExit:
        print("Could not connect to Ollama. Exiting.")
        exit(1)

    # ── Step 2: Select model ──
    print("\n[Step 2] Select a vision model (e.g. qwen3-vl for image reading)")
    model_name = ollama.select_model(url)
    print(f"✓ Using: {model_name}")

    # ── Step 3: Select image ──
    print("\n[Step 3] Select a handwriting image")
    selected_image_path = select_image()
    if not selected_image_path:
        print("No image selected. Exiting program.")
        exit()
    print(f"✓ Selected: {os.path.basename(selected_image_path)}")

    # ── Step 4: Transcribe via Ollama vision model ──
    print("\n[Step 4] Transcribing handwriting...")
    print("=" * 50)
    transcription = ollama.transcribe_image(url, model_name, selected_image_path)
    print("=" * 50)

    if not transcription:
        print("[!] Transcription failed. Exiting.")
        exit(1)

    # ── Step 4 contd: Correct the transcription ──
    print("\nConverting to readable text...")
    correction_prompt = (
        "The following text was transcribed from dysgraphic handwriting and "
        "contains many spelling, grammar, and spacing errors. Please rewrite "
        "it as normal, corrected English so that anyone can understand it. "
        "Keep the original meaning and tone. Only output the corrected text, "
        "nothing else.\n\n"
        f"Original:\n{transcription}"
    )
    correction_messages = [{"role": "user", "content": correction_prompt}]
    print("", end="", flush=True)
    corrected = ollama.chat_stream(url, model_name, correction_messages)
    print()

    # ── Final Output ──
    print("\n" + "=" * 50)
    print("--- Final Output ---")
    print("=" * 50)
    if corrected:
        print(corrected)
    else:
        print(transcription)
    print("=" * 50)