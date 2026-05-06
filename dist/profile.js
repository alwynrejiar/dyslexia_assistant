(() => {
  const client = window.supabaseClient;

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
  };

  const LEGACY_DEFAULT_AVATAR_URL = "https://images.unsplash.com/photo-1544005313-94ddf0286df2";
  const shouldRedirectOnSave = !window.location.pathname.endsWith("settings.html");
  let avatarPath = "";
  let avatarUrl = "";

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
      window.location.href = "auth.html";
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
      return;
    }

    applyAvatar("", user.email || "");

    if (el.username) {
      el.username.value = await generateUsername(el.name.value);
    }
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
      window.location.href = "auth.html";
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

    setStatus("Profile saved.", "ok");
    showToast("Profile updated.");
    if (shouldRedirectOnSave) {
      window.location.href = "app.html";
    }
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
    el.role.addEventListener("change", toggleCustomRole);
  }

  if (el.name) {
    el.name.addEventListener("blur", async () => {
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
    el.saveBtn.addEventListener("click", saveProfile);
  }

  loadProfile();
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
