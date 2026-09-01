# Poweredge OpenCode web on :4010

This fork’s test UI (whisper / archive / mobile chrome) is the **4010**
instance. Production stock OpenCode stays on **:4003** and must not be
restarted for this work.

## Open this URL

```
https://poweredge.tail17f01.ts.net:4010
```

Same basic-auth login as the :4003 UI. Phone or laptop must be on the same
Tailscale tailnet, with Tailscale connected, and **without** an HTTP proxy for
`*.ts.net`.

That URL is HTTPS because Tailscale Serve terminates TLS on **4010** (Let’s
Encrypt for `poweredge.tail17f01.ts.net`) and proxies to
`http://127.0.0.1:4010`. The bun process binds loopback only so Tailscale can
own the tailnet address on port 4010.

Bare `https://poweredge.tail17f01.ts.net` (port 443) is no longer this UI. It
returns a one-line pointer to `:4010`, and 443 is free for another app.

## Multiple apps on the same hostname

Yes. Use **separate HTTPS ports**, not path prefixes, for a second OpenCode
(the SPA loads `/assets` from the host root).

```bash
tailscale serve --bg --https=4010 http://127.0.0.1:4010
# example: stock UI on another TLS port
# tailscale serve --bg --https=8443 http://100.77.34.92:4003
```

Path prefixes on one port are fine for non-SPA apps (`/grafana`). Do not mount
this OpenCode under `/4010` on 443.

Serve (tailnet only) can use ports other than 443. Funnel (public internet)
only allows 443, 8443, and 10000 — do not turn Funnel on.

If Chrome still uses an HTTP proxy, `CONNECT` to non-443 `*.ts.net` ports can
fail with `ERR_TUNNEL_CONNECTION_FAILED`. Bypass the proxy for `*.ts.net`.
Phones on Tailscale usually do not have that problem.

## Why `https://poweredge:4010` does not work

The certificate name is only the MagicDNS FQDN. Let’s Encrypt issued
`CN=poweredge.tail17f01.ts.net`. Short name `poweredge` is not on the cert.

Use `https://poweredge.tail17f01.ts.net:4010`, not `https://poweredge:4010`.

Do not use `https://poweredge.tail17f01.ts.net:8443` for this UI. That mixes
MagicDNS with the optional self-signed bun proxy on **8443**.

## Voice dictation

1. Open `https://poweredge.tail17f01.ts.net:4010` and a session so the composer
   shows.
2. Use the microphone button next to the prompt (click to toggle, or hold to
   talk and release).
3. Allow microphone access when the browser asks.
4. Same-origin `POST /voice/transcribe` sends the clip. Auto backend order:
   local faster-whisper sidecar (`127.0.0.1:7003`) → ElevenLabs Scribe v2 →
   Deepgram Nova-3 → OpenRouter ASR. OpenAI-hosted STT is not used.

`GET /voice/health` reports which backends are ready.

## Models in use (checked 2026-08-31)

### Speech-to-text (the mic)

The 4010 instance is on **auto**. Only the local sidecar is ready, so dictation
uses:

| Piece | Value |
|---|---|
| Backend | local faster-whisper at `127.0.0.1:7003` |
| Model | **small** (hot-reloaded 2026-08-31; was `tiny`) |
| Compute | int8 on CPU |

`run.sh` defaults to `small`. The process had been started with `--model tiny`;
that was a launch choice, not a fidelity recommendation. On this Xeon, `small`
int8 is the right CPU default. `tiny` is only for weaker boxes. Swap live:

```bash
curl -X POST http://127.0.0.1:7003/reload \
  -H 'Content-Type: application/json' \
  -d '{"model":"small","compute_type":"int8"}'
```

Cloud STT is wired but **not ready** on this instance (no ElevenLabs / Deepgram
/ OpenRouter keys in the 4010 process). If those keys are added later, auto
order is local → ElevenLabs `scribe_v2` → Deepgram `nova-3` → OpenRouter
`nvidia/nemotron-3.5-asr-streaming-multilingual-0.6b`.

### Chat (the session)

Default model in `~/.config/opencode/opencode.jsonc` is **`openai/gpt-5.6-sol`**,
default agent `build`. The composer can still pick another connected model.
Named subagents in that config: Grok Composer (`xai/grok-composer-2.5-fast`),
Grok Build (`xai/grok-build-0.1`), MiniMax M3, GLM 5.2.

:4003 uses the same config file. The mic path above is **4010-only**.

## What :4010 has that :4003 does not

| | :4010 (this branch) | :4003 (stock `opencode` 1.18.21) |
|---|---|---|
| Mic / dictation and `/voice/*` | Yes | No |
| One-click archive (`time.archived`, not delete) | Yes | No matching header/home buttons |
| Header Fork (opens the `/fork` message picker) | Yes | `/fork` slash + palette only |
| Mobile toolbar / tab reflow | Yes | No |
| Working status in the open session (header + composer) | Yes | Sidebar list only |
| Tool-result images, PDF/notebook preview, workspace terminals | Yes (this fork) | Not in that binary |
| Tiled pane manager | Removed (blocked New session) | Never had it |

## Ops notes

- bun HTTP: `127.0.0.1:4010` only. Tailscale Serve TLS: tailnet `:4010`.
  Not LAN, not Funnel. Production `:4003` stays on `100.77.34.92:4003`.
- Launch: `/tmp/opencode-4010/launch` (GNU screen `opencode-us-4010`).
- HTTPS: `tailscale serve --bg --https=4010 http://127.0.0.1:4010` via
  `/tmp/opencode-4010/enable-https.sh`. Never `tailscale funnel`.
- After UI source changes: `bun run build` in `packages/app`, then
  `bun /tmp/opencode-4010/regen-embed.ts`, then restart **only** the 4010 screen
  session. A partial vite dist with no `index.html` makes `/` return
  `{"error":"Not Found"}`.
