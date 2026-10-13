import crypto from "node:crypto";

const name = String(process.argv.slice(2).join(" ") || "").replace(/^CMDR\s+/i, "").trim();
if (!name) {
  console.error('Usage: node issue-legacy-key.mjs "Commander Name"');
  process.exit(1);
}
if (!/^[\p{L}\p{N} ._'\-]{2,64}$/u.test(name)) {
  console.error("Commander name contains unsupported characters.");
  process.exit(1);
}

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const bytes = crypto.randomBytes(20);
let raw = "";
for (const byte of bytes) raw += alphabet[byte & 31];
const managementKey = `PSK-${raw.match(/.{1,4}/g).join("-")}`;
const tokenHash = crypto.createHash("sha256").update(managementKey.toUpperCase(), "utf8").digest("hex");
const sqlName = name.replaceAll("'", "''");
const sql = `INSERT INTO registration_secrets (commander_id, token_hash, created_at) SELECT id, '${tokenHash}', datetime('now') FROM commanders WHERE lower(cmdr_name)=lower('${sqlName}') ON CONFLICT(commander_id) DO UPDATE SET token_hash=excluded.token_hash, created_at=excluded.created_at;`;

console.log("\nPHANTOM SEEKER // LEGACY MANAGEMENT KEY\n");
console.log(`CMDR: ${name}`);
console.log(`PRIVATE KEY: ${managementKey}`);
console.log("\nSend ONLY the PRIVATE KEY to that commander. Do not post it publicly.\n");
console.log("Run this from registration-worker to activate the key in D1:\n");
console.log(`npx.cmd wrangler@latest d1 execute phantom-seeker-registration --remote --command=\"${sql}\"`);
console.log("\nThe database stores only the SHA-256 hash, never the private key itself.\n");
