(() => {
  const supabaseClient = window.supabaseClient;
  const state = {
    selectedFile: null,
    stream: null,
    autoCaptureTimer: null,
    progressTimer: null,
    resultData: null,
    selectedImageDataUrl: "",
    selectedImageWidth: 0,
    selectedImageHeight: 0,
    activeRequestAbort: null,
    isAnalyzing: false,
  };

  const el = {
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
    clearSelectedImageBtn: document.getElementById("clearSelectedImageBtn"),
    captureCanvas: document.getElementById("captureCanvas"),
    analyzeBtn: document.getElementById("analyzeBtn"),
    loadingIndicator: document.getElementById("loadingIndicator"),
    progressBar: document.getElementById("progressBar"),
    statusText: document.getElementById("statusText"),
    themeToggleBtn: document.getElementById("themeToggleBtn"),
    logoutBtn: document.getElementById("logoutBtn"),
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
    recentHistoryGrid: document.getElementById("recentHistoryGrid"),
    toast: document.getElementById("toast"),
  };

  const OPENROUTER_API_KEY_STORAGE = "dyslexaread:openrouterApiKey";
  const THEME_STORAGE = "dyslexaread:theme";
  const API_BASE =
    window.location.hostname === "localhost"
      ? "http://127.0.0.1:8000"
      : "https://dyslexia-assistant.onrender.com";
  const LAST_REPORT_STORAGE = "dyslexaread:lastReport";
  const SAVED_RESULTS_STORAGE = "savedDyslexiaResults";
  const REQUEST_TIMEOUT_MS = 120000;
  const MAX_SAVED_REPORTS = 25;

  localStorage.removeItem("dyslexaread:geminiApiKey");

  const recentHistory = [];

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

  function isProbablyOpenRouterApiKey(value) {
    return /^sk-or-v1-[\w-]{20,}$/.test(value);
  }

  function showToast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.add("show");
    setTimeout(() => el.toast.classList.remove("show"), 2400);
  }

  async function ensureAuthenticated() {
    if (!supabaseClient) return;
    const { data } = await supabaseClient.auth.getSession();
    if (!data?.session) {
      window.location.href = "auth.html";
    }
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
      return "OpenRouter credits are insufficient. Add credits in OpenRouter and try again.";
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
    if (el.loadingIndicator) {
      el.loadingIndicator.hidden = !isAnalyzing;
      el.loadingIndicator.style.display = isAnalyzing ? "inline-flex" : "none";
    }
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

  function normalizeResultData(data) {
    return {
      id: data.id || `result-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      raw: typeof data.raw === "string" ? data.raw : "",
      analysis: typeof data.analysis === "string" ? data.analysis : "",
      corrected: typeof data.corrected === "string" ? data.corrected : "",
      createdAt: data.createdAt || new Date().toISOString(),
      originalImageDataUrl: data.originalImageDataUrl || "",
      originalWidth: data.originalWidth || 0,
      originalHeight: data.originalHeight || 0,
    };
  }

  function addToRecentHistory(result) {
    const normalized = normalizeResultData(result);
    recentHistory.push(normalized);
    while (recentHistory.length > 8) {
      recentHistory.shift();
    }
    renderRecentHistory();
  }

  function removeFromRecentHistory(resultId) {
    const index = recentHistory.findIndex((item) => item.id === resultId);
    if (index === -1) return;
    recentHistory.splice(index, 1);
    renderRecentHistory();
  }

  function saveResultToProfile(result) {
    const normalized = normalizeResultData(result);
    saveReportFromResult(normalized).catch(() => {
      showToast("Saved locally. Supabase upload failed.");
    });
  }

  async function saveReportFromResult(result) {
    if (!result) return;
    const corrected = result.corrected || "";
    const originalImage = result.originalImageDataUrl || "";
    const originalWidth = result.originalWidth || 0;
    const originalHeight = result.originalHeight || 0;
    const correctedImage = buildCorrectedImageDataUrl(corrected, originalWidth, originalHeight);
    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) {
      showToast("PDF export unavailable. Please refresh and try again.");
      return;
    }

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    const gap = 20;
    const columnWidth = (pageWidth - margin * 2 - gap) / 2;
    const imageBoxHeight = 260;
    const startY = 70;

    doc.setFont("courier", "normal");
    doc.setFontSize(16);
    doc.text("DyslexaRead Corrected Text", margin, 40);

    const originalDims = getImageDimensions(originalWidth, originalHeight);
    const correctedDims = getImageDimensions(originalWidth, originalHeight);

    const leftBox = { x: margin, y: startY, w: columnWidth, h: imageBoxHeight };
    const rightBox = { x: margin + columnWidth + gap, y: startY, w: columnWidth, h: imageBoxHeight };

    doc.setFontSize(12);
    doc.text("Original Image", leftBox.x, leftBox.y - 10);
    doc.text("Corrected Image", rightBox.x, rightBox.y - 10);

    drawImageOrPlaceholder(doc, originalImage, leftBox, originalDims);
    drawImageOrPlaceholder(doc, correctedImage, rightBox, correctedDims);

    const textStartY = startY + imageBoxHeight + 30;
    const maxTextWidth = pageWidth - margin * 2;
    doc.setFontSize(12);
    const lines = doc.splitTextToSize(corrected || "", maxTextWidth);
    doc.text(lines, margin, textStartY, { maxWidth: maxTextWidth });

    const pdfBlob = doc.output("blob");
    if (supabaseClient) {
      await saveReportToSupabase(pdfBlob, originalImage);
      removeFromRecentHistory(result.id);
      showToast("Saved to profile.");
    }
  }

  function renderRecentHistory() {
    if (!el.recentHistoryGrid) return;
    el.recentHistoryGrid.innerHTML = "";
    if (!recentHistory.length) return;

    recentHistory.slice().reverse().forEach((item) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "recent-card";
      card.setAttribute("role", "listitem");

      const title = document.createElement("div");
      title.className = "recent-card-title";
      title.textContent = new Date(item.createdAt).toLocaleString();

      const preview = document.createElement("div");
      preview.className = "recent-card-preview";
      preview.textContent = (item.raw || item.analysis || item.corrected || "(empty)").slice(0, 90);

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn btn-secondary recent-save-btn";
      saveBtn.textContent = "Save to Profile";
      saveBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        saveResultToProfile(item);
      });

      card.addEventListener("click", () => {
        state.resultData = { ...item };
        renderResults(item);
        el.saveResultsBtn.disabled = false;
        setStatus("Loaded recent result.", "ok");
        switchTab("raw");
      });

      card.appendChild(title);
      card.appendChild(preview);
      card.appendChild(saveBtn);
      el.recentHistoryGrid.appendChild(card);
    });
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
    state.selectedImageDataUrl = "";
    state.selectedImageWidth = 0;
    state.selectedImageHeight = 0;
    setAnalyzing(false);

    if (!file) {
      el.imagePreview.style.display = "none";
      el.imagePreview.src = "";
      el.previewPlaceholder.style.display = "grid";
      if (el.clearSelectedImageBtn) {
        el.clearSelectedImageBtn.disabled = true;
      }
      el.rawContent.textContent = "No image selected.";
      el.analysisContent.textContent = "No image selected.";
      el.correctedContent.textContent = "No image selected.";
      el.saveResultsBtn.disabled = true;
      state.resultData = null;
      setStatus("Ready to analyze.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        state.selectedImageDataUrl = reader.result;
      }
    };
    reader.readAsDataURL(file);

    const url = URL.createObjectURL(file);
    el.imagePreview.src = url;
    el.imagePreview.style.display = "block";
    el.previewPlaceholder.style.display = "none";
    if (el.clearSelectedImageBtn) {
      el.clearSelectedImageBtn.disabled = false;
    }
    setStatus(`Image ready: ${file.name}`);

    el.imagePreview.onload = () => {
      state.selectedImageWidth = el.imagePreview.naturalWidth || 0;
      state.selectedImageHeight = el.imagePreview.naturalHeight || 0;
    };
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
    if (state.activeRequestAbort) {
      state.activeRequestAbort.abort();
      state.activeRequestAbort = null;
    }
    setAnalyzing(false);
    stopFakeProgress(false);
    updateLiveModeButton();
  }

  async function captureAndAnalyzeFrame() {
    if (!state.stream || state.isAnalyzing) return;
    const video = el.cameraPreview;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

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
    }, 10000);
    updateLiveModeButton();
  }

  async function waitForVideoReady(video, timeoutMs = 4000) {
    const start = Date.now();
    return new Promise((resolve) => {
      function check() {
        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
          resolve(true);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          resolve(false);
          return;
        }
        requestAnimationFrame(check);
      }
      check();
    });
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

    return "Unable to access camera. Check permissions and use a secure origin.";
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("Camera not supported in this browser.", "error");
      return;
    }

    const host = window.location.hostname;
    const isLocalhost = host === "localhost" || host === "127.0.0.1";
    if (!window.isSecureContext && !isLocalhost) {
      setStatus("Camera requires HTTPS. Open this site over a secure origin.", "error");
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
      let ready = false;
      for (const constraints of constraintCandidates) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          state.stream = stream;
          el.cameraPreview.srcObject = state.stream;
          el.cameraPreview.style.display = "block";
          el.cameraPreview.muted = true;
          el.cameraPreview.playsInline = true;
          try {
            await el.cameraPreview.play();
          } catch (_playError) {
            // Some browsers auto-play after metadata; ignore explicit play failure here.
          }

          ready = await waitForVideoReady(el.cameraPreview, 5000);
          if (ready) {
            break;
          }

          stream.getTracks().forEach((track) => track.stop());
          state.stream = null;
          el.cameraPreview.srcObject = null;
        } catch (error) {
          lastError = error;
        }
      }

      if (!stream || !ready) {
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
        throw lastError || new Error("Could not start camera stream");
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
      showToast("Live camera started. Auto-analyzing every 10s.");
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
    if (!fileToAnalyze || state.isAnalyzing) {
      if (!fileToAnalyze) {
        setAnalyzing(false);
        stopFakeProgress(false);
      }
      return;
    }

    setAnalyzing(true);
    startFakeProgress();
    setStatus(source === "live-camera" ? "Live capture: Processing frame with AI..." : "Processing image with AI...");
    hideErrorBanner();

    try {
      const formData = new FormData();
      const compressed = await compressImageFile(fileToAnalyze);
      formData.append("file", compressed);

      const savedOpenRouterKey = sanitizeApiKey(localStorage.getItem(OPENROUTER_API_KEY_STORAGE) || "");
      const headers = {};

      if (savedOpenRouterKey && isProbablyOpenRouterApiKey(savedOpenRouterKey)) {
        headers["x-openrouter-api-key"] = savedOpenRouterKey;
      }

      const controller = new AbortController();
      state.activeRequestAbort = controller;
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers,
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      state.activeRequestAbort = null;

      if (!response.ok) {
        const errPayload = await parseErrorResponse(response);

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
      const originalInfo = await getOriginalImageInfo();
      state.resultData = normalizeResultData({
        raw: data.raw || "",
        analysis: data.analysis || "",
        corrected: data.corrected || "",
        createdAt: new Date().toISOString(),
        originalImageDataUrl: originalInfo.dataUrl || "",
        originalWidth: originalInfo.width || 0,
        originalHeight: originalInfo.height || 0,
      });
      addToRecentHistory(state.resultData);
      await storeLatestReportData(state.resultData);
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
      state.activeRequestAbort = null;
      setAnalyzing(false);
    }
  }

  async function exportResults() {
    if (!state.resultData) return;
    const corrected = state.resultData.corrected || "";
    const originalInfo = await getOriginalImageInfo();
    const originalImage = originalInfo.dataUrl;
    const correctedImage = buildCorrectedImageDataUrl(
      corrected,
      originalInfo.width,
      originalInfo.height,
    );
    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) {
      showToast("PDF export unavailable. Please refresh and try again.");
      return;
    }

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const gap = 20;
    const columnWidth = (pageWidth - margin * 2 - gap) / 2;
    const imageBoxHeight = 260;
    const startY = 70;

    doc.setFont("courier", "normal");
    doc.setFontSize(16);
    doc.text("DyslexaRead Corrected Text", margin, 40);

    const originalDims = getImageDimensions(originalInfo.width, originalInfo.height);
    const correctedDims = getImageDimensions(originalInfo.width, originalInfo.height);

    const leftBox = { x: margin, y: startY, w: columnWidth, h: imageBoxHeight };
    const rightBox = { x: margin + columnWidth + gap, y: startY, w: columnWidth, h: imageBoxHeight };

    doc.setFontSize(12);
    doc.text("Original Image", leftBox.x, leftBox.y - 10);
    doc.text("Corrected Image", rightBox.x, rightBox.y - 10);

    drawImageOrPlaceholder(doc, originalImage, leftBox, originalDims);
    drawImageOrPlaceholder(doc, correctedImage, rightBox, correctedDims);

    const textStartY = startY + imageBoxHeight + 30;
    const maxTextWidth = pageWidth - margin * 2;
    doc.setFontSize(12);
    const lines = doc.splitTextToSize(corrected || "", maxTextWidth);
    doc.text(lines, margin, textStartY, { maxWidth: maxTextWidth });

    const pdfBlob = doc.output("blob");
    doc.save(`dyslexaread-corrected-${Date.now()}.pdf`);
    if (supabaseClient) {
      saveReportToSupabase(pdfBlob, originalImage).catch(() => {
        showToast("Saved locally. Supabase upload failed.");
      });
    }
  }

  async function storeLatestReportData(resultData) {
    if (!resultData) return;
    const originalInfo = await getOriginalImageInfo();
    const payload = {
      raw: resultData.raw || "",
      analysis: resultData.analysis || "",
      corrected: resultData.corrected || "",
      createdAt: resultData.createdAt || new Date().toISOString(),
      originalImageDataUrl: originalInfo.dataUrl || "",
      originalWidth: originalInfo.width || 0,
      originalHeight: originalInfo.height || 0,
    };
    localStorage.setItem(LAST_REPORT_STORAGE, JSON.stringify(payload));
  }

  function dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(",");
    if (parts.length < 2) return null;
    const match = parts[0].match(/data:(.*);base64/);
    if (!match) return null;
    const mime = match[1];
    const binary = atob(parts[1]);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
  }

  async function saveReportToSupabase(pdfBlob, originalImageDataUrl) {
    const { data } = await supabaseClient.auth.getSession();
    const session = data?.session;
    if (!session) {
      showToast("Sign in to save reports to profile.");
      return;
    }

    const userId = session.user.id;
    const { count } = await supabaseClient
      .from("saved_reports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (count !== null && count >= MAX_SAVED_REPORTS) {
      showToast("Profile already has 25 saved reports.");
      return;
    }

    const timestamp = Date.now();
    const pdfPath = `${userId}/${timestamp}.pdf`;
    const pdfUpload = await supabaseClient
      .storage
      .from("reports")
      .upload(pdfPath, pdfBlob, { contentType: "application/pdf" });
    if (pdfUpload.error) throw pdfUpload.error;

    let originalPath = null;
    if (originalImageDataUrl) {
      const blob = dataUrlToBlob(originalImageDataUrl);
      if (blob) {
        const ext = blob.type.split("/")[1] || "png";
        const imagePath = `${userId}/${timestamp}.${ext}`;
        const imgUpload = await supabaseClient
          .storage
          .from("originals")
          .upload(imagePath, blob, { contentType: blob.type });
        if (!imgUpload.error) {
          originalPath = imagePath;
        }
      }
    }
    await supabaseClient.from("saved_reports").insert({
      user_id: userId,
      pdf_url: pdfPath,
      original_image_url: originalPath,
    });
    showToast("Saved to profile.");
  }

  function getImageDimensions(width, height) {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (w > 0 && h > 0) return { width: w, height: h };
    return { width: 4, height: 3 };
  }

  function fitToBox(srcWidth, srcHeight, boxWidth, boxHeight) {
    const ratio = Math.min(boxWidth / srcWidth, boxHeight / srcHeight);
    return {
      width: srcWidth * ratio,
      height: srcHeight * ratio,
    };
  }

  function drawImageOrPlaceholder(doc, dataUrl, box, dims) {
    if (!dataUrl) {
      doc.setDrawColor(180);
      doc.rect(box.x, box.y, box.w, box.h);
      doc.setTextColor(120);
      doc.setFontSize(10);
      doc.text("Image unavailable", box.x + 10, box.y + 20);
      doc.setTextColor(0);
      return;
    }

    const fit = fitToBox(dims.width, dims.height, box.w, box.h);
    const x = box.x + (box.w - fit.width) / 2;
    const y = box.y + (box.h - fit.height) / 2;
    doc.addImage(dataUrl, "PNG", x, y, fit.width, fit.height);
    doc.setDrawColor(220);
    doc.rect(box.x, box.y, box.w, box.h);
  }

  function buildNotepadReportHtml({ corrected, originalImage, correctedImage }) {
    const originalBlock = originalImage
      ? `<img src="${originalImage}" alt="Original handwriting" />`
      : `<div class="placeholder">Original image unavailable.</div>`;
    const correctedBlock = correctedImage
      ? `<img src="${correctedImage}" alt="Corrected text" />`
      : `<div class="placeholder">Corrected image unavailable.</div>`;

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DyslexaRead Corrected Report</title>
  <style>
    body { font-family: "Courier New", monospace; color: #111; background: #fff; margin: 24px; }
    h1 { font-size: 18px; margin: 0 0 16px; }
    .row { display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-start; }
    .panel { border: 1px solid #ddd; padding: 12px; }
    .panel h2 { font-size: 14px; margin: 0 0 8px; }
    img { max-width: 360px; height: auto; display: block; }
    pre { white-space: pre-wrap; line-height: 1.4; margin-top: 16px; }
    .placeholder { width: 360px; min-height: 120px; display: grid; place-items: center; color: #666; border: 1px dashed #aaa; }
  </style>
</head>
<body>
  <h1>DyslexaRead Corrected Text</h1>
  <div class="row">
    <div class="panel">
      <h2>Original Image</h2>
      ${originalBlock}
    </div>
    <div class="panel">
      <h2>Corrected Image</h2>
      ${correctedBlock}
    </div>
  </div>
  <pre>${escapeHtml(corrected || "")}</pre>
</body>
</html>`;
  }

  function buildCorrectedImageDataUrl(text, width, height) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    const padding = Math.max(20, Math.round((Math.min(width, height) || 360) * 0.06));
    const targetWidth = Math.max(360, Number(width) || 0) || 720;
    const targetHeight = Math.max(240, Number(height) || 0) || 360;
    const maxWidth = Math.max(180, targetWidth - padding * 2);

    let fontSize = Math.max(18, Math.min(48, Math.round(targetHeight * 0.06)));
    let lineHeight = 22;
    let lines = [];
    let attempts = 0;
    while (attempts < 12) {
      ctx.font = `${fontSize}px Courier New`;
      lines = wrapTextLines(ctx, text, maxWidth);
      lineHeight = Math.round(fontSize * 1.35);
      if (lines.length * lineHeight <= targetHeight - padding * 2) {
        break;
      }
      fontSize -= 1;
      attempts += 1;
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111111";
    ctx.font = `${fontSize}px Courier New`;

    const maxLines = Math.floor((targetHeight - padding * 2) / lineHeight) || lines.length;
    lines.slice(0, maxLines).forEach((line, index) => {
      ctx.fillText(line, padding, padding + (index + 1) * lineHeight - 4);
    });

    return canvas.toDataURL("image/png");
  }

  function wrapTextLines(ctx, text, maxWidth) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";

    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    });

    if (current) lines.push(current);
    if (lines.length === 0) lines.push("");
    return lines;
  }

  async function getOriginalImageInfo() {
    if (state.selectedImageDataUrl) {
      return {
        dataUrl: state.selectedImageDataUrl,
        width: state.selectedImageWidth,
        height: state.selectedImageHeight,
      };
    }

    if (el.imagePreview && el.imagePreview.src) {
      const img = await loadImage(el.imagePreview.src);
      if (img) {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width || 0;
        canvas.height = img.naturalHeight || img.height || 0;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return {
            dataUrl: canvas.toDataURL("image/png"),
            width: canvas.width,
            height: canvas.height,
          };
        }
      }
    }

    return { dataUrl: "", width: 0, height: 0 };
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

    if (el.clearSelectedImageBtn) {
      el.clearSelectedImageBtn.addEventListener("click", () => {
        setSelectedFile(null);
      });
    }

    el.saveResultsBtn.addEventListener("click", () => {
      persistResults();
      exportResults();
    });

    if (el.themeToggleBtn) {
      el.themeToggleBtn.addEventListener("click", toggleTheme);
    }

    if (el.logoutBtn) {
      el.logoutBtn.addEventListener("click", async () => {
        if (el.logoutBtn) {
          el.logoutBtn.disabled = true;
        }

        try {
          if (supabaseClient) {
            await supabaseClient.auth.signOut();
          }
        } catch (_error) {
          // Always redirect even if sign out fails locally.
        } finally {
          window.location.href = "auth.html";
        }
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

  loadPersistedResults();
  ensureAuthenticated();
  if (el.loadingIndicator) {
    el.loadingIndicator.hidden = true;
    el.loadingIndicator.style.display = "none";
  }
  stopFakeProgress(false);
  setAnalyzing(false);
  updateLiveModeButton();
})();
