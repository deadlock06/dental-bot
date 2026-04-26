const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase Singleton] Missing SUPABASE_URL or SUPABASE_KEY. DB operations will fail.');
}

let supabase;
try {
  supabase = createClient(supabaseUrl, supabaseKey);
} catch (e) {
  console.error('[Supabase Singleton] CRITICAL: Failed to initialize Supabase client:', e.message);
  // Provide a mock object or handle gracefully to prevent boot crash
  supabase = {
    from: () => ({
      select: () => ({ single: () => Promise.resolve({ data: null, error: e }), order: () => ({ limit: () => Promise.resolve({ data: [], error: e }) }), eq: () => ({ single: () => Promise.resolve({ data: null, error: e }) }) }),
      upsert: () => Promise.resolve({ data: null, error: e })
    })
  };
}

module.exports = supabase;
