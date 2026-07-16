#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS CI utility */

const fs = require("node:fs");

const diagnosticId = String(process.argv[2] || "").trim();
if (!/^[a-zA-Z0-9_-]{6,64}$/.test(diagnosticId)) {
  console.error("A valid diagnostic id is required.");
  process.exit(2);
}

const raw = fs.readFileSync(0, "utf8");
let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  console.error("CloudBase returned output that was not valid JSON.");
  process.exit(3);
}

const sensitiveKey = /(token|secret|password|authorization|cookie|openid|platformUid|session)/i;
const secretValue = /(bearer\s+[a-z0-9._-]+|cloudbase[_-]?api[_-]?key|-----BEGIN [A-Z ]+PRIVATE KEY-----)/i;

function sanitize(value, key = "") {
  if (sensitiveKey.test(key)) return "[redacted]";
  if (typeof value === "string") {
    if (secretValue.test(value)) return "[redacted]";
    return value
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
      .replace(/(sessionToken|authorization|password|secret)\s*[:=]\s*[^,\s}]+/gi, "$1=[redacted]");
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitize(childValue, childKey)]));
  }
  return value;
}

function collect(value, path = "root", matches = []) {
  if (typeof value === "string") {
    const ignoredMetadata = /\.(queryString|diagnostic_id|diagnosticId)$/i.test(path);
    if (!ignoredMetadata && value.includes(diagnosticId)) matches.push({ path, value });
    return matches;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collect(item, `${path}[${index}]`, matches));
    return matches;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) => collect(child, `${path}.${key}`, matches));
  }
  return matches;
}

const matches = collect(parsed);
if (!matches.length) {
  console.error(`No CloudBase log matched diagnostic ${diagnosticId}.`);
  process.exit(4);
}

console.log(JSON.stringify(sanitize(matches), null, 2));
