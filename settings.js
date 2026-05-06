(() => {
  const OPENROUTER_API_KEY_STORAGE = "dyslexaread:openrouterApiKey";
  const THEME_STORAGE = "dyslexaread:theme";

  localStorage.removeItem("dyslexaread:geminiApiKey");

  const el = {
    openRouterApiKey: document.getElementById("openRouterApiKey"),
    saveOpenRouterApiKeyBtn: document.getElementById("saveOpenRouterApiKeyBtn"),
    toggleOpenRouterApiKeyBtn: document.getElementById("toggleOpenRouterApiKeyBtn"),
    openRouterApiKeyState: document.getElementById("openRouterApiKeyState"),
    settingsStatus: document.getElementById("settingsStatus"),
    settingsTabs: Array.from(document.querySelectorAll(".settings-tab")),
    settingsPanes: Array.from(document.querySelectorAll(".settings-pane")),
    clearAllKeysBtn: document.getElementById("clearAllKeysBtn"),
    savedResultsList: document.getElementById("savedResultsList"),
    savedResultsEmpty: document.getElementById("savedResultsEmpty"),
    deleteInstruction: document.getElementById("deleteInstruction"),
    toast: document.getElementById("toast"),
    pdfPreviewModal: document.getElementById("pdfPreviewModal"),
    pdfPreviewFrame: document.getElementById("pdfPreviewFrame"),
    pdfPreviewClose: document.getElementById("pdfPreviewClose"),
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

  async function loadSavedResults() {
    if (!el.savedResultsList || !el.savedResultsEmpty) return;
    if (!client) return;

    const { data: sessionData } = await client.auth.getSession();
    const session = sessionData?.session;
    if (!session) {
      el.savedResultsEmpty.textContent = "Sign in to view saved results.";
      el.savedResultsEmpty.style.display = "block";
      el.savedResultsList.innerHTML = "";
      return;
    }

    const { data, error } = await client
      .from("saved_reports")
      .select("id, pdf_url, original_image_url, created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      el.savedResultsEmpty.textContent = "Unable to load saved results.";
      el.savedResultsEmpty.style.display = "block";
      el.savedResultsList.innerHTML = "";
      console.error("Saved results load failed:", error);
      return;
    }

    el.savedResultsList.innerHTML = "";
    if (!Array.isArray(data) || data.length === 0) {
      el.savedResultsEmpty.textContent = "No saved results yet.";
      el.savedResultsEmpty.style.display = "block";
      return;
    }

    el.savedResultsEmpty.style.display = "none";
    data.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "saved-result-card";

      const title = document.createElement("div");
      title.className = "saved-result-title";
      title.textContent = `Saved Result ${index + 1}`;

      const preview = document.createElement("div");
      preview.className = "saved-result-preview";
      preview.textContent = "PDF report available.";

      const actions = document.createElement("div");
      actions.className = "saved-result-actions";

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "btn btn-secondary saved-result-open";
      openBtn.textContent = "Open";
      openBtn.addEventListener("click", async () => {
        const stored = item?.pdf_url || "";
        const pdfPath = extractStoragePath(stored, "reports") || stored;
        if (!pdfPath) {
          showToast("Saved PDF not available.");
          return;
        }

        const { data: signed, error: signedError } = await client
          .storage
          .from("reports")
          .createSignedUrl(pdfPath, 60 * 10);

        if (signedError || !signed?.signedUrl) {
          showToast("Unable to open the saved PDF.");
          return;
        }

        openPdfPreview(signed.signedUrl);
      });

      const downloadBtn = document.createElement("button");
      downloadBtn.type = "button";
      downloadBtn.className = "btn btn-secondary saved-result-download";
      downloadBtn.textContent = "Download";
      downloadBtn.addEventListener("click", async () => {
        const stored = item?.pdf_url || "";
        const pdfPath = extractStoragePath(stored, "reports") || stored;
        if (!pdfPath) {
          showToast("Saved PDF not available.");
          return;
        }

        const { data: signed, error: signedError } = await client
          .storage
          .from("reports")
          .createSignedUrl(pdfPath, 60 * 10);

        if (signedError || !signed?.signedUrl) {
          showToast("Unable to download the saved PDF.");
          return;
        }

        const link = document.createElement("a");
        link.href = signed.signedUrl;
        link.download = pdfPath.split("/").pop() || "dyslexaread-report.pdf";
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-secondary saved-result-delete";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", async () => {
        if (item?.pdf_url) {
          const pdfPath = extractStoragePath(item.pdf_url, "reports") || item.pdf_url;
          if (pdfPath) {
            await client.storage.from("reports").remove([pdfPath]);
          }
        }
        if (item?.original_image_url) {
          const originalPath = extractStoragePath(item.original_image_url, "originals") || item.original_image_url;
          if (originalPath) {
            await client.storage.from("originals").remove([originalPath]);
          }
        }

        await client.from("saved_reports").delete().eq("id", item.id);
        await loadSavedResults();
        showToast("Saved result deleted.");
      });

      actions.appendChild(openBtn);
      actions.appendChild(downloadBtn);
      actions.appendChild(deleteBtn);
      card.appendChild(title);
      card.appendChild(preview);
      card.appendChild(actions);
      el.savedResultsList.appendChild(card);
    });
  }

  function setOpenRouterApiKeyState(saved) {
    if (!el.openRouterApiKeyState) return;
    el.openRouterApiKeyState.textContent = saved ? "Saved" : "Not Saved";
    el.openRouterApiKeyState.classList.toggle("is-saved", saved);
  }

  let client = null;

  function showToast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.add("show");
    setTimeout(() => el.toast.classList.remove("show"), 2200);
  }

  function openPdfPreview(url) {
    if (!el.pdfPreviewModal || !el.pdfPreviewFrame) return;
    el.pdfPreviewFrame.src = url;
    el.pdfPreviewModal.classList.add("is-open");
    el.pdfPreviewModal.setAttribute("aria-hidden", "false");
  }

  function closePdfPreview() {
    if (!el.pdfPreviewModal || !el.pdfPreviewFrame) return;
    el.pdfPreviewFrame.src = "";
    el.pdfPreviewModal.classList.remove("is-open");
    el.pdfPreviewModal.setAttribute("aria-hidden", "true");
  }

  function buildDeletePhrase(username) {
    return `I am deleting my account named ${username}`;
  }

  function applyTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE) === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
  }


  function loadSavedKeys() {
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

    if (storedOpenRouter && isProbablyOpenRouterApiKey(storedOpenRouter)) {
      setStatus("OpenRouter API key is saved in this browser.", "ok");
      return;
    }

    setStatus("No valid API keys are currently saved.");
  }

  function setupEvents() {
    if (el.pdfPreviewClose) {
      el.pdfPreviewClose.addEventListener("click", closePdfPreview);
    }

    if (el.pdfPreviewModal) {
      el.pdfPreviewModal.addEventListener("click", (event) => {
        if (event.target && event.target.hasAttribute("data-modal-close")) {
          closePdfPreview();
        }
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
      el.clearAllKeysBtn.addEventListener("click", async () => {
        if (!client) {
          setStatus("Supabase client not available.", "error");
          return;
        }

        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (sessionError || !sessionData?.session) {
          setStatus("You must be signed in to delete your account.", "error");
          return;
        }

        const userId = sessionData.session.user.id;
        const fallbackName = sessionData.session.user.email || "user";

        const avatarPaths = [];
        const reportPaths = [];
        const originalPaths = [];

        const { data: profileData } = await client
          .from("profiles")
          .select("avatar_url, username")
          .eq("user_id", userId)
          .maybeSingle();

        const username = profileData?.username || fallbackName;
        const deletePhrase = buildDeletePhrase(username);
        if (el.deleteInstruction) {
          el.deleteInstruction.textContent = deletePhrase;
        }
        const typed = window.prompt(`Type this to confirm:\n${deletePhrase}`, "");
        if (typed !== deletePhrase) {
          setStatus("Deletion canceled. Enter the exact phrase to continue.", "error");
          return;
        }

        setStatus("Deleting account...", "");

        if (profileData?.avatar_url) {
          const avatarPath = extractStoragePath(profileData.avatar_url, "avatars");
          if (avatarPath) avatarPaths.push(avatarPath);
        }

        const { data: reportsData } = await client
          .from("saved_reports")
          .select("pdf_url, original_image_url")
          .eq("user_id", userId);

        (reportsData || []).forEach((report) => {
          const pdfPath = extractStoragePath(report?.pdf_url, "reports");
          if (pdfPath) reportPaths.push(pdfPath);
          const originalPath = extractStoragePath(report?.original_image_url, "originals");
          if (originalPath) originalPaths.push(originalPath);
        });

        if (avatarPaths.length) {
          await client.storage.from("avatars").remove(avatarPaths);
        }
        if (reportPaths.length) {
          await client.storage.from("reports").remove(reportPaths);
        }
        if (originalPaths.length) {
          await client.storage.from("originals").remove(originalPaths);
        }

        const { error: deleteError } = await client.rpc("delete_user_account");
        if (deleteError) {
          setStatus(deleteError.message || "Unable to delete account.", "error");
          return;
        }

        await client.auth.signOut();

        localStorage.removeItem(OPENROUTER_API_KEY_STORAGE);
        localStorage.removeItem(THEME_STORAGE);
        if (el.openRouterApiKey) el.openRouterApiKey.value = "";
        setOpenRouterApiKeyState(false);
        setStatus("Account deleted.", "ok");
        showToast("Account deleted.");
        window.location.href = "/auth";
      });
    }


    el.settingsTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        switchSection(tab.dataset.settingsTab || "profile");
      });
    });
  }

  function extractStoragePath(value, bucket) {
    if (!value) return "";
    if (!bucket) return "";
    if (!value.startsWith("http")) return value;

    const publicPrefix = `/storage/v1/object/public/${bucket}/`;
    const signedPrefix = `/storage/v1/object/sign/${bucket}/`;

    const publicIndex = value.indexOf(publicPrefix);
    if (publicIndex !== -1) {
      return value.slice(publicIndex + publicPrefix.length).split("?")[0];
    }

    const signedIndex = value.indexOf(signedPrefix);
    if (signedIndex !== -1) {
      return value.slice(signedIndex + signedPrefix.length).split("?")[0];
    }

    return "";
  }

  async function initSettings() {
    client = await window.getSupabaseClient?.();
    if (!client) {
      setStatus("Supabase client not available.", "error");
      return;
    }

    const { data } = await client.auth.getSession();
    if (!data?.session) {
      window.location.href = "/auth";
      return;
    }

    client.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        window.location.href = "/auth";
        return;
      }
      loadSavedResults();
    });

    applyTheme();
    loadSavedKeys();
    await loadSavedResults();
    setupEvents();
  }

  initSettings();
})();
