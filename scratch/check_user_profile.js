const { createClient } = require('@supabase/supabase-js');
const url = "https://sbqnrxqgahfhbmlevtgf.supabase.co";
const key = "sb_publishable_0bvxzS5v5zv2x64iKgFLsQ_Prmyjy3f";
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('profiles').select('*');
  console.log('Profiles in DB:', data, 'Error:', error);
}
run();
