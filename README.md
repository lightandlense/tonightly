# Tonightly

A TV-style "what should I watch tonight" prototype. You browse with the arrow keys like a TV remote, and ask a conversational assistant built on AWS Bedrock (Claude) for picks by typing or talking.

Live at https://tonightly.lightandlense.com. Case study: [docs/case-study.md](docs/case-study.md).

## Evals

30 golden conversations, graded by Claude Sonnet 4.6 with a written rubric, with the judge checked against hand scores (5 of 10 exact, 8 of 10 within 1 point). Each version run 3 times:

| | v1 | v3 (live) |
|---|---|---|
| Overall (1 to 5) | 4.24 | 4.53 |
| Hallucination bait | 3.47 | 4.33 |
| Failed conversations per run | about 4 | about 1 |

Repair and multi-turn memory didn't improve; details and next steps are in the case study. Run it with `node evals/run.mjs --prompt prompts/system-v3.md`.

## Run it

1. Get a free TMDB API Read Access Token and put it in `.env.local`:

       TMDB_READ_TOKEN=your-token

   The token is only used server-side. It never reaches the browser.
2. For the assistant, set up an AWS CLI profile named `tonightly` with Bedrock access in us-east-2 (`aws configure --profile tonightly`). Set `AWS_PROFILE` in `.env.local` to use a different one.
3. `npm install`
4. `npm run dev` and open http://localhost:5173

Arrow keys move, Enter opens, Escape or Backspace goes back. The mouse works too. Press `/` (or Ask Tonightly) to talk to the assistant.

## How the assistant works

- `prompts/system-v3.md`: the live instructions (voice, at most 3 picks, one clarifying question when vague, recovering from corrections, admitting when it can't find something).
- `server/tools.ts`: tools that search TMDB (`search_titles`, `discover_titles`, `similar_to`, `get_title`) and one UI action, `show_picks`.
- `server/assistant.ts`: the Bedrock Converse loop. Grounding check: a pick only reaches the screen if a tool returned that title in this conversation, so the assistant can't show a title it made up.
- `server/handler.ts`: `POST /api/chat` with input limits, a per-chat turn cap and a kill switch (`KILL_SWITCH=1`).
- Picks show in the chat and as a "For tonight" row on home. The assistant can also open a title's page.

## Tests

- `npm test`: unit tests (TMDB mapping, Redux slices, My list storage, the assistant loop and grounding with a fake model, request handling)
- `npm run e2e`: Playwright drives the app with the keyboard only, against a fake TMDB and a fake assistant

## Stack

React, TypeScript, Vite, Redux Toolkit (with RTK Query), Motion, Norigin Spatial Navigation, AWS Bedrock (Claude Haiku 4.5) via the Converse API.

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data from JustWatch via TMDB.
