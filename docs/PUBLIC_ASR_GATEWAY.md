# Public ASR Gateway

Kemo live browser or system audio capture needs a public websocket gateway when the app is opened from an internet URL.

The browser sends audio chunks to:

```text
KEMO_ASR_GATEWAY_PUBLIC_WS_URL=wss://<public-host>/browser
```

The gateway process then forwards audio to DashScope realtime ASR.

## Local Public Tunnel

Start the local ASR gateway and expose it with Cloudflare Tunnel:

```powershell
npm run asr:gateway:public
```

The script:

- starts `npm run asr:gateway` on `KEMO_ASR_GATEWAY_HOST:KEMO_ASR_GATEWAY_PORT`
- starts Cloudflare Tunnel to that local gateway
- writes `KEMO_ASR_GATEWAY_PUBLIC_WS_URL` into `.env.local`
- prints the public `wss://.../browser` URL

Verify:

```powershell
npm run asr:gateway:verify
```

If `.env.local` changed, restart Next.js or redeploy the production app so server code returns the new websocket URL.

## Production Setup

For production, use a named Cloudflare Tunnel or another long-running websocket host. Quick `trycloudflare.com` URLs are useful for testing but are not stable production infrastructure.

Required production env:

```env
KEMO_ASR_GATEWAY_HOST=127.0.0.1
KEMO_ASR_GATEWAY_PORT=43119
KEMO_ASR_GATEWAY_PUBLIC_WS_URL=wss://asr.your-domain.com/browser
KEMO_ASR_GATEWAY_TOKEN_SECRET=<stable random secret>
```

The same token secret must be available to both the Next.js server and the gateway process.
