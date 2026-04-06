(() => {
  const state = {
    selectedFile: null,
    stream: null,
    autoCaptureTimer: null,
    progressTimer: null,
    resultData: null,
    isAnalyzing: false,
  };

  const el = {
    geminiApiKey: document.getElementById("geminiApiKey"),
    saveApiKeyBtn: document.getElementById("saveApiKeyBtn"),
    toggleApiKeyBtn: document.getElementById("toggleApiKeyBtn"),
    apiKeyState: document.getElementById("apiKeyState"),
    fileInput: document.getElementById("fileInput"),
    uploadBtn: document.getElementById("uploadBtn"),
    dropZone: document.getElementById("dropZone"),
    startCameraBtn: document.getElementById("startCameraBtn"),
    captureBtn: document.getElementById("captureBtn"),
    liveModeBtn: document.getElementById("liveModeBtn"),
    stopCameraBtn: document.getElementById("stopCameraBtn"),
    cameraPreview: document.getElementById("cameraPreview"),
    imagePreview: document.getElementById("imagePreview"),
    previewPlaceholder: document.getElementById("previewPlaceholder"),
    captureCanvas: document.getElementById("captureCanvas"),
    analyzeBtn: document.getElementById("analyzeBtn"),
    loadingIndicator: document.getElementById("loadingIndicator"),
    progressBar: document.getElementById("progressBar"),
    statusText: document.getElementById("statusText"),
    themeToggleBtn: document.getElementById("themeToggleBtn"),
    saveResultsBtn: document.getElementById("saveResultsBtn"),
    resultsPanel: document.querySelector(".results-panel"),
    errorBanner: document.getElementById("errorBanner"),
    errorMessage: document.getElementById("errorMessage"),
    retryAnalyzeBtn: document.getElementById("retryAnalyzeBtn"),
    tabs: Array.from(document.querySelectorAll(".tab")),
    panels: Array.from(document.querySelectorAll(".tab-panel")),
    rawContent: document.getElementById("rawContent"),
    analysisContent: document.getElementById("analysisContent"),
    correctedContent: document.getElementById("correctedContent"),
    toast: document.getElementById("toast"),
  };

  const API_KEY_STORAGE = "dyslexaread:geminiApiKey";
  const OPENROUTER_API_KEY_STORAGE = "dyslexaread:openrouterApiKey";
  const API_BASE_STORAGE = "dyslexaread:apiBaseUrl";
  const THEME_STORAGE = "dyslexaread:theme";
  const REQUEST_TIMEOUT_MS = 120000;

  function applyTheme(theme) {
    const root = document.documentElement;
    const nextTheme = theme === "dark" ? "dark" : "light";
    root.setAttribute("data-theme", nextTheme);
    if (el.themeToggleBtn) {
      const icon = el.themeToggleBtn.querySelector(".theme-icon");
      if (icon) {
        icon.textContent = nextTheme === "dark" ? "🌙" : "☀️";
      }
      el.themeToggleBtn.setAttribute("title", nextTheme === "dark" ? "Switch to light mode" : "Switch to dark mode");
      el.themeToggleBtn.setAttribute("aria-label", nextTheme === "dark" ? "Switch to light mode" : "Switch to dark mode");
      el.themeToggleBtn.classList.toggle("is-dark", nextTheme === "dark");
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_STORAGE, next);
    applyTheme(next);
  }

  async function canReachBackend(baseUrl) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch (_error) {
      clearTimeout(timeoutId);
      return false;
    }
  }

  async function resolveApiBaseUrl() {
    const saved = (localStorage.getItem(API_BASE_STORAGE) || "").trim().replace(/\/$/, "");
    if (saved && await canReachBackend(saved)) {
      return saved;
    }

    const candidates = [];
    if (window.location.port && window.location.port !== "5500") {
      candidates.push(`${window.location.protocol}//${window.location.host}`);
    }
    candidates.push("http://127.0.0.1:8000", "http://127.0.0.1:8001");

    for (const base of candidates) {
      if (await canReachBackend(base)) {
        localStorage.setItem(API_BASE_STORAGE, base);
        return base;
      }
    }

    return saved || (window.location.port === "5500" ? "http://127.0.0.1:8001" : "");
  }

  function sanitizeApiKey(value) {
    let key = (value || "").trim();

    if (
      (key.startsWith('"') && key.endsWith('"')) ||
      (key.startsWith("'") && key.endsWith("'"))
    ) {
      key = key.slice(1, -1).trim();
    }

    return key;
  }

  function isProbablyGeminiApiKey(value) {
    return /^AIza[\w-]{20,}$/.test(value);
  }

  function isProbablyOpenRouterApiKey(value) {
    return /^sk-or-v1-[\w-]{20,}$/.test(value);
  }

  function showToast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.add("show");
    setTimeout(() => el.toast.classList.remove("show"), 2400);
  }

  function hideResultsOnError() {
    if (!el.resultsPanel) return;
    el.resultsPanel.classList.add("has-error");
  }

  function restoreResultsView() {
    if (!el.resultsPanel) return;
    el.resultsPanel.classList.remove("has-error");
  }

  function showErrorBanner(message) {
    if (el.errorMessage) {
      el.errorMessage.textContent = message;
    }
    if (el.errorBanner) {
      el.errorBanner.hidden = false;
    }
    hideResultsOnError();
  }

  function hideErrorBanner() {
    if (el.errorBanner) {
      el.errorBanner.hidden = true;
    }
    restoreResultsView();
  }

  function mapFriendlyError(rawMessage, statusCode) {
    const text = String(rawMessage || "");

    if (/OpenRouter credits|OpenRouter.*quota|insufficient.*credits|Payment Required/i.test(text)) {
      return "OpenRouter credits are insufficient. Add credits in OpenRouter, or clear OpenRouter key to use Gemini backend key.";
    }

    if (/API_KEY_INVALID|API key not valid|Invalid Gemini API key/i.test(text)) {
      return "Backend configuration error: Invalid API key. Please contact the developer.";
    }

    if (/timed out|timeout/i.test(text)) {
      return "Server error: The AI request timed out. Please try again.";
    }

    if (statusCode === 401 || statusCode === 403) {
      return "Backend authorization issue. Please contact the developer.";
    }

    if (statusCode >= 500) {
      return "Server error: AI processing is unavailable right now. Please try again later.";
    }

    if (statusCode >= 400) {
      return "Request error: The server could not process this image. Please check your input and try again.";
    }

    return "Network issue: Could not complete the request. Please check your connection and try again.";
  }

  async function parseErrorResponse(response) {
    let bodyText = "";
    let bodyJson = null;

    try {
      bodyText = await response.text();
      if (bodyText) {
        try {
          bodyJson = JSON.parse(bodyText);
        } catch (_jsonError) {
          bodyJson = null;
        }
      }
    } catch (_readError) {
      bodyText = "";
    }

    const detail = bodyJson?.detail;
    const message = bodyJson?.message;
    const candidate =
      (typeof detail === "string" && detail) ||
      (typeof message === "string" && message) ||
      bodyText ||
      response.statusText ||
      "Request failed";

    return {
      status: response.status,
      bodyText,
      bodyJson,
      rawMessage: candidate,
    };
  }

  function setStatus(message, mode = "") {
    if (!el.statusText) return;
    el.statusText.textContent = message;
    el.statusText.className = `status-text ${mode}`.trim();
  }

  function setApiKeyState(saved) {
    if (!el.apiKeyState) return;
    el.apiKeyState.textContent = saved ? "Saved" : "Not Saved";
    el.apiKeyState.classList.toggle("is-saved", saved);
  }

  function setProgress(value) {
    if (!el.progressBar) return;
    el.progressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
  }

  function startFakeProgress() {
    clearInterval(state.progressTimer);
    let value = 6;
    setProgress(value);
    state.progressTimer = setInterval(() => {
      if (value < 90) {
        value += Math.random() * 9;
        setProgress(value);
      }
    }, 300);
  }

  function stopFakeProgress(success = true) {
    clearInterval(state.progressTimer);
    setProgress(success ? 100 : 0);
    if (success) {
      setTimeout(() => setProgress(0), 700);
    }
  }

  function setAnalyzing(isAnalyzing) {
    state.isAnalyzing = isAnalyzing;
    if (el.analyzeBtn) {
      el.analyzeBtn.disabled = isAnalyzing || !state.selectedFile;
      el.analyzeBtn.textContent = isAnalyzing ? "Analyzing..." : "Analyze";
    }
    if (el.uploadBtn) el.uploadBtn.disabled = isAnalyzing;
    if (el.startCameraBtn) el.startCameraBtn.disabled = isAnalyzing;
    if (el.captureBtn) el.captureBtn.disabled = isAnalyzing || !state.stream;
    if (el.liveModeBtn) el.liveModeBtn.disabled = !state.stream;
    if (el.stopCameraBtn) el.stopCameraBtn.disabled = isAnalyzing || !state.stream;
    if (el.loadingIndicator) el.loadingIndicator.hidden = !isAnalyzing;
  }

  function updateLiveModeButton() {
    if (!el.liveModeBtn) return;
    const running = Boolean(state.autoCaptureTimer);
    el.liveModeBtn.disabled = !state.stream;
    el.liveModeBtn.textContent = running ? "Stop Live Mode" : "Resume Live Mode";
  }

  function switchTab(tabName) {
    el.tabs.forEach((tab) => {
      const active = tab.dataset.tab === tabName;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });

    el.panels.forEach((panel) => {
      const active = panel.dataset.panel === tabName;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
  }

  async function typeText(target, text) {
    if (!target) return;
    target.textContent = "";
    for (let i = 0; i < text.length; i += 1) {
      target.textContent += text[i];
      if (i % 3 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 6));
      }
    }
  }

  async function renderResults(data) {
    const raw = typeof data.raw === "string" ? data.raw : "";
    const analysis = typeof data.analysis === "string" ? data.analysis : "";
    const corrected = typeof data.corrected === "string" ? data.corrected : "";

    await Promise.all([
      typeText(el.rawContent, raw || "No raw text returned."),
      typeText(el.analysisContent, analysis || "No analysis returned."),
      typeText(el.correctedContent, corrected || "No corrected text returned."),
    ]);
  }

  function persistResults() {
    if (!state.resultData) return;
    localStorage.setItem("dyslexaread:lastResults", JSON.stringify(state.resultData));
    showToast("Results saved locally in browser storage.");
  }

  function loadPersistedResults() {
    try {
      const raw = localStorage.getItem("dyslexaread:lastResults");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      state.resultData = parsed;
      el.rawContent.textContent = parsed.raw || "Raw transcription will appear here.";
      el.analysisContent.textContent = parsed.analysis || "Error analysis will appear here.";
      el.correctedContent.textContent = parsed.corrected || "Corrected text will appear here.";
      el.saveResultsBtn.disabled = false;
      setStatus("Loaded previous local result.", "ok");
    } catch (_error) {
      setStatus("Could not load saved local result.", "error");
    }
  }

  function setSelectedFile(file) {
    state.selectedFile = file;
    setAnalyzing(false);

    if (!file) {
      el.imagePreview.style.display = "none";
      el.previewPlaceholder.style.display = "grid";
      return;
    }

    const url = URL.createObjectURL(file);
    el.imagePreview.src = url;
    el.imagePreview.style.display = "block";
    el.previewPlaceholder.style.display = "none";
    setStatus(`Image ready: ${file.name}`);
  }

  async function compressImageFile(file, maxDim = 1280, quality = 0.82) {
    try {
      const srcUrl = URL.createObjectURL(file);
      const img = new Image();

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = srcUrl;
      });

      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const outW = Math.max(1, Math.round(w * scale));
      const outH = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = outW;
      canvas.height = outH;
      ctx.drawImage(img, 0, 0, outW, outH);
      URL.revokeObjectURL(srcUrl);

      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
      });

      if (!blob) return file;
      const baseName = (file.name || "capture").replace(/\.[^.]+$/, "");
      return new File([blob], `${baseName}-compressed.jpg`, { type: "image/jpeg" });
    } catch (_error) {
      return file;
    }
  }

  function stopAutoCaptureLoop() {
    if (state.autoCaptureTimer) {
      clearInterval(state.autoCaptureTimer);
      state.autoCaptureTimer = null;
    }
    updateLiveModeButton();
  }

  async function captureAndAnalyzeFrame() {
    if (!state.stream || state.isAnalyzing) return;
    const video = el.cameraPreview;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = el.captureCanvas;
    const context = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88);
    });
    if (!blob) return;

    const file = new File([blob], `live-${Date.now()}.jpg`, { type: "image/jpeg" });
    setSelectedFile(file);
    await analyzeImage({ fileOverride: file, silent: true, source: "live-camera" });
  }

  function startAutoCaptureLoop() {
    stopAutoCaptureLoop();
    state.autoCaptureTimer = setInterval(() => {
      captureAndAnalyzeFrame().catch(() => {});
    }, 5000);
    updateLiveModeButton();
  }

  function getCameraErrorMessage(error) {
    const name = error?.name || "";

    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "Camera access denied. Please allow camera permission in your browser settings.";
    }

    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No camera device found. Connect a camera and try again.";
    }

    if (name === "NotReadableError" || name === "TrackStartError") {
      return "Camera is already in use by another app. Close other camera apps and retry.";
    }

    if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
      return "Camera constraints are not supported on this device. Retrying with basic mode may help.";
    }

    if (name === "AbortError") {
      return "Camera start was interrupted. Please try again.";
    }

    return "Unable to access camera. Check permissions and secure context (https or localhost).";
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("Camera not supported in this browser.", "error");
      return;
    }

    const host = window.location.hostname;
    const isLocalhost = host === "localhost" || host === "127.0.0.1";
    if (!window.isSecureContext && !isLocalhost) {
      setStatus("Camera requires HTTPS (or localhost). Open this site over a secure origin.", "error");
      showToast("Camera blocked on insecure origin.");
      return;
    }

    stopCamera();

    const constraintCandidates = [
      {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "environment",
        },
      },
      {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      },
      { video: true },
    ];

    try {
      let stream = null;
      let lastError = null;
      for (const constraints of constraintCandidates) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!stream) {
        throw lastError || new Error("Could not start camera stream");
      }

      state.stream = stream;
      el.cameraPreview.srcObject = state.stream;
      el.cameraPreview.style.display = "block";
      try {
        await el.cameraPreview.play();
      } catch (_playError) {
        // Some browsers auto-play after metadata; ignore explicit play failure here.
      }

      state.stream.getVideoTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          setStatus("Camera stream ended.", "error");
          stopCamera();
        });
      });

      el.captureBtn.disabled = false;
      el.stopCameraBtn.disabled = false;
      setStatus("Camera is active.", "ok");
      startAutoCaptureLoop();
      updateLiveModeButton();
      showToast("Live camera started. Auto-analyzing every 5s.");
    } catch (error) {
      setStatus(getCameraErrorMessage(error), "error");
      showToast("Unable to start live camera.");
    }
  }

  function stopCamera() {
    stopAutoCaptureLoop();
    if (!state.stream) return;
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
    el.cameraPreview.srcObject = null;
    el.cameraPreview.style.display = "none";
    el.captureBtn.disabled = true;
    el.stopCameraBtn.disabled = true;
    updateLiveModeButton();
  }

  function captureSnapshot() {
    if (!state.stream) return;
    const video = el.cameraPreview;
    const canvas = el.captureCanvas;
    const context = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      setSelectedFile(file);
      showToast("Snapshot captured.");
    }, "image/jpeg", 0.9);
  }

  async function analyzeImage(options = {}) {
    const fileToAnalyze = options.fileOverride || state.selectedFile;
    const silent = options.silent === true;
    const source = options.source || "manual";
    if (!fileToAnalyze || state.isAnalyzing) return;

    setAnalyzing(true);
    startFakeProgress();
    setStatus(source === "live-camera" ? "Live capture: Processing frame with AI..." : "Processing image with AI...");
    hideErrorBanner();

    try {
      const formData = new FormData();
      const compressed = await compressImageFile(fileToAnalyze);
      formData.append("file", compressed);

      const enteredKey = sanitizeApiKey(el.geminiApiKey?.value || "");
      const savedKey = sanitizeApiKey(localStorage.getItem(API_KEY_STORAGE) || "");
      const effectiveKey = enteredKey || savedKey;
      const savedOpenRouterKey = sanitizeApiKey(localStorage.getItem(OPENROUTER_API_KEY_STORAGE) || "");
      const hasValidUserKey = effectiveKey && isProbablyGeminiApiKey(effectiveKey);
      const headers = {};
      if (hasValidUserKey) {
        headers["x-gemini-api-key"] = effectiveKey;
      } else if (enteredKey) {
        setStatus("Entered API key format looks invalid. Falling back to backend key (.env) if available.", "error");
      }

      if (savedOpenRouterKey && isProbablyOpenRouterApiKey(savedOpenRouterKey)) {
        headers["x-openrouter-api-key"] = savedOpenRouterKey;
      }

      const apiBase = await resolveApiBaseUrl();
      const analyzeUrl = `${apiBase}/analyze`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(analyzeUrl, {
        method: "POST",
        headers,
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errPayload = await parseErrorResponse(response);

        // If user-provided key is invalid, automatically retry once without it
        // so backend .env key can still be used.
        if (
          hasValidUserKey &&
          /API_KEY_INVALID|API key not valid|Invalid Gemini API key/i.test(errPayload.rawMessage)
        ) {
          showToast("User API key rejected. Retrying with backend key...");
          localStorage.removeItem(API_KEY_STORAGE);
          setApiKeyState(false);
          if (el.geminiApiKey) el.geminiApiKey.value = "";

          const fallbackResponse = await fetch(analyzeUrl, {
            method: "POST",
            body: formData,
            signal: controller.signal,
          });

          if (!fallbackResponse.ok) {
            const fallbackErr = await parseErrorResponse(fallbackResponse);
            throw new Error(mapFriendlyError(fallbackErr.rawMessage, fallbackErr.status));
          }

          let fallbackData;
          try {
            fallbackData = await fallbackResponse.json();
          } catch (_jsonError) {
            throw new Error("Server error: Invalid JSON response from backend.");
          }
          if (!fallbackData || typeof fallbackData !== "object") {
            throw new Error("Invalid API response format.");
          }

          await renderResults(fallbackData);
          state.resultData = {
            raw: fallbackData.raw || "",
            analysis: fallbackData.analysis || "",
            corrected: fallbackData.corrected || "",
            createdAt: new Date().toISOString(),
          };
          el.saveResultsBtn.disabled = false;
          setStatus("Analysis complete using backend key.", "ok");
          hideErrorBanner();
          if (!silent) showToast("Results updated.");
          stopFakeProgress(true);
          switchTab("raw");
          return;
        }

        throw new Error(mapFriendlyError(errPayload.rawMessage, errPayload.status));
      }

      let data;
      try {
        data = await response.json();
      } catch (_jsonError) {
        throw new Error("Server error: Invalid JSON response from backend.");
      }
      if (!data || typeof data !== "object") {
        throw new Error("Invalid API response format.");
      }

      await renderResults(data);
      state.resultData = {
        raw: data.raw || "",
        analysis: data.analysis || "",
        corrected: data.corrected || "",
        createdAt: new Date().toISOString(),
      };
      el.saveResultsBtn.disabled = false;
      setStatus("Analysis complete.", "ok");
      if (!silent) showToast("Results updated.");
      stopFakeProgress(true);
      switchTab("raw");
    } catch (error) {
      stopFakeProgress(false);
      let friendlyMessage = "Network issue: Unable to reach backend service.";
      if (error?.name === "AbortError") {
        friendlyMessage = "Server error: Request timed out. Please try again.";
      } else if (error instanceof TypeError) {
        friendlyMessage = "Network issue: Could not connect to backend.";
      } else if (error?.message) {
        friendlyMessage = error.message;
      }

      showErrorBanner(friendlyMessage);
      setStatus(friendlyMessage, "error");
      if (!silent) showToast("Analysis failed. See error details.");
    } finally {
      setAnalyzing(false);
    }
  }

  function exportResults() {
    if (!state.resultData) return;
    const blob = new Blob([JSON.stringify(state.resultData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dyslexaread-results-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function setupDnD() {
    if (!el.dropZone) return;

    ["dragenter", "dragover"].forEach((eventName) => {
      el.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        el.dropZone.classList.add("is-dragging");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      el.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        el.dropZone.classList.remove("is-dragging");
      });
    });

    el.dropZone.addEventListener("drop", (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (file && file.type.startsWith("image/")) {
        setSelectedFile(file);
      }
    });

    el.dropZone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        el.fileInput.click();
      }
    });
  }

  function setupEvents() {
    el.uploadBtn.addEventListener("click", () => el.fileInput.click());

    el.fileInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) setSelectedFile(file);
    });

    el.startCameraBtn.addEventListener("click", startCamera);
    if (el.liveModeBtn) {
      el.liveModeBtn.addEventListener("click", () => {
        if (!state.stream) return;
        if (state.autoCaptureTimer) {
          stopAutoCaptureLoop();
          setStatus("Live mode stopped. Camera is still active.", "ok");
          showToast("Live mode paused.");
          return;
        }

        startAutoCaptureLoop();
        setStatus("Live mode resumed. Auto-analyzing every 5s.", "ok");
        showToast("Live mode resumed.");
      });
    }
    el.stopCameraBtn.addEventListener("click", () => {
      stopCamera();
      setStatus("Camera stopped.");
    });
    el.captureBtn.addEventListener("click", captureSnapshot);
    el.analyzeBtn.addEventListener("click", analyzeImage);
    if (el.retryAnalyzeBtn) {
      el.retryAnalyzeBtn.addEventListener("click", analyzeImage);
    }

    el.saveResultsBtn.addEventListener("click", () => {
      persistResults();
      exportResults();
    });

    if (el.themeToggleBtn) {
      el.themeToggleBtn.addEventListener("click", toggleTheme);
    }

    if (el.saveApiKeyBtn && el.geminiApiKey) {
      el.saveApiKeyBtn.addEventListener("click", () => {
        const key = sanitizeApiKey(el.geminiApiKey.value || "");
        if (!key) {
          localStorage.removeItem(API_KEY_STORAGE);
          setApiKeyState(false);
          setStatus("Saved key cleared. Backend .env key will be used if configured.");
          showToast("API key cleared.");
          return;
        }

        if (!isProbablyGeminiApiKey(key)) {
          setApiKeyState(false);
          setStatus("Invalid Gemini API key format. Remove quotes/spaces and try again.", "error");
          showToast("Invalid key format.");
          return;
        }

        localStorage.setItem(API_KEY_STORAGE, key);
        setApiKeyState(true);
        setStatus("Gemini API key saved for this browser.", "ok");
        showToast("API key saved.");
      });
    }

    if (el.toggleApiKeyBtn && el.geminiApiKey) {
      el.toggleApiKeyBtn.addEventListener("click", () => {
        const show = el.geminiApiKey.type === "password";
        el.geminiApiKey.type = show ? "text" : "password";
        el.toggleApiKeyBtn.textContent = show ? "Hide" : "Show";
      });
    }

    el.tabs.forEach((tab) => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });

    window.addEventListener("beforeunload", stopCamera);
  }

  setupDnD();
  setupEvents();

  const savedTheme = localStorage.getItem(THEME_STORAGE) || "light";
  applyTheme(savedTheme);

  const storedApiKey = localStorage.getItem(API_KEY_STORAGE);
  if (storedApiKey && el.geminiApiKey) {
    const cleanStoredKey = sanitizeApiKey(storedApiKey);
    if (isProbablyGeminiApiKey(cleanStoredKey)) {
      el.geminiApiKey.value = cleanStoredKey;
      setApiKeyState(true);
    } else {
      localStorage.removeItem(API_KEY_STORAGE);
      setApiKeyState(false);
    }
  } else {
    setApiKeyState(false);
  }

  loadPersistedResults();
  setAnalyzing(false);
  updateLiveModeButton();
})();
