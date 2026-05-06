(() => {
  let client = null;

  const el = {
    name: document.getElementById("profileName"),
    age: document.getElementById("profileAge"),
    role: document.getElementById("profileRole"),
    roleCustom: document.getElementById("profileRoleCustom"),
    customRoleRow: document.getElementById("customRoleRow"),
    languages: document.getElementById("profileLanguages"),
    email: document.getElementById("profileEmail"),
    username: document.getElementById("profileUsername"),
    avatarImg: document.getElementById("profileAvatarImg"),
    avatarFallback: document.getElementById("profileAvatarFallback"),
    avatarBtn: document.getElementById("profileAvatarBtn"),
    avatarInput: document.getElementById("profileAvatarInput"),
    saveBtn: document.getElementById("saveProfileBtn"),
    status: document.getElementById("profileStatus"),
    toast: document.getElementById("toast"),
    form: document.querySelector("[data-profile-form]"),
  };

  const LEGACY_DEFAULT_AVATAR_URL = "https://images.unsplash.com/photo-1544005313-94ddf0286df2";
  const shouldRedirectOnSave = !window.location.pathname.endsWith("/settings");
  const LAST_REPORT_STORAGE = "dyslexaread:lastReport";
  const MAX_SAVED_REPORTS = 25;
  let avatarPath = "";
  let avatarUrl = "";
  let isEditing = true;

  const formInputs = [
    el.name,
    el.age,
    el.roleCustom,
    el.languages,
    el.email,
    el.username,
  ];

  const formSelects = [el.role];

  function showToast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.add("show");
    setTimeout(() => el.toast.classList.remove("show"), 2200);
  }

  function setStatus(message, mode = "") {
    if (!el.status) return;
    el.status.textContent = message;
    el.status.className = `status-text ${mode}`.trim();
  }

  function setEditing(enabled, { silent = false } = {}) {
    isEditing = enabled;
    if (el.form) {
      el.form.classList.toggle("profile-locked", !enabled);
    }

    formInputs.forEach((input) => {
      if (!input) return;
      input.readOnly = !enabled;
      input.tabIndex = enabled ? 0 : -1;
    });

    formSelects.forEach((select) => {
      if (!select) return;
      select.disabled = !enabled;
      select.tabIndex = enabled ? 0 : -1;
    });

    if (el.avatarBtn) {
      el.avatarBtn.disabled = !enabled;
      el.avatarBtn.style.display = enabled ? "inline-flex" : "none";
    }
    if (el.avatarInput) {
      el.avatarInput.disabled = !enabled;
    }
    if (el.saveBtn) el.saveBtn.textContent = enabled ? "Save Profile" : "Edit Profile";

    if (!silent) {
      setStatus(enabled ? "Edit mode enabled." : "Profile locked.", "ok");
    }
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 12) || "user";
  }

  async function generateUsername(name) {
    if (!client) return "user";
    const base = slugify(name);
    let attempt = 0;
    while (attempt < 6) {
      const suffix = Math.floor(100 + Math.random() * 900);
      const candidate = `${base}${suffix}`;
      const { data } = await client
        .from("profiles")
        .select("username")
        .eq("username", candidate)
        .maybeSingle();
      if (!data) return candidate;
      attempt += 1;
    }
    return `${base}${Date.now().toString().slice(-4)}`;
  }

  async function resolveAvatarUrl(storedValue) {
    if (!storedValue) return "";
    if (storedValue.startsWith("http")) return storedValue;
    if (!client) return "";

    const { data, error } = await client
      .storage
      .from("avatars")
      .createSignedUrl(storedValue, 60 * 60);

    if (error) {
      setStatus(error.message || "Unable to load profile photo.", "error");
      return "";
    }

    return data?.signedUrl || "";
  }

  async function loadProfile() {
    if (!client) {
      setStatus("Supabase client not available.", "error");
      return;
    }
    const { data: sessionData } = await client.auth.getSession();
    const session = sessionData?.session;
    if (!session) {
      window.location.href = "/auth";
      return;
    }

    const user = session.user;
    if (el.email) el.email.value = user.email || "";

    const { data } = await client
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      el.name.value = data.name || "";
      el.age.value = data.age || "";
      el.role.value = data.role || "parent";
      el.roleCustom.value = data.role_custom || "";
      el.languages.value = data.languages || "";
      el.email.value = data.email || user.email || "";
      el.username.value = data.username || "";
      const storedAvatarValue = data.avatar_url || "";
      if (storedAvatarValue.startsWith(LEGACY_DEFAULT_AVATAR_URL)) {
        avatarPath = "";
        avatarUrl = "";
      } else {
        avatarPath = storedAvatarValue;
        avatarUrl = await resolveAvatarUrl(storedAvatarValue);
      }
      applyAvatar(avatarUrl, data.name || user.email || "");
      toggleCustomRole();
      setEditing(false, { silent: true });
      return;
    }

    applyAvatar("", user.email || "");

    if (el.username) {
      el.username.value = await generateUsername(el.name.value);
    }
    setEditing(true, { silent: true });
  }

  function toggleCustomRole() {
    if (!el.customRoleRow) return;
    const isCustom = el.role?.value === "custom";
    el.customRoleRow.hidden = !isCustom;
  }

  async function buildProfilePayload(userId) {
    const name = el.name.value.trim();
    const age = Number(el.age.value);
    const role = el.role.value;
    const roleCustom = el.roleCustom.value.trim();
    const languages = el.languages.value.trim();
    const email = el.email.value.trim();
    let username = el.username.value.trim();

    if (!name || !age || !role || !languages || !email) {
      return { errorMessage: "All required fields must be filled." };
    }
    if (role === "custom" && !roleCustom) {
      return { errorMessage: "Please enter a custom role." };
    }
    if (!username) {
      username = await generateUsername(name);
      el.username.value = username;
    }

    return {
      payload: {
        user_id: userId,
        name,
        age,
        role,
        role_custom: role === "custom" ? roleCustom : null,
        languages,
        email,
        username,
        avatar_url: avatarPath || avatarUrl || null,
        updated_at: new Date().toISOString(),
      },
    };
  }

  async function saveProfile() {
    if (!client) return;
    const { data: sessionData } = await client.auth.getSession();
    const session = sessionData?.session;
    if (!session) {
      window.location.href = "/auth";
      return;
    }
    const { payload, errorMessage } = await buildProfilePayload(session.user.id);
    if (!payload) {
      setStatus(errorMessage || "Unable to save profile.", "error");
      return;
    }

    const { error } = await client.from("profiles").upsert(payload, { onConflict: "user_id" });
    if (error) {
      setStatus(error.message || "Unable to save profile.", "error");
      return;
    }

    await saveLatestReportToSupabase();
    setEditing(false, { silent: true });
    setStatus("Profile saved.", "ok");
    showToast("Profile updated.");
    if (shouldRedirectOnSave) {
      window.location.href = "/app";
    }
  }

  async function saveLatestReportToSupabase() {
    if (!client) return;
    const raw = localStorage.getItem(LAST_REPORT_STORAGE);
    if (!raw) {
      showToast("No recent analysis to attach.");
      return;
    }

    let latest;
    try {
      latest = JSON.parse(raw);
    } catch (_error) {
      return;
    }

    const { data: sessionData } = await client.auth.getSession();
    const session = sessionData?.session;
    if (!session) return;

    const { count } = await client
      .from("saved_reports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", session.user.id);
    if (count !== null && count >= MAX_SAVED_REPORTS) {
      showToast("Profile already has 25 saved reports.");
      return;
    }

    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) {
      showToast("PDF export unavailable. Please refresh and try again.");
      return;
    }

    const corrected = latest.corrected || "";
    const originalImage = latest.originalImageDataUrl || "";
    const originalWidth = Number(latest.originalWidth) || 0;
    const originalHeight = Number(latest.originalHeight) || 0;
    const correctedImage = buildCorrectedImageDataUrl(corrected, originalWidth, originalHeight);

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
    await uploadReportAssets(session.user.id, pdfBlob, originalImage);
    showToast("Saved result attached.");
  }

  async function uploadReportAssets(userId, pdfBlob, originalImageDataUrl) {
    const timestamp = Date.now();
    const pdfPath = `${userId}/${timestamp}.pdf`;
    const pdfUpload = await client
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
        const imgUpload = await client
          .storage
          .from("originals")
          .upload(imagePath, blob, { contentType: blob.type });
        if (!imgUpload.error) {
          originalPath = imagePath;
        }
      }
    }

    await client.from("saved_reports").insert({
      user_id: userId,
      pdf_url: pdfPath,
      original_image_url: originalPath,
    });
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

  async function persistAvatar(userId) {
    const { data: existing, error: existingError } = await client
      .from("profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingError) {
      setStatus(existingError.message || "Avatar saved, but profile lookup failed.", "error");
      return;
    }

    if (existing) {
      const { error } = await client
        .from("profiles")
        .update({
          avatar_url: avatarPath || avatarUrl || null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (error) {
        setStatus(error.message || "Avatar saved, but profile update failed.", "error");
        return;
      }

      setStatus("Profile photo saved.", "ok");
      return;
    }

    const { payload, errorMessage } = await buildProfilePayload(userId);
    if (!payload) {
      setStatus(
        "Photo uploaded. Complete required fields and click Save Profile to store it.",
        "error"
      );
      return;
    }

    const { error } = await client.from("profiles").upsert(payload, { onConflict: "user_id" });
    if (error) {
      setStatus(error.message || "Avatar saved, but profile create failed.", "error");
      return;
    }

    setStatus("Profile photo saved.", "ok");
  }


  if (el.role) {
    el.role.addEventListener("change", () => {
      if (!isEditing) return;
      toggleCustomRole();
    });
  }

  if (el.name) {
    el.name.addEventListener("blur", async () => {
      if (!isEditing) return;
      if (!el.username.value) {
        el.username.value = await generateUsername(el.name.value);
      }
      applyAvatar(avatarUrl, el.name.value || el.email.value);
    });
  }

  if (el.avatarBtn && el.avatarInput) {
    el.avatarBtn.addEventListener("click", () => {
      el.avatarInput.click();
    });

    el.avatarInput.addEventListener("change", async () => {
      const file = el.avatarInput.files?.[0];
      if (!file || !client) return;
      const { data: sessionData } = await client.auth.getSession();
      const session = sessionData?.session;
      if (!session) return;

      const previousAvatarPath = avatarPath;

      const ext = file.name.split(".").pop() || "png";
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      const { error } = await client.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type });
      if (error) {
        setStatus(error.message || "Avatar upload failed.", "error");
        return;
      }

      avatarPath = path;
      avatarUrl = await resolveAvatarUrl(path);

      await persistAvatar(session.user.id);

      if (previousAvatarPath && previousAvatarPath !== avatarPath) {
        const { error: removeError } = await client.storage
          .from("avatars")
          .remove([previousAvatarPath]);
        if (removeError) {
          setStatus(removeError.message || "Unable to remove previous avatar.", "error");
        }
      }

      applyAvatar(avatarUrl, el.name.value || el.email.value);
      el.avatarInput.value = "";
      showToast("Profile photo updated.");
    });
  }

  if (el.saveBtn) {
    el.saveBtn.addEventListener("click", () => {
      if (!isEditing) {
        setEditing(true);
        return;
      }
      saveProfile();
    });
  }

  async function initProfile() {
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
      }
    });

    loadProfile();
  }

  initProfile();
})();

function applyAvatar(url, fallbackSource) {
  const img = document.getElementById("profileAvatarImg");
  const fallback = document.getElementById("profileAvatarFallback");
  if (!img || !fallback) return;
  if (url) {
    img.src = url;
    img.style.display = "block";
    fallback.style.display = "none";
    return;
  }
  const initial = String(fallbackSource || "U").trim().charAt(0).toUpperCase() || "U";
  img.style.display = "none";
  fallback.style.display = "grid";
  fallback.textContent = initial;
}
