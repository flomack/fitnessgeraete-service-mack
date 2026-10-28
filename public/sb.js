// Gemeinsamer Supabase-Client für Formular und Backend.
window.sbReady = !/DEIN-/.test(window.SUPABASE_URL + window.SUPABASE_ANON_KEY);
window.sb = window.sbReady ? supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null;
