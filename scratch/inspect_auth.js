const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://sbqnrxqgahfhbmlevtgf.supabase.co";
const KEY = "sb_publishable_0bvxzS5v5zv2x64iKgFLsQ_Prmyjy3f";

const client = createClient(SUPABASE_URL, KEY);
console.log("Client initialized");
