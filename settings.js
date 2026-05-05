(() => {
  const GEMINI_API_KEY_STORAGE = "dyslexaread:geminiApiKey";
  const OPENROUTER_API_KEY_STORAGE = "dyslexaread:openrouterApiKey";
  const THEME_STORAGE = "dyslexaread:theme";
  const SAVED_RESULTS_STORAGE = "savedDyslexiaResults";

  const el = {
    geminiApiKey: document.getElementById("geminiApiKey"),
    saveApiKeyBtn: document.getElementById("saveApiKeyBtn"),
    toggleApiKeyBtn: document.getElementById("toggleApiKeyBtn"),
    apiKeyState: document.getElementById("apiKeyState"),
    openRouterApiKey: document.getElementById("openRouterApiKey"),
    saveOpenRouterApiKeyBtn: document.getElementById("saveOpenRouterApiKeyBtn"),
    toggleOpenRouterApiKeyBtn: document.getElementById("toggleOpenRouterApiKeyBtn"),
    openRouterApiKeyState: document.getElementById("openRouterApiKeyState"),
    settingsStatus: document.getElementById("settingsStatus"),
    settingsTabs: Array.from(document.querySelectorAll(".settings-tab")),
    settingsPanes: Array.from(document.querySelectorAll(".settings-pane")),
    clearAllKeysBtn: document.getElementById("clearAllKeysBtn"),
    savedGeminiValue: document.getElementById("savedGeminiValue"),
    savedOpenRouterValue: document.getElementById("savedOpenRouterValue"),
    savedThemeValue: document.getElementById("savedThemeValue"),
    savedResultsList: document.getElementById("savedResultsList"),
    savedResultsEmpty: document.getElementById("savedResultsEmpty"),
    toast: document.getElementById("toast"),
  };

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

  function setStatus(message, mode = "") {
    if (!el.settingsStatus) return;
    el.settingsStatus.textContent = message;
    el.settingsStatus.className = `status-text ${mode}`.trim();
  }

  function switchSection(section) {
    el.settingsTabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.settingsTab === section);
    });

    el.settingsPanes.forEach((pane) => {
      const active = pane.dataset.settingsPanel === section;
      pane.classList.toggle("is-active", active);
      pane.hidden = !active;
    });
  }

  function renderSavedSummary() {
    if (el.savedGeminiValue) {
      const gemini = sanitizeApiKey(localStorage.getItem(GEMINI_API_KEY_STORAGE) || "");
      el.savedGeminiValue.textContent = gemini ? "Saved" : "Not Saved";
    }

    if (el.savedOpenRouterValue) {
      const openRouter = sanitizeApiKey(localStorage.getItem(OPENROUTER_API_KEY_STORAGE) || "");
      el.savedOpenRouterValue.textContent = openRouter ? "Saved" : "Not Saved";
    }

    if (el.savedThemeValue) {
      el.savedThemeValue.textContent = localStorage.getItem(THEME_STORAGE) === "dark" ? "Dark" : "Light";
    }
  }

  function renderSavedResults() {
    if (!el.savedResultsList || !el.savedResultsEmpty) return;

    const saved = JSON.parse(localStorage.getItem(SAVED_RESULTS_STORAGE) || "[]");
    el.savedResultsList.innerHTML = "";

    if (!Array.isArray(saved) || saved.length === 0) {
      el.savedResultsEmpty.style.display = "block";
      return;
    }

    el.savedResultsEmpty.style.display = "none";
    saved.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "saved-result-card";

      const title = document.createElement("div");
      title.className = "saved-result-title";
      const createdAt = item?.createdAt ? new Date(item.createdAt) : null;
      title.textContent = createdAt && !Number.isNaN(createdAt.getTime())
        ? createdAt.toLocaleString()
        : `Saved Result ${index + 1}`;

      const preview = document.createElement("div");
      preview.className = "saved-result-preview";
      const previewText = (item?.raw || item?.analysis || item?.corrected || "").trim();
      preview.textContent = previewText ? previewText.slice(0, 140) : "(empty)";

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-secondary saved-result-delete";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        const next = saved.filter((_, i) => i !== index);
        localStorage.setItem(SAVED_RESULTS_STORAGE, JSON.stringify(next));
        renderSavedResults();
        showToast("Saved result deleted.");
      });

      card.appendChild(title);
      card.appendChild(preview);
      card.appendChild(deleteBtn);
      el.savedResultsList.appendChild(card);
    });
  }

  function setApiKeyState(saved) {
    if (!el.apiKeyState) return;
    el.apiKeyState.textContent = saved ? "Saved" : "Not Saved";
    el.apiKeyState.classList.toggle("is-saved", saved);
  }

  function setOpenRouterApiKeyState(saved) {
    if (!el.openRouterApiKeyState) return;
    el.openRouterApiKeyState.textContent = saved ? "Saved" : "Not Saved";
    el.openRouterApiKeyState.classList.toggle("is-saved", saved);
  }

  function showToast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.add("show");
    setTimeout(() => el.toast.classList.remove("show"), 2200);
  }

  function applyTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE) === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
  }


  function loadSavedKeys() {
    const stored = sanitizeApiKey(localStorage.getItem(GEMINI_API_KEY_STORAGE) || "");
    if (stored && isProbablyGeminiApiKey(stored)) {
      if (el.geminiApiKey) el.geminiApiKey.value = stored;
      setApiKeyState(true);
    } else {
      if (stored) {
        localStorage.removeItem(GEMINI_API_KEY_STORAGE);
      }
      setApiKeyState(false);
    }

    const storedOpenRouter = sanitizeApiKey(localStorage.getItem(OPENROUTER_API_KEY_STORAGE) || "");
    if (storedOpenRouter && isProbablyOpenRouterApiKey(storedOpenRouter)) {
      if (el.openRouterApiKey) el.openRouterApiKey.value = storedOpenRouter;
      setOpenRouterApiKeyState(true);
    } else {
      if (storedOpenRouter) {
        localStorage.removeItem(OPENROUTER_API_KEY_STORAGE);
      }
      setOpenRouterApiKeyState(false);
    }

    if (stored && isProbablyGeminiApiKey(stored)) {
      setStatus("Gemini API key is saved in this browser.", "ok");
      return;
    }

    if (storedOpenRouter && isProbablyOpenRouterApiKey(storedOpenRouter)) {
      setStatus("OpenRouter API key is saved in this browser.", "ok");
      renderSavedSummary();
      return;
    }

    setStatus("No valid API keys are currently saved.");
    renderSavedSummary();
  }

  function setupEvents() {
    if (el.saveApiKeyBtn && el.geminiApiKey) {
      el.saveApiKeyBtn.addEventListener("click", () => {
        const key = sanitizeApiKey(el.geminiApiKey.value || "");

        if (!key) {
          localStorage.removeItem(GEMINI_API_KEY_STORAGE);
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

        localStorage.setItem(GEMINI_API_KEY_STORAGE, key);
        setApiKeyState(true);
        setStatus("Gemini API key saved for this browser.", "ok");
        showToast("API key saved.");
        renderSavedSummary();
      });
    }

    if (el.toggleApiKeyBtn && el.geminiApiKey) {
      el.toggleApiKeyBtn.addEventListener("click", () => {
        const show = el.geminiApiKey.type === "password";
        el.geminiApiKey.type = show ? "text" : "password";
        el.toggleApiKeyBtn.textContent = show ? "Hide" : "Show";
      });
    }

    if (el.saveOpenRouterApiKeyBtn && el.openRouterApiKey) {
      el.saveOpenRouterApiKeyBtn.addEventListener("click", () => {
        const key = sanitizeApiKey(el.openRouterApiKey.value || "");

        if (!key) {
          localStorage.removeItem(OPENROUTER_API_KEY_STORAGE);
          setOpenRouterApiKeyState(false);
          setStatus("OpenRouter API key cleared.");
          showToast("OpenRouter key cleared.");
          return;
        }

        if (!isProbablyOpenRouterApiKey(key)) {
          setOpenRouterApiKeyState(false);
          setStatus("Invalid OpenRouter API key format. It should start with sk-or-v1-", "error");
          showToast("Invalid OpenRouter key format.");
          return;
        }

        localStorage.setItem(OPENROUTER_API_KEY_STORAGE, key);
        setOpenRouterApiKeyState(true);
        setStatus("OpenRouter API key saved for this browser.", "ok");
        showToast("OpenRouter key saved.");
        renderSavedSummary();
      });
    }

    if (el.toggleOpenRouterApiKeyBtn && el.openRouterApiKey) {
      el.toggleOpenRouterApiKeyBtn.addEventListener("click", () => {
        const show = el.openRouterApiKey.type === "password";
        el.openRouterApiKey.type = show ? "text" : "password";
        el.toggleOpenRouterApiKeyBtn.textContent = show ? "Hide" : "Show";
      });
    }

    if (el.clearAllKeysBtn) {
      el.clearAllKeysBtn.addEventListener("click", () => {
        localStorage.removeItem(GEMINI_API_KEY_STORAGE);
        localStorage.removeItem(OPENROUTER_API_KEY_STORAGE);
        if (el.geminiApiKey) el.geminiApiKey.value = "";
        if (el.openRouterApiKey) el.openRouterApiKey.value = "";

        setApiKeyState(false);
        setOpenRouterApiKeyState(false);
        setStatus("Account data removed from this browser profile.", "ok");
        showToast("Account deleted from local profile.");
        renderSavedSummary();
      });
    }


    el.settingsTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        switchSection(tab.dataset.settingsTab || "profile");
      });
    });
  }

  applyTheme();
  loadSavedKeys();
  renderSavedResults();
  setupEvents();
})();
