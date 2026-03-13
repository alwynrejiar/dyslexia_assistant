"""
dyslexia_assistant.py — Dyslexia Handwriting Analyser
Powered by Google Gemini via Google AI Studio (FREE tier)

Get your free API key at: https://aistudio.google.com
Speed: ~5–15 seconds per analysis
Cost:  FREE (Google AI Studio free tier)

Requirements:
    pip install google-genai opencv-python Pillow
"""

import io
import json
import os
import threading
from datetime import datetime
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk

import cv2
from PIL import Image, ImageTk

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import model as gemini

BG         = "#0f1923"
PANEL      = "#1a2535"
ACCENT     = "#1a8cff"
ACCENT2    = "#4dabff"
TEXT       = "#e8f4fd"
TEXT_DIM   = "#6b8cad"
SUCCESS    = "#34d399"
WARNING    = "#fbbf24"
ERROR_COL  = "#f87171"
RAW_BG     = "#0a1520"
ANA_BG     = "#0a1020"
COR_BG     = "#0a1a10"
ENTRY_BG   = "#1e2e42"

FONT_BODY  = ("Helvetica", 13)
FONT_BOLD  = ("Helvetica", 13, "bold")
FONT_MONO  = ("Courier", 12)
FONT_TITLE = ("Helvetica", 20, "bold")
FONT_SMALL = ("Helvetica", 11)


def save_api_key_to_env(key: str, env_var: str = "GEMINI_API_KEY"):
    try:
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
        env_lines = []
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                env_lines = f.readlines()
        
        updated = False
        for i, line in enumerate(env_lines):
            if line.strip().startswith(f"{env_var}="):
                env_lines[i] = f"{env_var}={key}\n"
                updated = True
                break
        
        if not updated:
            if env_lines and not env_lines[-1].endswith("\n"):
                env_lines.append("\n")
            env_lines.append(f"{env_var}={key}\n")
            
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(env_lines)
    except Exception as e:
        print(f"Failed to save {env_var} to .env: {e}")


class SetupDialog(tk.Toplevel):
    def __init__(self, parent):
        super().__init__(parent)
        self.title("DyslexaRead — Setup")
        self.configure(bg=BG)
        self.resizable(False, False)
        self.result_key = None
        self._build()
        self.grab_set()
        self.protocol("WM_DELETE_WINDOW", self._cancel)
        self.after(100, self._center)

    def _center(self):
        self.update_idletasks()
        w, h = self.winfo_width(), self.winfo_height()
        self.geometry(f"+{(self.winfo_screenwidth()-w)//2}+{(self.winfo_screenheight()-h)//2}")

    def _build(self):
        pad = dict(padx=28, pady=10)
        tk.Label(self, text="◈ DyslexaRead", font=FONT_TITLE, bg=BG, fg=ACCENT).pack(pady=(28,4))
        tk.Label(self, text="Dyslexia Handwriting Analyser  ·  Powered by Google Gemini",
                 font=FONT_SMALL, bg=BG, fg=TEXT_DIM).pack(pady=(0,6))

        tk.Label(self, text="Select API Provider:", font=FONT_SMALL, bg=BG, fg=TEXT_DIM).pack(pady=(0, 2))
        self.provider_var = tk.StringVar(value="Google Gemini")
        provider_combo = ttk.Combobox(self, textvariable=self.provider_var, 
                                      values=["Google Gemini", "Anthropic Claude"], state="readonly", font=FONT_BODY)
        provider_combo.pack(pady=(0, 10))
        provider_combo.bind("<<ComboboxSelected>>", self._on_provider_change)

        self.badge_frame = tk.Frame(self, bg="#0d3320")
        self.badge_frame.pack(pady=(0,10))
        self.badge_lbl = tk.Label(self.badge_frame, text="  ✅  FREE — Google AI Studio free tier  ",
                                  font=FONT_SMALL, bg="#0d3320", fg=SUCCESS, padx=12, pady=6)
        self.badge_lbl.pack()

        self.key_lbl = tk.Label(self, text="Google AI Studio API Key", font=FONT_BOLD,
                                bg=BG, fg=TEXT, anchor="w")
        self.key_lbl.pack(fill="x", **pad)

        self.key_var = tk.StringVar()
        key_entry = tk.Entry(self, textvariable=self.key_var, show="•",
                             font=FONT_MONO, bg=ENTRY_BG, fg=TEXT,
                             insertbackground=ACCENT, relief="flat", width=46)
        key_entry.pack(**pad)
        key_entry.bind("<Return>", lambda _: self._connect())

        self.help_frame = tk.Frame(self, bg=PANEL, padx=14, pady=10)
        self.help_frame.pack(fill="x", padx=28, pady=(0,10))
        self.help_title = tk.Label(self.help_frame, text="How to get your FREE key:", font=FONT_BOLD,
                                   bg=PANEL, fg=TEXT)
        self.help_title.pack(anchor="w")
        
        self.help_steps = []
        for i in range(4):
            lbl = tk.Label(self.help_frame, text="", font=FONT_SMALL, bg=PANEL, fg=TEXT_DIM, anchor="w")
            lbl.pack(anchor="w")
            self.help_steps.append(lbl)
            
        self._update_help_text()

        self.status_var = tk.StringVar(value="Enter your free API key above")
        self.status_lbl = tk.Label(self, textvariable=self.status_var,
                                   font=FONT_SMALL, bg=BG, fg=TEXT_DIM, wraplength=400)
        self.status_lbl.pack(pady=(8,4))

        btn_frame = tk.Frame(self, bg=BG)
        btn_frame.pack(pady=(8,28), padx=28, fill="x")
        self.connect_btn = tk.Button(btn_frame, text="▶  Connect & Start",
            font=FONT_BOLD, bg=ACCENT, fg="white", relief="flat", padx=18, pady=10,
            activebackground=ACCENT2, cursor="hand2", command=self._connect)
        self.connect_btn.pack(side="left", expand=True, fill="x", padx=(0,8))
        tk.Button(btn_frame, text="Cancel", font=FONT_BODY, bg=PANEL, fg=TEXT_DIM,
            relief="flat", padx=12, pady=10, cursor="hand2", command=self._cancel).pack(side="left")

    def _update_help_text(self):
        provider = self.provider_var.get()
        if provider == "Google Gemini":
            self.badge_frame.config(bg="#0d3320")
            self.badge_lbl.config(text="  ✅  FREE — Google AI Studio free tier  ", bg="#0d3320", fg=SUCCESS)
            self.key_lbl.config(text="Google AI Studio API Key")
            self.help_title.config(text="How to get your FREE key:")
            steps = [
                "1. Go to  aistudio.google.com",
                "2. Sign in with your Google account",
                "3. Click 'Get API Key' → 'Create API Key'",
                "4. Copy the key (starts with AIza...) and paste above"
            ]
        else:
            self.badge_frame.config(bg="#3a2a0d")
            self.badge_lbl.config(text="  💳  PAID — Anthropic Claude API  ", bg="#3a2a0d", fg=WARNING)
            self.key_lbl.config(text="Anthropic API Key")
            self.help_title.config(text="How to get your Claude key:")
            steps = [
                "1. Go to  console.anthropic.com",
                "2. Sign in with your account",
                "3. Go to 'API Keys' and Create Key",
                "4. Copy the key (starts with sk-ant...) and paste above"
            ]
            
        for i, step in enumerate(steps):
            self.help_steps[i].config(text=step)
            
    def _on_provider_change(self, event):
        self._update_help_text()
        self.key_var.set("")
        self.status_var.set("Enter your API key above")
        self.status_lbl.config(fg=TEXT_DIM)

    def _connect(self):
        key = self.key_var.get().strip()
        if not key:
            self._set_status("Please enter an API key.", ERROR_COL); return
        provider = self.provider_var.get()
        self._set_status(f"Connecting to {provider}…", TEXT_DIM)
        self.connect_btn.config(state="disabled")
        self.update()
        def _check():
            if provider == "Google Gemini":
                ok, msg = gemini.validate_api_key(key)
            else:
                ok, msg = gemini.validate_claude_api_key(key)
            self.after(0, lambda: self._after_connect(ok, msg, key, provider))
        threading.Thread(target=_check, daemon=True).start()

    def _after_connect(self, ok, msg, key, provider):
        if ok:
            self._set_status(f"✓ {msg}", SUCCESS)
            self.result_key = key
            self.result_provider = provider
            self.after(600, self.destroy)
        else:
            self._set_status(f"✗ {msg}", ERROR_COL)
            self.connect_btn.config(state="normal")

    def _set_status(self, text, colour):
        self.status_var.set(text); self.status_lbl.config(fg=colour)

    def _cancel(self):
        self.result_key = None; self.destroy()


class DyslexiaAssistant(tk.Tk):
    def __init__(self, api_key: str, provider: str = "Google Gemini"):
        super().__init__()
        self.api_provider = provider
        if provider == "Google Gemini":
            self.api_client = gemini.make_client(api_key)
        elif provider == "Anthropic Claude":
            self.api_client = gemini.make_claude_client(api_key)
        else:
            self.api_client = None
            
        self.api_key = api_key
        self.cap = None
        self._cam_running = False
        self._countdown_job = None
        self.image_bytes = None
        self.image_media_type = "image/jpeg"
        self._processing = False
        self._live_running = False
        self._live_processing = False
        self._live_after_job = None
        
        title_suffix = f"({provider})" if provider else "(Google Gemini · Free)"
        self.title(f"DyslexaRead — Handwriting Analyser {title_suffix}")
        self.configure(bg=BG)
        self.minsize(1000, 660)
        self._build_ui()
        sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        self.geometry(f"1100x720+{(sw-1100)//2}+{(sh-720)//2}")
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self):
        hdr = tk.Frame(self, bg=BG, pady=14)
        hdr.pack(fill="x", padx=24)
        tk.Label(hdr, text="◈ DyslexaRead", font=FONT_TITLE, bg=BG, fg=ACCENT).pack(side="left")
        tk.Label(hdr, text=" FREE · Google Gemini ", font=FONT_SMALL,
                 bg="#0d3320", fg=SUCCESS, padx=8, pady=4).pack(side="left", padx=12)
                 
        self._btn(hdr, "📂 View History", self._show_history,
                  bg=PANEL, fg=TEXT, font=FONT_SMALL, pady=4).pack(side="left", padx=12)
                  
        self._btn(hdr, "🔑 Change API Key", self._change_api_key,
                  bg=PANEL, fg=WARNING, font=FONT_SMALL, pady=4).pack(side="left", padx=12)
                  
        self.status_lbl = tk.Label(hdr, text="Ready", font=FONT_SMALL, bg=BG, fg=TEXT_DIM)
        self.status_lbl.pack(side="right")
        tk.Frame(self, bg=ACCENT, height=2).pack(fill="x")
        pane = tk.PanedWindow(self, orient="horizontal", bg=BG, sashwidth=6, sashrelief="flat", sashpad=2)
        pane.pack(fill="both", expand=True, padx=8, pady=8)
        left = tk.Frame(pane, bg=PANEL)
        pane.add(left, minsize=340, width=400)
        self._build_capture_panel(left)
        right = tk.Frame(pane, bg=BG)
        pane.add(right, minsize=400)
        self._build_results_panel(right)

    def _build_capture_panel(self, parent):
        tk.Label(parent, text="INPUT", font=("Helvetica",10,"bold"),
                 bg=PANEL, fg=TEXT_DIM, anchor="w").pack(fill="x", padx=16, pady=(14,0))
        btn_row = tk.Frame(parent, bg=PANEL)
        btn_row.pack(fill="x", padx=16, pady=4)
        
        btn_inner = tk.Frame(btn_row, bg=PANEL)
        btn_inner.pack(fill="x", pady=(8,4))
        self.cam_btn = self._btn(btn_inner, "📷 Snapshot", self._open_camera_window,
                                 bg=PANEL, fg=ACCENT, relief="solid", bd=1)
        self.cam_btn.pack(side="left", fill="x", expand=True, padx=(0,2))
        
        self.live_btn = self._btn(btn_inner, "🔴 Live Mode", self._open_live_window,
                                 bg=PANEL, fg=WARNING, relief="solid", bd=1)
        self.live_btn.pack(side="left", fill="x", expand=True, padx=(2,0))

        self._btn(btn_row, "📁  Upload Image File", self._upload_file,
                  bg=PANEL, fg=ACCENT, relief="solid", bd=1).pack(fill="x", pady=(0,8))
        self.preview_lbl = tk.Label(parent, bg="#080f18", fg=TEXT_DIM,
                                    text="No image loaded", font=FONT_SMALL, width=36, height=12)
        self.preview_lbl.pack(padx=16, pady=(8,4), fill="x", expand=True)
        tk.Frame(parent, bg=ACCENT, height=1).pack(fill="x", padx=16, pady=12)
        self.analyse_btn = self._btn(parent, "🚀  Transcribe & Analyse", self._run_pipeline,
            bg=ACCENT, fg="white", font=("Helvetica",14,"bold"), pady=12, state="disabled")
        self.analyse_btn.pack(fill="x", padx=16, pady=(0,4))
        self.progress = ttk.Progressbar(parent, mode="indeterminate", length=200)
        tk.Label(parent, text="⚡ Gemini 2.5 Flash · Free · ~10–15 s",
                 font=FONT_SMALL, bg=PANEL, fg=SUCCESS).pack(pady=(8,4))
        self._btn(parent, "↺  Reset", self._reset,
                  bg=PANEL, fg=TEXT_DIM, relief="flat").pack(pady=(0,16))

    def _build_results_panel(self, parent):
        style = ttk.Style()
        style.theme_use("default")
        style.configure("Dark.TNotebook", background=BG, borderwidth=0)
        style.configure("Dark.TNotebook.Tab", background=PANEL, foreground=TEXT_DIM,
                        padding=[16,8], font=FONT_BOLD)
        style.map("Dark.TNotebook.Tab",
                  background=[("selected", BG)], foreground=[("selected", ACCENT)])
        nb = ttk.Notebook(parent, style="Dark.TNotebook")
        nb.pack(fill="both", expand=True, padx=4, pady=4)
        def make_tab(label, bg_col):
            frame = tk.Frame(nb, bg=bg_col)
            txt = scrolledtext.ScrolledText(frame, wrap="word", font=FONT_MONO,
                bg=bg_col, fg=TEXT, insertbackground=ACCENT,
                relief="flat", padx=16, pady=14, state="disabled")
            txt.pack(fill="both", expand=True)
            nb.add(frame, text=label)
            return txt
        self.raw_txt  = make_tab("  ✏️  Raw Transcription  ", RAW_BG)
        self.ana_txt  = make_tab("  🔍  Error Analysis  ",   ANA_BG)
        self.corr_txt = make_tab("  ✅  Corrected Text  ",   COR_BG)
        self.notebook = nb
        
        btn_frame = tk.Frame(parent, bg=BG)
        btn_frame.pack(fill="x", padx=4, pady=4)
        self.save_btn = self._btn(btn_frame, "💾  Save to Profile", self._save_current_session,
                                  bg=PANEL, fg=ACCENT)
        self.save_btn.pack(side="right")

    def _btn(self, parent, text, cmd, bg=ACCENT, fg="white",
             font=FONT_BOLD, relief="flat", bd=0, pady=8, state="normal"):
        return tk.Button(parent, text=text, command=cmd, bg=bg, fg=fg, font=font,
            relief=relief, bd=bd, activebackground=ACCENT2, activeforeground="white",
            cursor="hand2", pady=pady, state=state)

    def _set_status(self, text, colour=TEXT_DIM):
        self.status_lbl.config(text=text, fg=colour)

    def _write_tab(self, widget, text):
        widget.config(state="normal")
        widget.delete("1.0", "end")
        widget.insert("end", text)
        widget.see("end")
        widget.config(state="disabled")

    def _open_camera_window(self):
        self._set_status("Opening camera…", WARNING)
        self.cam_btn.config(state="disabled")
        self.update_idletasks()
        
        self.cap = cv2.VideoCapture(0)
        if not self.cap.isOpened():
            self._set_status("⚠ Could not open camera", ERROR_COL)
            self.cam_btn.config(state="normal")
            return

        self._cam_running = True
        self._cam_frame = None
        self._countdown_active = False
        
        self._cam_win = tk.Toplevel(self)
        self._cam_win.title("📷 Camera Preview — Position your paper, then click Snap")
        self._cam_win.geometry("700x580")
        self._cam_win.configure(bg=BG)
        self._cam_win.resizable(False, False)
        self._cam_win.protocol("WM_DELETE_WINDOW", self._cancel_camera)
        self._cam_win.grab_set()
        self._cam_win.focus_force()
        
        self._cam_label = tk.Label(self._cam_win, bg=PANEL)
        self._cam_label.pack(padx=15, pady=(15, 8))
        
        self.countdown_lbl = tk.Label(self._cam_win, text="",
                                      font=("Helvetica", 28, "bold"), bg=BG, fg=WARNING)
        self.countdown_lbl.pack(pady=(0, 4))
        
        btn_row = tk.Frame(self._cam_win, bg=BG)
        btn_row.pack(fill="x", padx=15, pady=(0, 15))
        
        self._cam_take_btn = self._btn(btn_row, "📸  Snap (3s countdown)", self._start_countdown,
                                       bg=ACCENT)
        self._cam_take_btn.pack(side="left", expand=True, fill="x", padx=(0, 6))
        
        self._cam_cancel_btn = self._btn(btn_row, "❌  Cancel", self._cancel_camera,
                                         bg=ERROR_COL)
        self._cam_cancel_btn.pack(side="right", expand=True, fill="x", padx=(6, 0))
        
        self._update_camera_feed()

    def _update_camera_feed(self):
        if not self._cam_running or not self.cap: return
        ret, frame = self.cap.read()
        if ret:
            self._cam_frame = frame
            img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            img.thumbnail((660, 460))
            imgtk = ImageTk.PhotoImage(image=img)
            self._cam_label.config(image=imgtk)
            self._cam_label.image = imgtk
        
        if self._cam_running and hasattr(self, '_cam_win') and self._cam_win.winfo_exists():
            self._cam_win.after(33, self._update_camera_feed)

    def _start_countdown(self):
        if self._countdown_active: return
        self._countdown_active = True
        self._cam_take_btn.config(state="disabled")
        self._countdown_tick(3)

    def _countdown_tick(self, remaining):
        if not self._cam_running or not hasattr(self, '_cam_win') or not self._cam_win.winfo_exists(): return
        if remaining > 0:
            self.countdown_lbl.config(text=f"📸 Capturing in {remaining}…")
            self._cam_win.after(1000, lambda: self._countdown_tick(remaining - 1))
        else:
            self.countdown_lbl.config(text="📸 Captured!")
            self._capture_and_close()

    def _capture_and_close(self):
        self._cam_running = False
        frame = self._cam_frame
        if self.cap: self.cap.release(); self.cap = None
        
        if frame is not None:
            _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            self.image_bytes, self.image_media_type = gemini.encode_image_bytes(buf.tobytes())
            img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            img.thumbnail((380, 260))
            imgtk = ImageTk.PhotoImage(image=img)
            self.preview_lbl.config(image=imgtk, text="")
            self.preview_lbl.image = imgtk
            self.analyse_btn.config(state="normal")
            self._set_status("Photo captured — ready to analyse", SUCCESS)
        else:
            self._set_status("⚠ Could not capture frame", ERROR_COL)
            
        if hasattr(self, '_cam_win') and self._cam_win.winfo_exists():
            self._cam_win.destroy()
        self.cam_btn.config(state="normal")

    def _cancel_camera(self):
        self._cam_running = False
        if self.cap:
            self.cap.release(); self.cap = None
        if hasattr(self, '_cam_win') and self._cam_win.winfo_exists():
            self._cam_win.destroy()
        self.cam_btn.config(state="normal")
        self._set_status("Camera cancelled", TEXT_DIM)

    def _open_live_window(self):
        self._set_status("Starting Live Mode…", WARNING)
        self.cam_btn.config(state="disabled")
        self.live_btn.config(state="disabled")
        self.analyse_btn.config(state="disabled")
        self.preview_lbl.config(image="", text="Live Mode active in other window")
        self.update_idletasks()
        
        self.cap = cv2.VideoCapture(0)
        if not self.cap.isOpened():
            self._set_status("⚠ Could not open camera", ERROR_COL)
            self.cam_btn.config(state="normal")
            self.live_btn.config(state="normal")
            return

        self._live_running = True
        self._live_processing = False
        self._cam_frame = None
        
        self._live_win = tk.Toplevel(self)
        self._live_win.title("🔴 Live Tracking — Auto-analysing every 6s")
        self._live_win.geometry("700x560")
        self._live_win.configure(bg=BG)
        self._live_win.resizable(False, False)
        self._live_win.protocol("WM_DELETE_WINDOW", self._stop_live_mode)
        
        self._live_label = tk.Label(self._live_win, bg=PANEL)
        self._live_label.pack(padx=15, pady=(15, 8))
        
        self._live_status_lbl = tk.Label(self._live_win, text="Waiting to capture first frame...",
                                      font=("Helvetica", 14, "bold"), bg=BG, fg=SUCCESS)
        self._live_status_lbl.pack(pady=(0, 10))
        
        btn_row = tk.Frame(self._live_win, bg=BG)
        btn_row.pack(fill="x", padx=15, pady=(0, 15))
        
        self._live_stop_btn = self._btn(btn_row, "⏹  Stop Live Mode", self._stop_live_mode,
                                         bg=ERROR_COL)
        self._live_stop_btn.pack(side="right", expand=True, fill="x", padx=(6, 0))
        
        self._live_save_btn = self._btn(btn_row, "💾 Save Frame & Text to Profile", self._save_current_session,
                                        bg=PANEL, fg=ACCENT, relief="solid", bd=1)
        self._live_save_btn.pack(side="left", expand=True, fill="x", padx=(0, 6))
        
        self._update_live_feed()
        self._live_cycle_tick()

    def _update_live_feed(self):
        if not self._live_running or not self.cap: return
        ret, frame = self.cap.read()
        if ret:
            self._cam_frame = frame
            img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            img.thumbnail((660, 460))
            imgtk = ImageTk.PhotoImage(image=img)
            self._live_label.config(image=imgtk)
            self._live_label.image = imgtk
        
        if self._live_running and hasattr(self, '_live_win') and self._live_win.winfo_exists():
            self._live_win.after(33, self._update_live_feed)

    def _stop_live_mode(self):
        self._live_running = False
        if self._live_after_job:
            self.after_cancel(self._live_after_job)
            self._live_after_job = None
        if self.cap:
            self.cap.release(); self.cap = None
        if hasattr(self, '_live_win') and self._live_win.winfo_exists():
            self._live_win.destroy()
        self.cam_btn.config(state="normal")
        self.live_btn.config(state="normal")
        self.preview_lbl.config(text="No image loaded")
        self._set_status("Live Mode stopped", TEXT_DIM)

    def _live_cycle_tick(self):
        if not self._live_running: return
        
        if not self._live_processing and self._cam_frame is not None:
            self._live_processing = True
            self._live_status_lbl.config(text="Processing frame...", fg=WARNING)
            
            frame = self._cam_frame
            _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            image_bytes, image_media_type = gemini.encode_image_bytes(buf.tobytes())
            
            threading.Thread(target=self._run_live_pipeline_quiet, args=(image_bytes, image_media_type), daemon=True).start()
        
        self._live_after_job = self.after(6000, self._live_cycle_tick)

    def _run_live_pipeline_quiet(self, img, mtype):
        try:
            self.after(0, lambda: [self._write_tab(w, "") for w in (self.raw_txt, self.ana_txt, self.corr_txt)])
            
            if self.api_provider == "Anthropic Claude":
                raw_text = gemini.transcribe_stream_claude(self.api_client, img, mtype,
                    on_chunk=lambda t: self.after(0, lambda t=t: self._write_tab(self.raw_txt, t)))
                gemini.analyse_and_correct_stream_claude(self.api_client, raw_text,
                    on_analysis_chunk=lambda t: self.after(0, lambda t=t: self._write_tab(self.ana_txt, t)),
                    on_corrected_chunk=lambda t: self.after(0, lambda t=t: self._write_tab(self.corr_txt, t)))
            else:
                raw_text = gemini.transcribe_stream(self.api_client, img, mtype,
                    on_chunk=lambda t: self.after(0, lambda t=t: self._write_tab(self.raw_txt, t)))
                gemini.analyse_and_correct_stream(self.api_client, raw_text,
                    on_analysis_chunk=lambda t: self.after(0, lambda t=t: self._write_tab(self.ana_txt, t)),
                    on_corrected_chunk=lambda t: self.after(0, lambda t=t: self._write_tab(self.corr_txt, t)))
                
            self.after(0, lambda: self._live_status_lbl.config(text="✓ Updated tabs (Next check soon...)", fg=SUCCESS))
        except Exception as e:
            self.after(0, lambda: self._live_status_lbl.config(text=f"⚠ Capture error: {str(e)[:40]}", fg=ERROR_COL))
        finally:
            self.after(0, lambda: setattr(self, '_live_processing', False))


    def _upload_file(self):
        path = filedialog.askopenfilename(
            title="Select handwriting image",
            filetypes=[("Images", "*.jpg *.jpeg *.png *.bmp *.webp"), ("All files", "*.*")])
        if not path: return
        try:
            img = Image.open(path)
            img.thumbnail((1200, 1200))
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=85)
            self.image_bytes = buf.getvalue()
            self.image_media_type = "image/jpeg"
            img.thumbnail((380, 260))
            imgtk = ImageTk.PhotoImage(image=img)
            self.preview_lbl.config(image=imgtk, text="")
            self.preview_lbl.image = imgtk
            self._set_status(f"Loaded: {os.path.basename(path)}", SUCCESS)
            self.analyse_btn.config(state="normal")
        except Exception as e:
            messagebox.showerror("File Error", str(e))

    def _run_pipeline(self):
        if self._processing or not self.image_bytes: return
        self._processing = True
        self.analyse_btn.config(state="disabled", text="Processing…")
        self.progress.pack(fill="x", padx=16, pady=4)
        self.progress.start(12)
        for w in (self.raw_txt, self.ana_txt, self.corr_txt): self._write_tab(w, "")
        self._write_tab(self.raw_txt, "Transcribing handwriting…\n")
        self.notebook.select(0)
        threading.Thread(target=self._pipeline_thread, daemon=True).start()

    def _pipeline_thread(self):
        img = self.image_bytes; mtype = self.image_media_type
        try:
            self.after(0, lambda: self._set_status("Step 1/2 — Transcribing handwriting…", ACCENT2))
            if self.api_provider == "Anthropic Claude":
                raw_text = gemini.transcribe_stream_claude(self.api_client, img, mtype,
                    on_chunk=lambda t: self.after(0, lambda t=t: self._write_tab(self.raw_txt, t)))
            else:
                raw_text = gemini.transcribe_stream(self.api_client, img, mtype,
                    on_chunk=lambda t: self.after(0, lambda t=t: self._write_tab(self.raw_txt, t)))
                    
            self.after(0, lambda: (
                self._set_status("Step 2/2 — Analysing errors…", ACCENT2),
                self._write_tab(self.ana_txt, "Identifying error patterns…\n"),
                self.notebook.select(1),
            ))
            
            if self.api_provider == "Anthropic Claude":
                gemini.analyse_and_correct_stream_claude(self.api_client, raw_text,
                    on_analysis_chunk=lambda t: self.after(0, lambda t=t: self._write_tab(self.ana_txt, t)),
                    on_corrected_chunk=lambda t: self.after(0, lambda t=t: self._write_tab(self.corr_txt, t)))
            else:
                gemini.analyse_and_correct_stream(self.api_client, raw_text,
                    on_analysis_chunk=lambda t: self.after(0, lambda t=t: self._write_tab(self.ana_txt, t)),
                    on_corrected_chunk=lambda t: self.after(0, lambda t=t: self._write_tab(self.corr_txt, t)))
                
            self.after(0, self._pipeline_done)
        except Exception as e:
            self.after(0, lambda: self._pipeline_error(str(e)))

    def _pipeline_done(self):
        self._processing = False
        self.progress.stop(); self.progress.pack_forget()
        self.analyse_btn.config(state="normal", text="🚀  Transcribe & Analyse")
        self._set_status("✓ Analysis complete", SUCCESS)
        self.notebook.select(2)

    def _pipeline_error(self, msg):
        self._processing = False
        self.progress.stop(); self.progress.pack_forget()
        self.analyse_btn.config(state="normal", text="🚀  Transcribe & Analyse")
        self._set_status(f"Error: {msg}", ERROR_COL)
        messagebox.showerror("Analysis Failed", msg)

    def _get_tab_text(self, widget):
        return widget.get("1.0", "end-1c").strip()
        
    def _save_current_session(self):
        if not self.image_bytes:
            messagebox.showerror("No Image", "You must load or capture an image before saving.")
            return
            
        raw = self._get_tab_text(self.raw_txt)
        corr = self._get_tab_text(self.corr_txt)
        if not raw and not corr:
            messagebox.showerror("No Text", "There is no analysis text to save yet.")
            return

        profile_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "profiles", "default")
        os.makedirs(profile_dir, exist_ok=True)
        
        run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        img_filename = f"img_{run_id}.jpg"
        img_path = os.path.join(profile_dir, img_filename)
        
        with open(img_path, "wb") as f:
            f.write(self.image_bytes)
            
        session_data = {
            "id": run_id,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "image_path": f"profiles/default/{img_filename}",
            "raw_text": raw,
            "analysis": self._get_tab_text(self.ana_txt),
            "corrected_text": corr
        }
        
        json_path = os.path.join(profile_dir, "sessions.json")
        data = []
        if os.path.exists(json_path):
            with open(json_path, "r", encoding="utf-8") as f:
                try: data = json.load(f)
                except json.JSONDecodeError: pass
                
        data.append(session_data)
        
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            
        self._set_status(f"Saved session to profile {run_id}", SUCCESS)
        if hasattr(self, '_live_win') and self._live_win.winfo_exists():
            self._live_status_lbl.config(text=f"💾 Saved to profile!", fg=SUCCESS)

    def _show_history(self):
        json_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "profiles", "default", "sessions.json")
        if not os.path.exists(json_path):
            messagebox.showinfo("History", "No saved sessions found in your profile yet.")
            return
            
        with open(json_path, "r", encoding="utf-8") as f:
            sessions = json.load(f)
            
        if not sessions:
            messagebox.showinfo("History", "Profile is empty.")
            return
            
        sessions.reverse() # Newest first

        hist_win = tk.Toplevel(self)
        hist_win.title("📂 Profile History")
        hist_win.geometry("500x600")
        hist_win.configure(bg=BG)
        hist_win.transient(self)
        
        tk.Label(hist_win, text="Saved Sessions", font=FONT_TITLE, bg=BG, fg=TEXT).pack(pady=15)
        tk.Label(hist_win, text="Click a session to load it into the main viewer.", 
                 bg=BG, fg=TEXT_DIM, font=FONT_BODY).pack(pady=(0,10))
        
        frame = tk.Frame(hist_win, bg=PANEL)
        frame.pack(fill="both", expand=True, padx=20, pady=(0, 20))
        
        scrollbar = ttk.Scrollbar(frame)
        scrollbar.pack(side="right", fill="y")
        
        listbox = tk.Listbox(frame, bg=PANEL, fg=TEXT, font=FONT_BODY,
                             selectbackground=ACCENT, relief="flat", highlightthickness=0,
                             yscrollcommand=scrollbar.set)
        listbox.pack(side="left", fill="both", expand=True, padx=2, pady=2)
        scrollbar.config(command=listbox.yview)
        
        for sess in sessions:
            preview = sess.get("corrected_text", "")[:40].replace("\n", " ") + "..."
            listbox.insert("end", f"{sess['timestamp']} — {preview}")
            
        def _load_selected():
            idx = listbox.curselection()
            if not idx: return
            sess = sessions[idx[0]]
            
            base_dir = os.path.dirname(os.path.abspath(__file__))
            img_abs_path = os.path.join(base_dir, sess["image_path"])
            
            if os.path.exists(img_abs_path):
                try:
                    with open(img_abs_path, "rb") as bf:
                        self.image_bytes = bf.read()
                    self.image_media_type = "image/jpeg"
                    img = Image.open(io.BytesIO(self.image_bytes))
                    img.thumbnail((380, 260))
                    imgtk = ImageTk.PhotoImage(image=img)
                    self.preview_lbl.config(image=imgtk, text="")
                    self.preview_lbl.image = imgtk
                except Exception as e:
                    print(f"Failed to load image: {e}")
            else:
                self.preview_lbl.config(image="", text="[Image missing from disk]")
                
            self._write_tab(self.raw_txt, sess.get("raw_text", ""))
            self._write_tab(self.ana_txt, sess.get("analysis", ""))
            self._write_tab(self.corr_txt, sess.get("corrected_text", ""))
            
            self._set_status(f"Loaded history from {sess['timestamp']}", SUCCESS)
            hist_win.destroy()
            
        self._btn(hist_win, "Load Selected Session", _load_selected, bg=ACCENT).pack(pady=(0, 20), padx=20, fill="x")

    def _change_api_key(self):
        dialog = SetupDialog(self)
        self.wait_window(dialog)
        if dialog.result_key:
            self.api_provider = dialog.result_provider
            self.api_key = dialog.result_key
            if self.api_provider == "Google Gemini":
                self.api_client = gemini.make_client(dialog.result_key)
                save_api_key_to_env(dialog.result_key, "GEMINI_API_KEY")
            elif self.api_provider == "Anthropic Claude":
                self.api_client = gemini.make_claude_client(dialog.result_key)
                save_api_key_to_env(dialog.result_key, "ANTHROPIC_API_KEY")
                
            title_suffix = f"({self.api_provider})"
            self.title(f"DyslexaRead — Handwriting Analyser {title_suffix}")
            self._set_status(f"API Key updated successfully for {self.api_provider}", SUCCESS)

    def _reset(self):
        if self._processing: return
        if self._cam_running: self._cancel_camera()
        if self._live_running: self._stop_live_mode()
        self.image_bytes = None
        self.preview_lbl.config(image="", text="No image loaded")
        for w in (self.raw_txt, self.ana_txt, self.corr_txt): self._write_tab(w, "")
        self.analyse_btn.config(state="disabled", text="🚀  Transcribe & Analyse")
        self._set_status("Ready")

    def _on_close(self):
        if self._cam_running: self._cancel_camera()
        if self._live_running: self._stop_live_mode()
        self.destroy()


def main():
    # Only fastpath start if Gemini or Claude API key exists
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    claude_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    
    api_key = None
    provider = "Google Gemini"

    if gemini_key:
        print("Found GEMINI_API_KEY in environment, validating...")
        ok, msg = gemini.validate_api_key(gemini_key)
        if ok:
            print(f"✓ KEY VALIDATED: {msg}")
            api_key = gemini_key
            provider = "Google Gemini"
        else:
            print(f"✗ KEY INVALID ({msg}), falling back to UI.")
            
    if not api_key and claude_key:
        print("Found ANTHROPIC_API_KEY in environment, validating...")
        ok, msg = gemini.validate_claude_api_key(claude_key)
        if ok:
            print(f"✓ KEY VALIDATED: {msg}")
            api_key = claude_key
            provider = "Anthropic Claude"
        else:
            print(f"✗ KEY INVALID ({msg}), falling back to UI.")

    if not api_key:
        root = tk.Tk()
        root.withdraw()
        dialog = SetupDialog(root)
        root.wait_window(dialog)
        api_key = dialog.result_key
        provider = getattr(dialog, 'result_provider', "Google Gemini")
        root.destroy()
        if api_key:
            env_var = "GEMINI_API_KEY" if provider == "Google Gemini" else "ANTHROPIC_API_KEY"
            save_api_key_to_env(api_key, env_var)

    if not api_key:
        return

    app = DyslexiaAssistant(api_key, provider)
    app.mainloop()

if __name__ == "__main__":
    main()