# 🧠 Dyslexia Assistant v1.1.1

A desktop GUI application that uses **Ollama vision models** to transcribe dysgraphic/dyslexic handwriting from images, analyse error patterns, and produce corrected text — all in real time.

## ✨ Features

- **Live Camera Preview** — open your webcam, position your handwriting sample, and capture with a **3-second countdown timer**
- **File Upload** — alternatively load handwriting images from disk (JPG, PNG, BMP, WebP)
- **Smart Image Compression** — images are automatically resized and compressed before sending, for faster processing
- **2-Step AI Pipeline** — optimized chain-of-thought transcription:
  1. **Raw Transcription** — vision model reads handwriting exactly as written, preserving all errors
  2. **Error Analysis + Correction** — identifies dyslexia/dysgraphia patterns (letter reversals, transpositions, omissions) and reconstructs the intended text
- **Live Streaming** — see AI results appear word-by-word in real time as they generate
- **Tabbed Results** — separate tabs for raw transcription, error analysis, and corrected text
- **Ollama Integration** — works with any vision-capable model (llava, qwen2-vl, qwen3-vl, minicpm-v, etc.)

## 📋 Requirements

- **Python 3.8+**
- **Ollama server** running locally or remotely (with a vision-capable model)
- Python packages:
  ```
  pip install requests opencv-python Pillow
  ```
  `tkinter` is included with standard Python on most platforms.

## 🚀 Quick Start

### 1. Start an Ollama server

Make sure Ollama is running with a vision model pulled:

```bash
ollama serve
ollama pull qwen2-vl
```

Or connect to a remote server via ngrok or similar.

### 2. Run the application

```bash
python dyslexia_assistant.py
```

### 3. Setup dialog

1. Enter your Ollama server URL (default or custom)
2. Click **Connect & List Models**
3. Select a **vision model** (marked with ✅)
4. Click **▶ Start Assistant**

### 4. Capture & transcribe

| Step | What happens |
|------|-------------|
| 1 | Click **📷 Camera Snapshot** or **📁 Upload from File** |
| 2 | For camera: position your paper in the live preview, click **📸 Take Photo** (3s countdown) |
| 3 | Click **🚀 Transcribe & Correct** |
| 4 | Watch results stream live into the tabs |

## 📁 Project Structure

```
Dsylexia Assistant/
├── dyslexia_assistant.py    # Main GUI app — camera, transcription & analysis
├── model.py                 # Ollama API client module (also runnable standalone)
├── vision.py                # Legacy standalone camera scanner (HuggingFace API)
├── transcribe_api2 (1).py   # Legacy CLI transcription tool
└── README.md
```

## ⚙️ How It Works

```
Camera / File ──► Image Compression ──► Ollama Vision Model ──► Raw Transcription
                   (1024px, JPEG q85)                                  │
                                                                       ▼
                                                          Error Analysis + Correction
                                                          (single combined API call)
                                                                       │
                                                                       ▼
                                                              Corrected Text
```

1. Image is **resized** (max 1024px) and **JPEG-compressed** to minimize transfer time
2. The vision model **transcribes** handwriting exactly as written, preserving all dysgraphic errors
3. A combined prompt performs **error analysis** (identifying reversal, transposition, omission patterns) and **text correction** in a single API call
4. Results **stream live** into the GUI — no waiting for the full response

## 📌 Version History

| Version | Date | Changes |
|---------|------|---------|
| **1.1.1** | 2026-03-06 | Live camera preview with 3s countdown, image compression, merged 2-step pipeline, live streaming UI |
| **1.0.0** | — | Initial release with instant camera snapshot and 3-step pipeline |

## 📄 License

This project is provided as-is for educational and assistive purposes.
