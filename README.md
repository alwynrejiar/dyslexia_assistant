# 🧠 DyslexaRead v2.0.0

A free, lightning-fast desktop application designed specifically to read, transcribe, and correct dysgraphic and dyslexic handwriting. 

Powered by the **Google Gemini 2.5 Flash** vision model via the **Google AI Studio FREE tier**.

---

## ✨ Features

- **FREE API powered by Google Gemini** — no local GPU or paid subscriptions required, taking ~5-15 seconds per analysis.
- **Auto-Login** — add your API key to an `.env` file to skip the setup screen entirely.
- **Large Camera Preview** — open your webcam in a large, un-cropped window with a **3-second countdown timer** to easily align your paper.
- **File Upload** — alternatively load handwriting images from your computer (JPG, PNG, BMP, WebP).
- **2-Step AI Pipeline** — optimized chain-of-thought analysis:
  1. **Raw Transcription:** The model reads the handwriting EXACTLY as written, preserving every misspelling, phonetic substitution, reversal, and omission.
  2. **Error Analysis & Correction:** The model isolates each error, categorizes the dyslexia/dysgraphia pattern (e.g., *b/d reversal*, *transposition*), and reconstructs the intended text in clean English.
- **Live Streaming Results** — watch the AI's transcription and analysis stream into the tool word-by-word in real time.
- **Tabbed Interface** — cleanly separate your raw transcription, error analysis, and final corrected text.

---

## 📋 Requirements

**Python 3.8+**

Install the required Python packages:
```bash
pip install google-genai opencv-python Pillow python-dotenv anthropic
```
*(Note: `tkinter` is used for the GUI and is included with standard Python installations).*

---

## 🚀 Quick Start

### 1. Get your free API Key

1. Go to [aistudio.google.com](https://aistudio.google.com/)
2. Sign in with your Google account.
3. Click **Get API Key** → **Create API Key**.
4. Copy the key (it starts with `AIza...`).

### 2. (Optional) Set up auto-login
Create a file named `.env` in the same directory as the script and add your key so you never have to paste it again:
```env
GEMINI_API_KEY="AIzaSyYourApiKeyHere..."
```

### 3. Run the application
```bash
python dyslexia_assistant.py
```

If you didn't set up the `.env` file, the app will ask you to paste your key when it opens.

### 4. Capture & Analyse
1. Click **📷 Camera Snapshot** (or upload a file).
2. Align your handwriting sample in the large preview window and click **📸 Snap (3s countdown)**.
3. Click **🚀 Transcribe & Analyse**.
4. Watch the results stream live into the three tabs on the right.

---

## 📁 Project Structure

```
Dsylexia Assistant/
├── .env                     # Your private Google Gemini API key (not in repo)
├── dyslexia_assistant.py    # Main GUI app — camera control, UI, and pipeline management
├── model.py                 # Google Gemini API client module (handles streaming & prompts)
├── claude_api.py            # (Legacy) Anthropic Claude API client
├── vision.py                # (Legacy) HuggingFace API scanner
├── transcribe_api2 (1).py   # (Legacy) CLI tool
└── README.md                # This file
```

---

## ⚙️ How It Works

```
Handwriting Image (Camera/File) 
      │
      ▼
Image compression (resized, converted to JPEG bytes)
      │
      ▼
[API Call 1] ──► Gemini 2.5 Flash ──► Raw Transcription (errors preserved)
      │
      ▼
[API Call 2] ──► Gemini 2.5 Flash ──► Error Analysis & Corrected Text
```

By explicitly preserving errors in the first step (rather than having the AI automatically "fix" the text while reading), the secondary analysis step can accurately diagnose *why* the writer made the mistakes they did, providing valuable insight for educators and parents.

---

## 📌 Version History

| Version | Date | Changes |
|---------|------|---------|
| **2.0.0** | 2026-03-12 | Swapped completely to free Google Gemini backend. Improved camera preview with large modal window. Added `.env` auto-login feature. Massive speed improvements (~10s total). |
| **1.2.0** | 2026-03-12 | Added Anthropic Claude API support & backend chooser dialog. |
| **1.1.1** | 2026-03-06 | Camera preview with countdown, image compression, live streaming UI. |
| **1.0.0** | — | Initial release with Ollama backend. |

---

## 📄 License

This project is provided as-is for educational and assistive purposes.
