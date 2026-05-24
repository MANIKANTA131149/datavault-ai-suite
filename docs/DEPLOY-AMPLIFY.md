# Deploy frontend on AWS Amplify

Amplify Hosting serves the **React UI only**. The Express API (`server/`) must run elsewhere (App Runner, Elastic Beanstalk, EC2, or keep Render for the API).

## 1. Create the Amplify app

1. Open [AWS Amplify Console](https://console.aws.amazon.com/amplify/).
2. **Create new app** → **Host web app**.
3. Connect **GitHub** → repository `datavault-ai-suite` → branch `main`.
4. Amplify detects `amplify.yml` at the repo root (already in this project).
5. App type: **Single-page application**.

## 2. Environment variables (Amplify → Environment variables)

Set these before the first successful production build. `VITE_*` values are embedded at **build time** — redeploy after any change.

| Variable | Required | Example |
|----------|----------|---------|
| `VITE_API_URL` | Yes (unless API is same origin) | `https://api.yourdomain.com/api` |
| `VITE_AUTH0_DOMAIN` | If using Auth0 | `your-tenant.auth0.com` |
| `VITE_AUTH0_CLIENT_ID` | If using Auth0 | `your_client_id` |

Do **not** put `MONGODB_URI` or `JWT_SECRET` in Amplify unless you only use them at build time (you do not).

## 3. SPA routing

This repo includes `public/_redirects` so React Router works on refresh:

```
/*    /index.html   200
```

If routes still 404, in Amplify → **Hosting** → **Rewrites and redirects**, add the same rule as a **200 rewrite** to `/index.html`.

## 4. Deploy the API (separate from Amplify)

Point `VITE_API_URL` at your API base URL (must end with `/api`).

Example env on the API host:

```env
MONGODB_URI=mongodb+srv://...
JWT_SECRET=long-random-secret
FRONTEND_URL=https://main.xxxxx.amplifyapp.com
PORT=3001
```

Health check: `GET https://your-api-host/api/health` → `{"status":"ok",...}`

## 5. Auth0 (if enabled)

In Auth0 → Application → Settings, add your Amplify URL:

- **Allowed Callback URLs:** `https://main.xxxxx.amplifyapp.com`
- **Allowed Logout URLs:** `https://main.xxxxx.amplifyapp.com`
- **Allowed Web Origins:** `https://main.xxxxx.amplifyapp.com`

Repeat for a custom domain after you attach one.

## 6. Custom domain (optional)

Amplify → **Hosting** → **Custom domains** → add `app.yourdomain.com`.

Update Auth0 URLs and `VITE_API_URL` if the API also uses a custom domain, then **redeploy** Amplify.

## 7. Deploy

Save the app → Amplify runs:

```bash
npm ci --ignore-scripts
npm run build:local
```

Artifacts are published from `dist/`.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| API calls go to wrong host | Set `VITE_API_URL` and redeploy |
| `/app/query` returns 404 | Confirm `_redirects` or Amplify rewrite rule |
| Build installs server DB drivers / fails | Use `amplify.yml` as committed (`--ignore-scripts`, `build:local`) |
| Auth0 redirect error | Add exact Amplify URL to Auth0 app settings |

## Monorepo note

Only the **frontend** is built on Amplify. For a single AWS URL that serves both UI and API, use App Runner / Elastic Beanstalk with `node server/index.js` (the server already serves `dist/`) instead of Amplify alone.
