# 🧠 DyslexaRead v2.0.0

A free, lightning-fast handwriting assistant for dyslexia and dysgraphia.

- Desktop app (Tkinter) for local camera + file capture
- Web app (static HTML/JS) with Supabase auth, profiles, and saved reports
- FastAPI backend for analysis requests

Powered by **Google Gemini 2.5 Flash** (desktop) and **OpenRouter Gemini 2.5 Flash** (web backend).

---

## ✨ Features

- **FREE API powered by Google Gemini** — no local GPU required, ~5-15 seconds per analysis.
- **Auto-Login** — add your API key to an `.env` file to skip the setup screen entirely.
- **Large Camera Preview** — open your webcam in a large, un-cropped window with a **3-second countdown timer** to easily align your paper.
- **File Upload** — alternatively load handwriting images from your computer (JPG, PNG, BMP, WebP).
- **2-Step AI Pipeline** — optimized chain-of-thought analysis:
  1. **Raw Transcription:** The model reads the handwriting EXACTLY as written, preserving every misspelling, phonetic substitution, reversal, and omission.
  2. **Error Analysis & Correction:** The model isolates each error, categorizes the dyslexia/dysgraphia pattern (e.g., *b/d reversal*, *transposition*), and reconstructs the intended text in clean English.
- **Live Streaming Results** — watch the AI's transcription and analysis stream into the tool word-by-word in real time.
- **Tabbed Interface** — cleanly separate your raw transcription, error analysis, and final corrected text.
- **Web Assistant** — browser-based capture/upload, analysis tabs, and live progress UI.
- **Profiles & Saved Reports** — Supabase auth, profile management, and PDF report storage.
- **Theme Toggle** — light/dark mode in the web UI.

---

## 📋 Requirements

**Python 3.8+** for the desktop app and backend

Install the required Python packages (desktop app):
```bash
pip install google-genai opencv-python Pillow python-dotenv anthropic
```
*(Note: `tkinter` is used for the GUI and is included with standard Python installations).*

Backend requirements:
```bash
pip install -r backend/requirements.txt
```

Web app (optional local dev):
- Any static server (or open the HTML files directly)
- Node.js only if you are using the React hero or Vite build

---

## 🚀 Quick Start (Desktop App)

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

## 🚀 Quick Start (Web App)

### 1. Start the backend
```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

### 2. Configure the backend
Set `OPENROUTER_API_KEY` (and optionally `OPENROUTER_MODEL`) in your environment or `.env`.

### 3. Open the web app
- Launch [app.html](app.html) in your browser.
- Sign up at [auth.html](auth.html) to create a profile.
- Add your OpenRouter key in [settings.html](settings.html) if you want per-user keys.

The web app will auto-detect the backend at `http://127.0.0.1:8000` or your deployed URL.

---

## 🌐 Deployment (Render + Vercel)

**Backend (Render)**
- Build: `pip install -r backend/requirements.txt`
- Start: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`

**Backend env vars**
- `OPENROUTER_API_KEY` (required for `/analyze`)
- `OPENROUTER_MODEL` (optional, default: `google/gemini-2.5-flash`)
- `CORS_ORIGINS` (comma-separated; set to your Vercel URL)

**Frontend (Vercel)**
- For the static web app, deploy the root HTML files (`index.html`, `app.html`, etc.).
- For the React hero demo, run `npm run build:react` and deploy `dist`.

Example `CORS_ORIGINS` value:
```
https://your-app.vercel.app
```

---

## 🧩 Web App Notes

- Web UI entry: [app.html](app.html)
- Auth: [auth.html](auth.html)
- Profile: [profile.html](profile.html)
- Settings: [settings.html](settings.html)
- Supabase bootstrap: [supabase-client.js](supabase-client.js)
- Supabase schema: [supabase.sql](supabase.sql)

The web app uses OpenRouter for analysis and stores the key in browser localStorage.

## 🔐 Supabase Setup

1. Create a Supabase project.
2. Replace the URL and anon key in [supabase-client.js](supabase-client.js).
3. Run the SQL in [supabase.sql](supabase.sql) to create tables and RLS policies.
4. Create storage buckets: `reports`, `originals`, `avatars`.

## 📁 Project Structure

```
Dsylexia Assistant/
├── .env                     # Your private Google Gemini API key (not in repo)
├── dyslexia_assistant.py    # Main GUI app — camera control, UI, and pipeline management
├── model.py                 # Google Gemini API client module (handles streaming & prompts)
├── vision.py                # (Legacy) HuggingFace API scanner
├── transcribe_api2 (1).py   # (Legacy) CLI tool
├── backend/                 # FastAPI backend for the web app
├── app.html                 # Web assistant UI
├── auth.html                # Supabase auth UI
├── profile.html             # Profile setup UI
├── settings.html            # Settings + API key UI
├── script.js                # Web app logic
├── styles.css               # Web app styles
├── supabase-client.js       # Supabase client init
├── supabase.sql             # Supabase schema + policies
├── components/              # Optional React hero components
├── HERO_INTEGRATION_GUIDE.md
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

## 🔌 Backend API

- `GET /health` → `{ status: "ok", client_ready: boolean }`
- `POST /analyze` (multipart form field: `file`) → `{ raw, analysis, corrected }`
      - Optional header: `x-openrouter-api-key` to override the backend key

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
