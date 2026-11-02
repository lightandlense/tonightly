# Tonightly

A TV-style "what should I watch tonight" prototype. You browse with the arrow keys like a TV remote, and (coming next) ask a conversational assistant built on AWS Bedrock for picks.

Status: the browse UI is built. The assistant, AWS hosting and the eval report are in progress.

## Run it

1. Get a free TMDB API Read Access Token and put it in `.env.local`:

       TMDB_READ_TOKEN=your-token

   The token is only used by the dev server proxy. It never reaches the browser.
2. `npm install`
3. `npm run dev` and open http://localhost:5173

Arrow keys move, Enter opens, Escape or Backspace goes back. The mouse works too.

## Tests

- `npm test`: unit tests (TMDB mapping, Redux slices, My list storage)
- `npm run e2e`: Playwright drives the app with the keyboard only, against a fake TMDB

## Stack

React, TypeScript, Vite, Redux Toolkit (with RTK Query), Motion, Norigin Spatial Navigation.

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data from JustWatch via TMDB.
