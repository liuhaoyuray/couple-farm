#!/usr/bin/env node

const service = process.argv[2];
if (!service) {
  console.error("Usage: verify-cloudbase-health.cjs <service>");
  process.exit(2);
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const seen = new Set();
  let matchedPayload;

  function inspect(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) return false;
      seen.add(trimmed);
      try {
        return inspect(JSON.parse(trimmed));
      } catch {
        return false;
      }
    }
    if (Array.isArray(value)) return value.some(inspect);
    if (typeof value !== "object") return false;
    if (value.service === service && value.ok === true) {
      matchedPayload = value;
      return true;
    }
    return Object.values(value).some(inspect);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    console.error("CloudBase CLI did not return valid JSON:", raw.slice(0, 2000));
    process.exit(1);
  }
  if (!inspect(payload)) {
    console.error(`CloudBase health check for ${service} failed:`, raw.slice(0, 4000));
    process.exit(1);
  }
  if (service === "games") {
    const games = Array.isArray(matchedPayload?.games) ? matchedPayload.games : [];
    const required = ["gomoku", "tic-tac-toe", "rps"];
    if (!required.every((game) => games.includes(game))) {
      console.error("CloudBase games health check is missing 0.10.0 capabilities:", games);
      process.exit(1);
    }
  }
  console.log(`CloudBase health check passed: ${service}`);
});
