# Dysgraphia Handwriting Transcription & Analysis

A command-line tool that uses an **Ollama** vision model to transcribe handwriting from images and analyse it for dysgraphia patterns (letter reversals, inconsistent spacing, spelling errors, etc.).

## Features

- **Image transcription** — select a handwriting image via file browser; the vision model reads it exactly as written.
- **Auto-correction** — a second pass rewrites the raw transcription into clean, corrected English.
- **AI analysis chat** — after transcription you can ask follow-up questions about the errors, patterns, and corrections.
- **Standalone chat mode** — `model.py` can also be run on its own for general Ollama chat.

## Requirements

- **Python 3.8+**
- **Ollama server** running locally or remotely (with a vision-capable model such as `llava` or `qwen2-vl`)
- Python packages:
  ```
  pip install requests
  ```
  `tkinter` is included with standard Python on most platforms.

## Quick Start

### 1. Start / connect to an Ollama server

Make sure Ollama is running — either **locally** (`ollama serve`) or on a **remote** server. The tool will prompt you to choose:

```
  [1] Local  (http://localhost:11434)
  [2] Remote (https://myollamaapi2000.share.zrok.io)
  [3] Custom URL
```

### 2. Run the transcription tool

```bash
python "transcribe_api2 (1).py"
```

The tool walks you through four steps:

| Step | What happens |
|------|-------------|
| 1 | Connect to the Ollama server |
| 2 | Pick a vision model from the available list |
| 3 | Select a handwriting image via file dialog |
| 4 | Transcribe → auto-correct → enter analysis chat |

### 3. Standalone chat (optional)

```bash
python model.py
```

Connects to Ollama and starts an interactive chat session without any image processing.

## Project Structure

```
Dsylexia Assistant/
├── transcribe_api2 (1).py   # Main entry point — full transcription & analysis flow
├── model.py                 # Ollama API client module (also runnable standalone)
└── README.md
```

## How It Works

```
Image ──► Ollama Vision Model ──► Raw Transcription
                                        │
                                        ▼
                                  Auto-Correction
                                        │
                                        ▼
                              Interactive AI Analysis
```

1. The selected image is **base64-encoded** and sent to the Ollama `/api/chat` endpoint with a vision-capable model.
2. The raw transcription preserves all original errors.
3. A correction prompt asks the model to rewrite the text as normal English.
4. An interactive chat session lets you explore dysgraphia patterns, ask for explanations, or request alternative corrections.

## License

This project is provided as-is for educational and assistive purposes.
