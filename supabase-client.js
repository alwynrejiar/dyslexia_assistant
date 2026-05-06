(() => {
  window.addEventListener("error", (event) => {
    const detail = event?.error || event?.message || event;
    console.error("Unhandled error:", detail);
  });
  window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled promise rejection:", event?.reason || event);
  });

  const SUPABASE_URL = "https://gvokglgegiimplkwbcfw.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2b2tnbGdlZ2lpbXBsa3diY2Z3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDk2MjYsImV4cCI6MjA5MzQ4NTYyNn0.aaWR6Ejf-fWiCoZbnuJt5cd2RWt10CBjDjdARQJ8ogY";
  const SUPABASE_INIT_TIMEOUT_MS = 8000;
  const SUPABASE_POLL_MS = 50;

  function waitForSupabase() {
    return new Promise((resolve, reject) => {
      if (window.supabase) {
        resolve(window.supabase);
        return;
      }

      let elapsed = 0;
      const timer = setInterval(() => {
        if (window.supabase) {
          clearInterval(timer);
          resolve(window.supabase);
          return;
        }

        elapsed += SUPABASE_POLL_MS;
        if (elapsed >= SUPABASE_INIT_TIMEOUT_MS) {
          clearInterval(timer);
          reject(new Error("Supabase SDK did not load in time."));
        }
      }, SUPABASE_POLL_MS);
    });
  }

  async function initSupabaseClient() {
    if (window.supabaseClient) return window.supabaseClient;
    try {
      const supabase = await waitForSupabase();
      window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return window.supabaseClient;
    } catch (error) {
      console.error("Supabase init failed:", error);
      return null;
    }
  }

  window.getSupabaseClient = async () => {
    if (window.supabaseClient) return window.supabaseClient;
    return initSupabaseClient();
  };

  initSupabaseClient();
})();
