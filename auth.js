(() => {
  const el = {
    tabs: Array.from(document.querySelectorAll(".settings-tab")),
    panes: Array.from(document.querySelectorAll(".settings-pane")),
    signinEmail: document.getElementById("signinEmail"),
    signinPassword: document.getElementById("signinPassword"),
    signupName: document.getElementById("signupName"),
    signupAge: document.getElementById("signupAge"),
    signupRole: document.getElementById("signupRole"),
    signupRoleCustom: document.getElementById("signupRoleCustom"),
    signupCustomRoleRow: document.getElementById("signupCustomRoleRow"),
    signupLanguages: document.getElementById("signupLanguages"),
    signupEmail: document.getElementById("signupEmail"),
    signupPassword: document.getElementById("signupPassword"),
    signinBtn: document.getElementById("signinBtn"),
    signupBtn: document.getElementById("signupBtn"),
    authStatus: document.getElementById("authStatus"),
    toast: document.getElementById("toast"),
  };

  const client = window.supabaseClient;

  function setStatus(message, mode = "") {
    if (!el.authStatus) return;
    el.authStatus.textContent = message;
    el.authStatus.className = `status-text ${mode}`.trim();
  }

  function showToast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.add("show");
    setTimeout(() => el.toast.classList.remove("show"), 2200);
  }

  function switchPanel(panel) {
    el.tabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.authTab === panel);
    });
    el.panes.forEach((pane) => {
      const active = pane.dataset.authPanel === panel;
      pane.classList.toggle("is-active", active);
      pane.hidden = !active;
    });
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

  function toggleCustomRole() {
    if (!el.signupCustomRoleRow) return;
    const isCustom = el.signupRole?.value === "custom";
    el.signupCustomRoleRow.hidden = !isCustom;
  }

  async function signIn() {
    if (!client) {
      setStatus("Supabase client not available.", "error");
      return;
    }
    const email = (el.signinEmail?.value || "").trim();
    const password = el.signinPassword?.value || "";
    if (!email || !password) {
      setStatus("Email and password are required.", "error");
      return;
    }

    setStatus("Signing in...", "");
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus(error.message || "Unable to sign in.", "error");
      return;
    }

    setStatus("Signed in!", "ok");
    showToast("Signed in successfully.");
    window.location.href = "/app";
  }

  async function signUp() {
    if (!client) {
      setStatus("Supabase client not available.", "error");
      return;
    }
    const name = (el.signupName?.value || "").trim();
    const age = Number(el.signupAge?.value || 0);
    const role = el.signupRole?.value || "";
    const roleCustom = (el.signupRoleCustom?.value || "").trim();
    const languages = (el.signupLanguages?.value || "").trim();
    const email = (el.signupEmail?.value || "").trim();
    const password = el.signupPassword?.value || "";
    if (!name || !age || !role || !languages || !email || !password) {
      setStatus("All fields are required.", "error");
      return;
    }
    if (role === "custom" && !roleCustom) {
      setStatus("Please enter a custom role.", "error");
      return;
    }

    setStatus("Creating account...", "");
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) {
      setStatus(error.message || "Unable to sign up.", "error");
      return;
    }

    const userId = data?.user?.id;
    if (userId) {
      const username = await generateUsername(name);
      await client.from("profiles").insert({
        user_id: userId,
        name,
        age,
        role,
        role_custom: role === "custom" ? roleCustom : null,
        languages,
        email,
        username,
        updated_at: new Date().toISOString(),
      });
    }

    setStatus("Account created. Complete your profile.", "ok");
    showToast("Account created.");
    window.location.href = "/profile";
  }

  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchPanel(tab.dataset.authTab || "signin"));
  });

  if (el.signupRole) {
    el.signupRole.addEventListener("change", toggleCustomRole);
  }

  if (el.signinBtn) {
    el.signinBtn.addEventListener("click", signIn);
  }

  if (el.signupBtn) {
    el.signupBtn.addEventListener("click", signUp);
  }
})();
