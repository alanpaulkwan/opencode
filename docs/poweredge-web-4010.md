# Poweredge OpenCode web on :4010

This fork’s test UI (whisper / archive / mobile chrome) listens only on the
Tailscale IPv4 address, port **4010**. Production stock OpenCode stays on
**:4003** and must not be restarted for this work.

## Open this URL

```
https://poweredge.tail17f01.ts.net
```

No port. Same basic-auth login as the :4003 UI. Phone or laptop must be on the
same Tailscale tailnet, with Tailscale connected, and **without** an HTTP proxy
for `*.ts.net`.

That hostname is HTTPS because Tailscale Serve terminates TLS on **443**
(Let’s Encrypt) and proxies to `http://100.77.34.92:4010`.

## Multiple apps on the same hostname

Yes. Tailscale Serve can mount **path prefixes** on the same certificate:

```bash
# more specific paths first; `/` is the catch-all
tailscale serve --bg --https=443 /other http://100.77.34.92:OTHER
tailscale serve --bg --https=443 /      http://100.77.34.92:4010
```

Right now **only** `/` is registered, so the entire host is OpenCode. Adding
another prefix (for example `/4003`) would share the same HTTPS name without
Funnel. Client-side OpenCode routes still live under `/`; pick prefixes that
do not collide with the SPA (`/voice` is already used by this instance).

## Why `https://poweredge:4010` does not work

Two separate failures, both expected:

1. **Port 4010 speaks HTTP, not TLS.** Typing `https://` starts a TLS handshake.
   The bun process on 4010 answers with plain HTTP (`wrong version number`).
2. **The certificate name is only the MagicDNS FQDN.** Let’s Encrypt issued
   `CN=poweredge.tail17f01.ts.net`. Short name `poweredge` is not on the cert, so
   even `https://poweredge/` (implied 443) fails the handshake.

`http://poweredge:4010` can reach the page on the tailnet, but the browser does
not treat that as a secure context, so **getUserMedia / microphone stays
blocked**.

Do not use `https://poweredge.tail17f01.ts.net:8443`. That mixes MagicDNS with
the optional self-signed bun proxy on **8443**. Chrome then often reports
`ERR_TUNNEL_CONNECTION_FAILED` because the system HTTP proxy cannot CONNECT
into the tailnet.

## Voice dictation

1. Open `https://poweredge.tail17f01.ts.net` and a session so the composer shows.
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
| Model | **tiny** |
| Compute | int8 on CPU |
| Process | `python app.py --port 7003 --host 127.0.0.1 --model tiny --compute int8` |

`run.sh` defaults to `small` if you restart the sidecar without `VOICE_MODEL`.
The live process was started with `--model tiny`.

Cloud STT is wired but **not ready** on this instance (no ElevenLabs / Deepgram
/ OpenRouter keys in the 4010 process). If those keys are added later, auto
order is local → ElevenLabs `scribe_v2` → Deepgram `nova-3` → OpenRouter
`nvidia/nemotron-3.5-asr-streaming-multilingual-0.6b`.

Tiny is the smallest Whisper checkpoint. It is fast and will miss words more
often than `small` / `distil-large-v3`. Swap live without restarting OpenCode:

```bash
curl -X POST http://127.0.0.1:7003/reload \
  -H 'Content-Type: application/json' \
  -d '{"model":"small","compute_type":"int8"}'
```

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
| Mobile toolbar / tab reflow | Yes | No |
| Tool-result images, PDF/notebook preview, workspace terminals | Yes (this fork) | Not in that binary |
| Tiled pane manager | Removed (blocked New session) | Never had it |

## Ops notes

- Bind only `100.77.34.92` (Tailscale IPv4). Not LAN, not localhost, not Funnel.
- Launch: `/tmp/opencode-4010/launch` (GNU screen `opencode-us-4010`).
- HTTPS: `tailscale serve --bg --https=443 http://100.77.34.92:4010` via
  `/tmp/opencode-4010/enable-https.sh`. Never `tailscale funnel`.
- After UI source changes: `bun run build` in `packages/app`, then
  `bun /tmp/opencode-4010/regen-embed.ts`, then restart **only** the 4010 screen
  session. A partial vite dist with no `index.html` makes `/` return
  `{"error":"Not Found"}`.
