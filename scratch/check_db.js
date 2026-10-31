const { createClient } = require('@supabase/supabase-js');
const url = "https://sbqnrxqgahfhbmlevtgf.supabase.co";
const key = "sb_publishable_0bvxzS5v5zv2x64iKgFLsQ_Prmyjy3f";
const supabase = createClient(url, key);

async function run() {
  const { data: leagues } = await supabase.from('leagues').select('id, name, rules_config');
  console.log('Leagues rules_config._persistedMembers:', JSON.stringify(leagues?.map(l => ({ id: l.id, name: l.name, members: l.rules_config?._persistedMembers })), null, 2));

  const { data: members, error: mErr } = await supabase.from('league_members').select('*');
  console.log('league_members table rows:', JSON.stringify(members, null, 2), 'Error:', mErr);
}
run();
