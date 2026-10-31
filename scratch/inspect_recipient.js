const { createClient } = require('@supabase/supabase-js');
const url = "https://sbqnrxqgahfhbmlevtgf.supabase.co";
const key = "sb_publishable_0bvxzS5v5zv2x64iKgFLsQ_Prmyjy3f";
const supabase = createClient(url, key);

async function test() {
  const { data: leagues } = await supabase.from('leagues').select('*');
  const { data: members } = await supabase.from('league_members').select('*');
  console.log("Leagues in DB:", leagues.map(l => ({ id: l.id, name: l.name, owner_id: l.owner_id })));
  console.log("Members in DB:", members);
}
test();
