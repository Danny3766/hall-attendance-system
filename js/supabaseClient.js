(function () {
  if (!window.APP_CONFIG) {
    throw new Error("Missing js/config.js. Copy js/config.example.js to js/config.js and fill in Supabase settings.");
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes("your-project")) {
    throw new Error("Supabase settings are not configured in js/config.js.");
  }

  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
