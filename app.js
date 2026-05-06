// 1. The Address and the Key (Get these from your Supabase Dashboard)
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY';

// 2. Open the connection
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);
