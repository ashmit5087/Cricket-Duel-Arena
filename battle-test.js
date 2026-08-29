// Exercise the battle endpoint and print the live ML fields that the
// frontend changelog says must now be surfaced (archetype/dnaScore/vector).
const url = "http://localhost:3001/api/battle?p1=virat-kohli&p2=rohit-sharma";

fetch(url, { signal: AbortSignal.timeout(120000) })
  .then((r) => r.json())
  .then((j) => {
    const pick = (p) => ({
      name: p?.name,
      archetypeId: p?.archetypeId,
      archetypeName: p?.archetypeName,
      archetypeColor: p?.archetypeColor,
      dnaScore: p?.dnaScore,
      playerVector: p?.playerVector,
      isOutlier: p?.isOutlier,
    });
    console.log(JSON.stringify({
      p1: pick(j.p1),
      p2: pick(j.p2),
      ml: j.ml,
      statComparison: j.statComparison,
      judge: j.judge ? "present" : "none",
      narrative: (j.narrative || "").slice(0, 140),
    }, null, 1));
  })
  .catch((e) => {
    console.error("BATTLE REQUEST FAILED:", e.message);
    process.exit(1);
  });
