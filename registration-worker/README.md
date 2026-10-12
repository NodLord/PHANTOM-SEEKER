# PHANTOM SEEKER // Registration Worker

This Worker is the tiny public backend for the Expedition Phantom Seeker registration terminal.
It stores only public expedition-manifest data: CMDR name, optional EDSM name/status, primary ship,
preferred role, and registration time.

## 1. Create the D1 database

From this `registration-worker` directory:

```bash
npx wrangler login
npx wrangler d1 create phantom-seeker-registration --location=weur
```

Cloudflare prints a `database_id`. Copy `wrangler.toml.example` to `wrangler.toml`, then replace
`REPLACE_WITH_D1_DATABASE_ID` with that ID.

Cloudflare D1 binds the database to the Worker as `env.DB` through the `[[d1_databases]]` block.

## 2. Create the schema

```bash
npx wrangler d1 execute phantom-seeker-registration --remote --file=./schema.sql
```

## 3. Deploy the Worker

```bash
npx wrangler deploy --config wrangler.toml
```

Wrangler returns a URL similar to:

`https://phantom-seeker-registration.<your-workers-subdomain>.workers.dev`

## 4. Connect the GitHub Pages frontend

Open:

`js/registration-config-v0432.js`

and set:

```js
apiBase: "https://phantom-seeker-registration.<your-workers-subdomain>.workers.dev"
```

Commit/push the frontend files to GitHub Pages.

## 5. Test

Open:

`https://<your-worker-url>/health`

Expected response:

```json
{"ok":true,"service":"phantom-seeker-registration","version":"0.4.32"}
```

Then load the Home page. The status card should switch to `LIVE MANIFEST // ONLINE` and show the
real registration count.

## EDSM behaviour

The Worker checks EDSM `GET /api-commander-v1/get-ranks?commanderName=...`.

- `100`: EDSM record found / public ranks available.
- `207`: commander exists, but no ranks are stored or the profile is private.
- `203`: no matching EDSM commander record.
- network/other failure: EDSM unavailable.

None of these states blocks expedition registration.

## CORS

The default allowed production origin is `https://nodlord.github.io` plus localhost test origins.
If Phantom Seeker later moves to a custom domain, add that origin to `ALLOWED_ORIGINS` in
`wrangler.toml` and redeploy.
