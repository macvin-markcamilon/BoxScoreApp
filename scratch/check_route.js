async function test() {
  const res = await fetch("https://box-score-app.vercel.app/api/league/update-members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      leagueId: "ab8ca017-6e45-472d-8e94-13723d5ee992",
      rulesConfig: { test: true }
    })
  });
  console.log("Status:", res.status);
  const data = await res.text();
  console.log("Response:", data);
}
test();
