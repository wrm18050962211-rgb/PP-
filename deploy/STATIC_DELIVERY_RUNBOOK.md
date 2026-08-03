# Static delivery preparation

This runbook prepares the website and Admin static bundles without claiming that `EXT-DOMAIN-1`, `WIN-DELIVERY-1`, or `WIN-ADMIN-1` is complete.

## Current external blockers

- ICP filing is still a draft and public access to the API/Admin hostnames is blocked.
- API HTTPS cannot currently pass the ACME renewal dry-run.
- Admin has no independent certificate.
- The apex domain has no active website record or usable TLS.
- Registrar auto-renew is off.
- `payment.html` remains a draft until the payment provider, merchant details, and legal wording are approved.

Do not request certificates repeatedly while the HTTP challenge is blocked. Do not publish secrets, server credentials, database URLs, or certificate private keys in Git or release artifacts.

## Immutable artifacts

CI builds two separate artifacts named with the full Git commit SHA:

- `still-admin-<sha>` from `pp-app/dist-admin`
- `still-website-<sha>` from the static `website` files

Each artifact contains `release.json` with `component`, full `commitSha`, UTC `buildTime`, and the latest database migration filename. Release directories are immutable:

```text
/opt/still-admin/releases/<sha>/
/opt/still-admin/current -> releases/<sha>
/opt/still-website/releases/<sha>/
/opt/still-website/current -> releases/<sha>
```

Upload and extract a reviewed artifact into its SHA directory. Never edit files inside a release directory. Switch only after `release.json` matches the requested SHA:

```bash
sudo bash deploy/switch-static-release.sh admin <full-sha>
sudo bash deploy/switch-static-release.sh website <full-sha>
```

The switch script validates Nginx, updates the `current` symlink atomically, probes the local virtual host, and restores the previous symlink on failure.

## Admin cutover

1. Build with the production API origin and mock/test switches disabled.
2. Extract the Admin artifact under `/opt/still-admin/releases/<sha>`.
3. Install `deploy/nginx-still-admin.conf` only as the reviewed HTTP bootstrap.
4. After ICP access is released, confirm `http://admin.weareinframe.com/.well-known/acme-challenge/...` is externally reachable.
5. Then request the independent certificate: `certbot --nginx -d admin.weareinframe.com --redirect`.
6. Validate HTTPS, `release.json`, Admin login separation, public-token denial, Admin-token public API denial, and audit records.

The Admin hostname and build artifact are separate from the mobile bundle. This preparation does not complete `WIN-ADMIN-1`; its production HTTPS and permission acceptance still require external access and live verification.

## Apex domain decision

Choose exactly one option before changing DNS.

### Option A: Cloudflare Pages custom domain (recommended when www already uses Pages)

1. Add `weareinframe.com` as a custom domain on the same reviewed Pages project as `www.weareinframe.com`.
2. Wait until the apex custom domain and managed certificate are active.
3. Add a Cloudflare redirect rule whose condition is `http.host eq "weareinframe.com"` and whose target preserves path/query on `https://www.weareinframe.com`.
4. Verify the apex and www certificates separately and confirm there is no redirect loop.

### Option B: server-side apex redirect

1. Point only the apex A/AAAA record to the intended web redirect host. Do not move www or API/Admin records as a side effect.
2. Install `deploy/nginx-still-root-redirect.conf` and verify the HTTP ACME challenge externally.
3. Request the apex certificate: `certbot --nginx -d weareinframe.com --redirect`.
4. Confirm HTTPS apex requests return one 301 to the same path/query on www.

## Required external acceptance

After ICP release and DNS propagation, record non-sensitive results for:

- `https://weareinframe.com/` redirect target and TLS result
- `https://www.weareinframe.com/payment.html` HTTP 200 and approved content version
- `https://api.weareinframe.com/api/health` and `/api/ops/launch-check`
- `https://admin.weareinframe.com/` and its independent certificate
- certificate expiry plus `certbot renew --dry-run`
- registrar auto-renew and 30/14/7-day expiry reminders
- desktop and real-device checks for website, policy URLs, API, and Admin

Only after all evidence is complete may the Windows Roadmap writer update `EXT-DOMAIN-1` to completed and resume final `WIN-DELIVERY-1`/`WIN-ADMIN-1` acceptance.
