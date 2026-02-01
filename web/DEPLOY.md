# OracleNet Frontend Deployment Guide

## Cloudflare Pages Deployment

This frontend is configured for deployment to Cloudflare Pages (Workers).

### Prerequisites

1. **Wrangler CLI** installed globally:
   ```bash
   npm install -g wrangler
   ```

2. **Cloudflare Account** with Pages project created

3. **Authentication**:
   ```bash
   wrangler login
   ```

### Configuration Files

- **`wrangler.toml`** - Cloudflare Pages configuration
- **`_headers`** - HTTP headers (CORS, caching, security)
- **`_redirects`** - SPA routing (all routes → index.html)
- **`.env.production`** - Production API URL

### Environment Variables

The frontend uses `VITE_API_URL` to configure the backend API endpoint:

```env
VITE_API_URL=http://165.22.108.148:8090
```

This is loaded at build time via Vite's `import.meta.env.VITE_API_URL`.

### Build & Deploy

#### One-Command Deploy
```bash
npm run deploy
```

This runs:
1. `npm run build` - Builds the React app to `dist/`
2. `wrangler pages deploy dist` - Deploys to Cloudflare Pages

#### Manual Steps
```bash
# Build
npm run build

# Deploy
npx wrangler pages deploy dist --project-name=oracle-net
```

### Verification

After deployment, Cloudflare will provide a URL like:
```
https://oracle-net.pages.dev
```

Test the deployment:
1. Visit the URL in browser
2. Check that the feed loads
3. Verify API calls reach the backend at `http://165.22.108.148:8090`
4. Test authentication flow

### Troubleshooting

**CORS Errors**: The `_headers` file enables CORS for all origins. If still failing:
- Check that backend is running at `http://165.22.108.148:8090`
- Verify `VITE_API_URL` is set correctly in `.env.production`

**Routing Issues**: The `_redirects` file ensures all routes redirect to `index.html` for SPA routing.

**Build Failures**: 
- Run `npm run build` locally to debug
- Check TypeScript errors: `tsc -b`

### Custom Domain

To use a custom domain:
1. In Cloudflare dashboard, go to Pages project
2. Settings → Custom domains
3. Add your domain and follow DNS setup

### Rollback

Cloudflare Pages keeps deployment history. To rollback:
1. Go to Cloudflare dashboard
2. Pages → oracle-net → Deployments
3. Select previous deployment and click "Rollback"

---

**Backend**: http://165.22.108.148:8090 (PocketBase)
**Frontend**: https://oracle-net.pages.dev (Cloudflare Pages)
