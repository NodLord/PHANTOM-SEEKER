PHANTOM SEEKER // REGISTRATION WORKER V0.4.32.1
================================================

This Worker is the live backend for the Phantom Seeker Registration Terminal.
It keeps the existing D1 database and adds:
- up to 3 roles per commander;
- Rescue & Recovery;
- BenRick Incident Coordinator;
- private registration management keys;
- edit / cancel / re-register support;
- Cloudflare Workers Rate Limiting bindings;
- stricter write-origin and request-size checks;
- no public registration timestamp in /api/manifest.

IMPORTANT FOR THE EXISTING LIVE DATABASE
----------------------------------------
DO NOT run a destructive reset and DO NOT delete the existing commanders table.
Use migration-v04321.sql. It preserves every existing commander and copies each
old preferred_role into the new commander_roles table.

1) Put these updated backend files in your existing registration-worker folder:
   worker.js
   migration-v04321.sql
   issue-legacy-key.mjs

2) Run the migration:

   npx.cmd wrangler@latest d1 execute phantom-seeker-registration --remote --file=./migration-v04321.sql

3) Update YOUR EXISTING wrangler.toml.
   Keep your real database_id. Do not replace it with the placeholder from the
   example file.

   For production, ALLOWED_ORIGINS should preferably be:

   ALLOWED_ORIGINS = "https://nodlord.github.io"

   Add these blocks to the bottom of wrangler.toml:

   [[ratelimits]]
   name = "WRITE_RATE_LIMITER"
   namespace_id = "43211"
     [ratelimits.simple]
     limit = 12
     period = 60

   [[ratelimits]]
   name = "EDSM_RATE_LIMITER"
   namespace_id = "43212"
     [ratelimits.simple]
     limit = 60
     period = 60

   Wrangler 4.36+ is required for Rate Limiting bindings. Frank currently uses
   a much newer Wrangler version, so no Wrangler upgrade should be necessary.

4) Deploy the Worker BEFORE uploading the new website frontend:

   npx.cmd wrangler@latest deploy --config wrangler.toml

5) Check:

   https://phantom-seeker-registration.phantom-seeker.workers.dev/health

   It should return version 0.4.32.1.

   Then check:

   https://phantom-seeker-registration.phantom-seeker.workers.dev/api/manifest

EXISTING COMMANDERS / LEGACY KEYS
---------------------------------
Registrations made before V0.4.32.1 do not have a private management key,
because no such key existed when they registered.

Their registrations are preserved and their existing role is preserved.
To let an existing commander use MANAGE REGISTRATION, Frank must issue a key
once and send it to that commander privately.

Example:

   node issue-legacy-key.mjs "DScorpio93"

The script prints:
- a PRIVATE KEY to send privately to that commander;
- a ready-to-run Wrangler D1 command that stores only the SHA-256 hash.

Run the printed D1 command, then send only the PSK-... key to the commander.
Never post management keys in Discord public channels or GitHub.

NEW COMMANDERS
--------------
New registrations automatically receive a private PSK management key.
The browser stores it in localStorage for convenience and the terminal displays
it after registration. D1 stores only its SHA-256 hash.

MANAGEMENT
----------
MANAGE REGISTRATION lets a commander authenticated with CMDR name + private key:
- change EDSM Commander Name;
- change Primary Ship;
- select 1 to 3 roles;
- cancel the registration.

Cancellation deletes the commander's manifest entry and management secret.
The CMDR name is immediately free for a new registration.

SECURITY NOTES
--------------
- SQL still uses prepared statements / bound parameters.
- Public write endpoints now require an allowed Origin.
- JSON request bodies are capped at 8 KiB.
- Cloudflare Rate Limiting bindings throttle EDSM checks and management/write requests.
- Registration management keys are high-entropy random keys and only hashes are stored in D1.
- /api/manifest no longer exposes registered_at.
- The honeypot remains in place.
- Rate Limiting counters are handled by Cloudflare; this patch does not create an IP log table in D1.

FRONTEND DEPLOYMENT
-------------------
After the Worker is updated, upload the V0.4.32.1 frontend files to GitHub.
KEEP your existing js/registration-config-v0432.js exactly as it is, because it
already contains the live Worker URL.

Then hard-refresh the website with Ctrl+F5.
