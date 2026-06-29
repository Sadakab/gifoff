# GifPop

Jackbox-style GIF party game. Players join on their phones, submit GIFs to match a prompt, and a rotating judge picks the winner.

## Running locally

You need two processes running at the same time:

```bash
# Option A — one command (recommended)
npm run dev:all

# Option B — two terminals
npm run party   # PartyKit dev server → localhost:1999
npm run dev     # Next.js → localhost:3000
```

Then open:
- **TV view** (big screen): `http://localhost:3000/tv/TEST`
- **Phone view** (players): `http://localhost:3000` → Create or Join room `TEST`

## Testing with multiple "players" on one machine

All tabs at the same origin share `localStorage`, which is where the `playerId` lives. If you open three tabs to simulate three players, they'll all see themselves as the *same* player reconnecting — only one player will ever appear in the lobby.

**Use separate browser contexts instead:**
- Chrome + Firefox + Safari simultaneously
- Or multiple incognito/private windows (each gets isolated storage)
- Or Chrome profiles

## Environment

Copy `.env.local.example` to `.env.local` (or just edit `.env.local` directly):

```
NEXT_PUBLIC_PARTYKIT_HOST=localhost:1999   # local dev
NEXT_PUBLIC_KLIPY_API_KEY=                # add after getting key at klipy.com/developers
```

## Build order

- [x] Step 1 — PartyKit state machine + Next.js routes (mock GIF placeholders)
- [ ] Step 2 — Klipy integration (real GIF hands)
- [ ] Step 3 — Phone UI polish
- [ ] Step 4 — TV UI polish
- [ ] Step 5 — Edge cases (disconnect, host leave, judge drop, <3 players mid-round)

## Deploying

```bash
# Frontend → Vercel
vercel deploy

# PartyKit room → Cloudflare
npx partykit deploy
```

Update `NEXT_PUBLIC_PARTYKIT_HOST` in your Vercel env vars to the deployed PartyKit host after deployment.
