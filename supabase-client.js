(() => {
  const SUPABASE_URL = "https://gvokglgegiimplkwbcfw.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2b2tnbGdlZ2lpbXBsa3diY2Z3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDk2MjYsImV4cCI6MjA5MzQ4NTYyNn0.aaWR6Ejf-fWiCoZbnuJt5cd2RWt10CBjDjdARQJ8ogY";

  if (!window.supabase) {
    return;
  }

  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
