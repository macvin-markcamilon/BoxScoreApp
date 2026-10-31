const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://sbqnrxqgahfhbmlevtgf.supabase.co";
const SUPABASE_KEY = "sb_publishable_0bvxzS5v5zv2x64iKgFLsQ_Prmyjy3f";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  const { data, error } = await supabase
    .from("leagues")
    .select("id, name, rules_config")
    .eq("id", "ab8ca017-6e45-472d-8e94-13723d5ee992")
    .single();

  if (error) {
    console.error("Error:", error);
    return;
  }
  console.log("League:", data.name);
  const t = data.rules_config?._persistedTournament;
  if (!t) {
    console.log("No _persistedTournament!");
    return;
  }
  console.log("Tournament title:", t.title, "updatedAt:", t.updatedAt, "matches count:", t.matches?.length);
  const played = t.matches?.filter(m => m.status === 'FINAL');
  console.log("Final matches count:", played.length);
  played.forEach(m => console.log(`Game #${m.gameNumber}: ${m.homeTeamName || m.homeTeamId} (${m.homeScore}) vs ${m.awayTeamName || m.awayTeamId} (${m.awayScore}) [${m.status}]`));
}

check();
