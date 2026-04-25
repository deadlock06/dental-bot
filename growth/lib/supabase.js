const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase Singleton] Missing SUPABASE_URL or SUPABASE_KEY. DB operations will fail.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
