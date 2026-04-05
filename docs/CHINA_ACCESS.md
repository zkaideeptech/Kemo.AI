# Mainland China Access

## Risk statement
Access from Mainland China cannot be guaranteed without ICP. We only provide risk mitigation steps.

## Mitigations
1. Bind a custom domain (avoid long-term dependency on *.vercel.app).
2. Avoid blocked dependencies (e.g., Google Fonts).
3. Optionally use Cloudflare proxy/CDN.

## Cloudflare setup (full steps)
1. Purchase and bind a custom domain.
2. Add the domain to Cloudflare (Full setup).
3. In Vercel, add the domain to the project.
4. Cloudflare DNS: set A/CNAME records to Vercel as instructed.
5. Cloudflare DNS: keep gray cloud until verification passes.
6. After verification, enable orange cloud (proxy).
7. SSL/TLS: set to Full (avoid redirect loops).

