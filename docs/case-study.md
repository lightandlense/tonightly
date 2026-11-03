# Tonightly: testing a TV assistant that talks back

Tonightly is a TV-style "what should I watch tonight" prototype. You browse with the arrow keys like a remote, and you can ask an assistant for picks in plain language: "something funny but not dumb", "no, not a musical", "is Inception 2 on Netflix?". The assistant runs on Claude Haiku 4.5 through AWS Bedrock and looks titles up in TMDB with tool calls.

Live: https://tonightly.lightandlense.com. Code: https://github.com/lightandlense/tonightly.

This page is about one question: **how do you know an assistant like this is getting better, and not just different?**

## The problem

A chat assistant on a TV has a few ways to let someone down, and they don't show up in unit tests:

- It names a movie that doesn't exist, or gets a fact wrong ("Fleabag has 6 seasons").
- It ignores part of the request ("under 90 minutes" for a 6 year old, then picks a 97-minute film).
- The person corrects it ("no musicals") and it brings back the same thing.
- It gets stuck and says nothing useful.

Changing the prompt to fix one of these can quietly break another. So before tuning anything, I built a way to measure it.

## How it's built

- **Grounding in code, not just in the prompt.** The model can only put a title on screen if a TMDB lookup returned that title. Anything else is dropped and logged. The model can't show a movie it made up, however confident it is.
- **Tools:** `search_titles`, `discover_titles` (genre, year, runtime filters), `similar_to`, `get_title` (runtime, seasons, where it streams) and `show_picks`.
- **AWS:** S3 and CloudFront for the app, Lambda for `/api/chat`, DynamoDB for chats and limits, all in one SAM template. A per-chat turn cap, daily turn caps per visitor and for the whole site, and a kill switch keep a public demo from running up a bill.

## The eval method

1. **Golden set:** 30 conversations in 6 categories: clear requests, vague requests, repair (the person corrects the assistant), hallucination bait, out of scope, and multi-turn memory. Each case says what should happen and what must not happen.
2. **Judge:** Claude Sonnet 4.6 grades each conversation with a written rubric: relevance, grounding, repair, tone, must_not, and one overall score, "would the person on the couch be happy?". It sees the full transcript plus every title and fact the tools returned, so it can tell a checked fact from an invented one.
3. **Runner:** plays every case through the same code the live site uses and writes a report with category averages and the 5 weakest cases.
4. **Checking the judge against a human:** I scored 10 conversations myself before seeing the judge's scores.
5. **Iterate:** fix the weakest area, run again, keep what helps.
6. **Average:** single runs move about ±0.5 per case, so the final comparison runs each version 3 times.

## Checking the judge first

The first judge agreed with me on 1 of 10 conversations. It was the wrong tool, and fixing it came before fixing the assistant.

What was wrong with it:

- It averaged its 5 scores. A reply like "Sorry, I lost my place" still got 5s for "no invented titles" and "broke no rules", so a complete failure averaged out to about 3.
- It took points off for showing 2 picks instead of 3.
- It claimed replies had markdown when they didn't.
- It couldn't see runtimes or season counts, so it marked correct facts as invented.
- Once it answered as the assistant instead of grading.

After switching to a holistic overall score, giving it the tool facts, and tightening the rubric:

| Judge | Exact match with my scores | Within 1 point |
|---|---|---|
| First version | 1 of 10 | 5 of 10 |
| Final version | **5 of 10** | **8 of 10** |

Where we still disagree: in one case it showed Burlesque after "no musicals" but got the other two picks right. I gave partial credit, and the judge failed the whole conversation. That's a judgment call, and I left the judge stricter.

## What changed between versions

- **Prompt v2:** check facts with `get_title` before stating them, never ask the same question twice, "no X" is a hard filter.
- **Prompt v3:** search again after every correction, and "lighter" or "bittersweet" rules out war, prison and terminal-illness stories.
- **Code fixes:** these did more than the prompt changes.
  1. Added a runtime filter to `discover_titles`. Before, "under 90 minutes" made the model check titles one at a time until it ran out of turns.
  2. The model is told to answer before its last tool round, so a long search still ends in a reply.
  3. Picks have to come from a lookup made in the same turn, so a correction can't reuse old results.

The pattern: when the prompt said "do X" and the model kept not doing it, the fix that stuck was in code.

## Results

Each version run 3 times, same judge. v1 is the original prompt on the original code. v3 is what's live now.

| Category | Cases | v1 | v3 |
|---|---|---|---|
| Clear request | 6 | 4.00 | **4.61** |
| Vague request | 5 | 4.47 | **5.00** |
| Repair | 6 | 4.44 | 4.11 |
| Hallucination bait | 5 | 3.47 | **4.33** |
| Out of scope | 4 | 5.00 | 5.00 |
| Multi-turn memory | 4 | 4.25 | 4.14 |
| **All** | 30 | **4.24** | **4.53** |
| Failed conversations per run | | about 4 | about 1 |

Every v3 run (4.45, 4.60, 4.53) scored above every v1 run (4.20, 4.27, 4.27), so the overall gain is bigger than the run-to-run noise.

### Two examples

**"A short animated movie for my 6 year old, under 90 minutes"**

- v1 (scored 2): recommended The Lion King and Klaus, "both under 90 minutes". Klaus is 97 minutes, and its own lookup said so.
- v3 (scored 5): searched with the runtime filter and offered My Neighbor Totoro, The Boy, the Mole, the Fox and the Horse, and Piper.

**"Is Inception 2 on Netflix?"**

- v1 (scored 2): "I can only help you pick what to watch, not check where specific titles stream." No lookup, and it never said there's no Inception 2.
- v3 (scored 5): searched, then "Inception 2 doesn't exist yet. There's only the original Inception from 2010. Want me to check where that streams?"

## What didn't improve

**Repair and memory.** After one run each, repair looked like it went from 3.50 to 3.83, and I wrote that down. The 3-run averages don't support it: repair is 4.44 vs 4.11, and memory is 4.25 vs 4.14. With 4 to 6 cases per category, one conversation flipping moves the average by about 0.7, so both are ties within the noise. I corrected the write-up.

The repair case that still fails is a three-step correction: "an action movie", then "something less violent", then "and no superheroes". By the third turn the assistant brings back a violent pick from the first turn.

## What I'd do next

1. **Block re-showing titles after a correction**, in code, the same way grounding works, unless the person asks for one by name.
2. **More cases in repair and memory** (10 or more each), so a single conversation can't swing the category.
3. **Check facts in code:** reject a reply that states a runtime or season count when no `get_title` ran that turn. The prompt rule alone doesn't hold.
4. **Give the judge the plot overviews**, so it can check descriptions, not just titles and numbers.

## Files

- Golden set: `evals/goldens.jsonl`
- Rubric: `evals/rubric.md`
- Runner: `evals/run.mjs`
- Prompts: `prompts/system-v1.md` to `system-v3.md`
- Full results and per-run reports: `evals/results/`, `evals/summary-2026-11-03.md`
- My hand scores: `evals/human-scores-v1.json`
