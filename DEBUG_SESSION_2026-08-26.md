# Cricket DNA API — Bootstrap Career-Stats Debug Session

**Date:** 2026-08-26
**Project:** Cricket-Duel-Arena (Cricket DNA API v2.0.0 on Render)
**Live URL:** https://cricket-dna-api.onrender.com
**Service:** `artifacts/api-server/`

---

## Original Problem

User shared a Render deploy log showing the post-migrate `bootstrap:stats` script:
- Found 30 players missing career stats
- Estimated ~90 RapidAPI credits to fetch them all
- Result: **0 synced, 30 skipped, ~190 credits left this month**
- Every player logged `⚠️ {name}: no career data on Cricbuzz — skipped`
- Refresher cycle after migrate also reported `careerRefreshed: 0`

User wanted to fix the parser so the 30 seeded players' career stats actually land in Postgres.

---

## Handoff Summary (start of session)

### Confirmed
- **Bootstrap script:** `artifacts/api-server/src/db/bootstrapStats.ts` — fetches via `getPlayerStats(cricbuzzPlayerId)`, treats `career.length === 0` as "no data on Cricbuzz" and caches a 7-day skip.
- **Cricbuzz service:** `artifacts/api-server/src/services/cricbuzz.ts`. `getPlayerStats` (L335-385) calls three endpoints in parallel via `Promise.allSettled`:
  - `GET /stats/v1/player/{id}`
  - `GET /stats/v1/player/{id}/batting`
  - `GET /stats/v1/player/{id}/bowling`
- **Parser (L347-374):** walks a `FORMAT_MAP` of `testMatches / odiMatches / t20Matches / ipl` keys, reading `battingData?.stats?.[key]` and `bowlingData?.stats?.[key]`. If both are falsy, that format is skipped.
- **Roster IDs** in `artifacts/api-server/src/models/player.ts` L140-172 are genuine Cricbuzz IDs (Kohli=253802, de Villiers=44936, etc.) — confirmed correct.
- **Budget counter** uses `MONTHLY_QUOTA_LIMIT=190`; logs showed ~190 remaining after spending ~90.

### Suspected
Parser shape assumption (`{ stats: { testMatches, odiMatches, t20Matches, ipl } }`) didn't match real RapidAPI response. IPL key `ipl` likely should be `iplMatches`.

### Pitfalls noted
- Don't change `PLAYER_ROSTER` IDs.
- Don't lower FAIL_MARK_TTL without parse-miss detection.
- Live matches during the cycle were TNPL/DPL/local — `participants: 0` is expected, not a bug.

---

## Debug Session — What We Tried

### 1. Direct RapidAPI curl from this machine (no key)
```
GET https://cricbuzz-cricket.p.rapidapi.com/stats/v1/player/253802
→ HTTP 401 (no key)
```
Confirmed network path is reachable, endpoint exists.

### 2. User pasted a key in plaintext: `9017d52756mshee4cde5053de143p122d15jsnf0c2febbc9f8`
- **First curl test from this machine with that key:** `{"message":"Invalid API key"}` — key is **invalid**.
- Asked user to retrieve the real key from Render env or RapidAPI dashboard.

### 3. PowerShell environment issues
- User was in PowerShell on Windows. `export`, `for...do...done`, `${path}`, `python -m json.tool` all failed.
- `$host` is a read-only PowerShell built-in — caused "Cannot overwrite variable Host" error.
- Provided corrected `curl.exe` syntax (note the `.exe` to bypass PowerShell's `Invoke-WebRequest` alias).

### 4. User ran the corrected PowerShell curls
Empty bodies for all three endpoints. I ran the same key from this machine and got `HTTP 204 No Content` for `/stats/v1/player/253802` — meaning the key works but the endpoint returns empty. Subsequent batting/bowling returned `HTTP 429 Too many requests`.

### 5. User could not open Render Shell (paid feature)

### 6. I added a debug endpoint to capture the real response server-side
**File:** `artifacts/api-server/src/index.ts`
```typescript
// ── Debug: dump raw Cricbuzz response for one player. Used to design the
//    career-stats parser. Costs 3 credits per call. REMOVE after fix lands.
app.get("/api/debug/raw-stats", async (req, res) => {
  const cbId = String(req.query.cbId ?? "253802");
  try {
    const headers = {
      "x-rapidapi-key":  process.env.RAPIDAPI_KEY ?? "",
      "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
      "Accept":          "application/json",
    };
    const fetchOne = async (path: string) => {
      const r = await fetch(`https://cricbuzz-cricket.p.rapidapi.com${path}`, { headers });
      return { path, status: r.status, body: await r.text() };
    };
    const [info, batting, bowling] = await Promise.all([
      fetchOne(`/stats/v1/player/${cbId}`),
      fetchOne(`/stats/v1/player/${cbId}/batting`),
      fetchOne(`/stats/v1/player/${cbId}/bowling`),
    ]);
    res.json({ cbId, info, batting, bowling });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
```
Also added to the 404 route list. Diagnostics: clean.

### 7. User hit the debug endpoint → real root cause revealed
```json
{
  "cbId":"253802",
  "info":    {"status":429, "body":"{\"message\":\"You have exceeded the MONTHLY quota for Requests on your current plan, BASIC. Upgrade your plan at https://rapidapi.com/cricketapilive/api/cricbuzz-cricket\"}"},
  "batting": {"status":429, "body":"{\"message\":\"You have exceeded the MONTHLY quota...\"}"},
  "bowling": {"status":429, "body":"{\"message\":\"You have exceeded the MONTHLY quota...\"}"}
}
```

**Real root cause: RapidAPI monthly quota exhausted, not a parser bug.** The `cricbuzz-cricket` BASIC plan has a hard monthly cap; user has blown through it. The parser was producing empty `career[]` because every fetch hit a 429, and there was no data to parse. The `~190 credits left` log line was the **local** in-memory counter, not the RapidAPI-side reality.

### 8. User tried switching providers — pasted another key in chat
```
Host: free-cricbuzz-cricket-api.p.rapidapi.com
Path: /cricket-match-info?matchid=102040
Key:  25b33fbe9cmsh27bd4010c09de14p10208fjsn0abe5665d839
```

Issues flagged:
- **This is a different API product**, not the same as `cricbuzz-cricket`. Different host, different paths, different schema.
- The example path shown is for match info, not player career stats. No evidence the new provider exposes player career stats at all.
- **The new key is now in chat in plaintext** — compromised, needs rotation.
- Refused to "just use it" without verifying it has career-stats endpoints.

Asked user to:
- Run PowerShell curl with the new key against likely player-stats paths (`/player-stats?playerid=253802`, `/player-info?playerid=253802`, `/batting-stats?playerid=253802`, `/bowling-stats?playerid=253802`, `/player-career-stats?playerid=253802`, `/players/253802`).
- Send back the responses **without the key in the message**.
- Check the new provider's monthly quota on its RapidAPI listing page.

---

## Current State

### What's known
1. **The parser is probably not the bug.** Empty `career[]` was a downstream symptom of the 429.
2. **The real bug is quota exhaustion on the `cricbuzz-cricket` BASIC plan.** Resets on the 1st of next month, OR requires plan upgrade.
3. **The app lacks quota-aware behavior:** `cricbuzz.ts` already has a `quotaBlockedUntil` flag for the "monthly quota" message, but bootstrap doesn't bail early on quota-exceeded 429s — it just keeps trying and marking players as failed. Each retry costs 3 credits.
4. **Two RapidAPI keys are now exposed in chat history** and need rotation.

### What the user wants next
Asked for a markdown of this conversation context.

### What's pending (not yet decided by user)
Options I offered:
- **(a)** Just remove the debug endpoint, wait for quota rollover.
- **(b)** Remove the debug endpoint AND harden quota handling: stop-on-first-quota-429 in bootstrap, add `/api/quota` endpoint for visibility, mark current month exhausted locally when 429-with-quota-message is seen.
- **OR** verify the new `free-cricbuzz-cricket-api` provider has player career stats and switch to it (requires user to send non-key responses from probe curls first).

### What still needs investigation
- Whether `free-cricbuzz-cricket-api` has player career stats at all (only match-info example seen so far).
- Real monthly quota of the new provider.
- Whether the original `cricbuzz-cricket` quota resets on calendar month boundary (and when exactly).

---

## Files Modified in This Session

### `artifacts/api-server/src/index.ts`
- Added `GET /api/debug/raw-stats?cbId={id}` endpoint (L73-96) — returns raw Cricbuzz responses for one player, bypassing the parser. Cost: 3 credits per call.
- Added `GET /api/debug/raw-stats?cbId=253802` to the 404 route list.

This file is currently uncommitted on the user's local checkout (needs `git add` + `git commit` + `git push` to deploy).

---

## Code Reference (key files)

### `artifacts/api-server/src/services/cricbuzz.ts` (relevant excerpts)

```typescript
// L335-385: getPlayerStats — the function returning empty career
export async function getPlayerStats(cricbuzzPlayerId: string): Promise<CricbuzzPlayerStats> {
  const [info, batting, bowling] = await Promise.allSettled([
    rateLimitedFetch(`${BASE_URL}/stats/v1/player/${cricbuzzPlayerId}`),
    rateLimitedFetch(`${BASE_URL}/stats/v1/player/${cricbuzzPlayerId}/batting`),
    rateLimitedFetch(`${BASE_URL}/stats/v1/player/${cricbuzzPlayerId}/bowling`),
  ]);

  const playerInfo = info.status === "fulfilled" ? info.value : {};
  const battingData = batting.status === "fulfilled" ? batting.value : {};
  const bowlingData = bowling.status === "fulfilled" ? bowling.value : {};

  const FORMAT_MAP: Record<string, string> = {
    "testMatches": "TEST",
    "odiMatches":  "ODI",
    "t20Matches":  "T20I",
    "ipl":         "IPL",  // ← likely should be "iplMatches"
  };

  const careerStats: CricbuzzPlayerStats["career"] = [];

  for (const [key, format] of Object.entries(FORMAT_MAP)) {
    const bat = battingData?.stats?.[key];
    const bowl = bowlingData?.stats?.[key];
    if (!bat && !bowl) continue;
    careerStats.push({ /* ... */ });
  }

  return { /* ... */ };
}
```

```typescript
// L26-43: spendCredit + getQuotaRemaining
async function spendCredit(): Promise<boolean> {
  const monthKey = `${MONTHLY_KEY_PREFIX}${new Date().toISOString().slice(0, 7)}`;  // "cricbuzz:quota:2026-08"
  try {
    const count = await redis.incr(monthKey, MONTHLY_QUOTA_LIMIT);
    if (count === 1) await redis.expire(monthKey, 40 * 86400);
    return count <= MONTHLY_QUOTA_LIMIT;
  } catch {
    return true;
  }
}

export async function getQuotaRemaining(): Promise<number> {
  const monthKey = `${MONTHLY_KEY_PREFIX}${new Date().toISOString().slice(0, 7)}`;
  const used = parseInt((await redis.get(monthKey)) ?? "0", 10);
  return Math.max(0, MONTHLY_QUOTA_LIMIT - used);
}
```

```typescript
// L99-153: rateLimitedFetch — has quotaBlockedUntil logic
//   When 429 with message matching /monthly quota|quota/i:
//     sets quotaBlockedUntil = now + QUOTA_BLOCK_MS (default 1 hour)
//     throws Error("Cricbuzz API 429: ...")
```

### `artifacts/api-server/src/db/bootstrapStats.ts` (relevant excerpts)

```typescript
// L26-93: main loop
const FAIL_MARK_TTL = 7 * 86400;  // 7-day skip on fail

for (const player of pending) {
  const failKey = `bootstrap:failed:${player.cricbuzz_player_id}`;
  if (await cacheGet(failKey)) {
    skipped++;
    continue;
  }

  try {
    const stats = await getPlayerStats(player.cricbuzz_player_id);  // 3 credits

    if (!stats.career.length) {
      await cacheSet(failKey, { name: player.name, reason: "empty career" }, FAIL_MARK_TTL);
      skipped++;
      logger.warn(`[bootstrap] ⚠️  ${player.name}: no career data on Cricbuzz — skipped`);
      continue;
    }

    const rows = await upsertCareerStats(player.id, stats.career);
    done++;
  } catch (e: any) {
    if (e instanceof QuotaExhaustedError) {
      logger.warn(`[bootstrap] Monthly quota reached after ${done} player(s) — stopping.`);
      break;
    }
    failed++;
    await cacheSet(failKey, { name: player.name, reason: e.message }, FAIL_MARK_TTL);
    logger.warn(`[bootstrap] ❌ ${player.name}: ${e.message}`);
  }
}
```

---

## Exposed Secrets (rotate ASAP)

1. `9017d52756mshee4cde5053de143p122d15jsnf0c2febbc9f8` — `cricbuzz-cricket.p.rapidapi.com` BASIC plan key. Already invalid before exposure, but still rotate.
2. `25b33fbe9cmsh27bd4010c09de14p10208fjsn0abe5665d839` — `free-cricbuzz-cricket-api.p.rapidapi.com` key. Newly exposed, definitely needs rotation.

Rotation:
- `https://rapidapi.com/developer/dashboard` → select app → Security → Regenerate Key
- Update `RAPIDAPI_KEY` on Render service after rotation
- Never paste the new key into chat

---

## Recommended Next Steps (pending user decision)

1. **Decide on path forward:**
   - Wait for quota rollover (cheapest, slowest — 1st of next month)
   - Upgrade `cricbuzz-cricket` plan (paid, immediate)
   - Switch to `free-cricbuzz-cricket-api` IF it has player career stats (free, requires investigation)
   - Switch to a different RapidAPI provider (free/paid, requires investigation)

2. **Either way, harden the app** to make this visible/containable:
   - Bootstrap: bail at first 429 with "MONTHLY quota" message (don't mark individual players as failed on quota errors)
   - `cricbuzz.ts`: when a quota-exceeded 429 is seen, immediately set `quotaBlockedUntil` AND mark current month as exhausted in the local counter so subsequent calls short-circuit
   - Add `GET /api/quota` endpoint exposing local counter + whether the app currently thinks it's blocked
   - Tighten the "empty career" heuristic so parse misses don't silently burn quota

3. **Remove `/api/debug/raw-stats` endpoint** in the same commit as the fix.

4. **Commit and deploy** in two phases:
   - Phase 1: harden quota handling (small, safe change)
   - Phase 2: once quota is restored and we can re-verify the parser against real data, fix any remaining parser issues (the `ipl` → `iplMatches` rename is still on the table)
