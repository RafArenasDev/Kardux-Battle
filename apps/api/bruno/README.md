# Using Bruno with this API

Bruno is the Postman replacement this project uses (free, open source, no account — see
[ADR 0005](../../docs/adr/0005-api-docs-and-http-client.md)). This folder **is** the
collection — Bruno reads it directly from disk, there's nothing to "import" from a URL or a
file upload.

## 1. Start the API first

Bruno (and Swagger) can only talk to something that's actually running:

```bash
pnpm --filter @kardux/api dev
```

Wait for the log line `Kardux Battle API listening on http://localhost:3000`. Leave that
terminal open — the server keeps running there.

## 2. Open this collection in Bruno

1. Open the Bruno app (you said you already have it open on Windows — good).
2. On the **Home** screen (or via the folder/"Open Collection" icon in the top-left, next to
   the "+"), choose **"Open Collection"** — not "Create Collection", not "Import Collection".
   Bruno collections are just folders on disk; this one already exists.
3. Point it at this exact folder:
    ```
    C:\Users\usuario\Documents\RAFA\DEV\kardux-battle\apps\api\bruno
    ```
4. It should appear in Bruno's left sidebar as **"Kardux Battle API"**, with one request
   inside: **Health check**.

If Bruno shows an empty collection or an error, double check you pointed it at the `bruno`
folder itself (the one with `bruno.json` in it), not `apps/api` or the repo root.

## 3. Select the environment

Every request in this collection uses a `{{baseUrl}}` variable instead of a hardcoded URL, so
switching between local/staging/production later is one dropdown, not editing every request.

1. Top-right corner of the Bruno window, there's a dropdown that says **"No Environment"**
   (or similar).
2. Click it and select **`local`**.
3. That's it — `{{baseUrl}}` now resolves to `http://localhost:3000` (see
   `environments/local.bru`).

If you skip this step, requests will fail because `{{baseUrl}}` has nothing to resolve to.

## 4. Send a request

1. Click **"Health check"** in the sidebar.
2. You'll see the request details: `GET {{baseUrl}}/health`.
3. Click the blue **"Send"** button (or press `Ctrl+Enter`).
4. The response panel on the right should show `200 OK` with a body like:
    ```json
    { "status": "ok", "uptimeSeconds": 42, "timestamp": "2026-09-21T..." }
    ```

## Prefer a browser? Use Swagger instead

With the API running, `http://localhost:3000/api/docs` is a full interactive API explorer —
every endpoint, its schema (generated straight from `@kardux/contracts`'s Zod schemas, so it's
never out of date), and a "Try it out" button that sends a real request without any extra
setup. Good for a quick look; Bruno is better once there are requests worth saving, chaining,
or committing to the repo for teammates to reuse.

## Adding new requests as endpoints get built

Each new module (auth, matches, leaderboard, ...) should add its own `.bru` file here,
following `health.bru` as the template — `meta` block with a `seq` number, the HTTP
method/URL/body, and a `docs` block explaining what it's for. Requests that need auth will use
a Bruno variable for the bearer token once `AuthModule` exists (Phase 2b) — not needed yet,
nothing requires auth today.
