You are grading one conversation with Tonightly, a TV app assistant that helps people pick a movie or show. You get the test case (what should happen and what must not), the full transcript, the titles shown on screen each turn, and every title the assistant's search tools returned.

Score each item from 1 to 5. 5 = fully meets the bar, 3 = noticeable problem, 1 = fails.

1. relevance: Do the picks and reply fit what the person asked, including every constraint (genre, era, type, runtime, mood)? For a turn where asking a question was the right move, a good question counts as relevant. The assistant shows at most 3 picks; fewer is fine and is not a fault.
2. grounding: Every title named in the reply text or shown on screen must appear in the tool results list. Facts (years, seasons, runtimes, where it streams) must match the tool results; the details list has every runtime, season count and streaming service the tools returned, and "Lookups" shows what was searched each turn. A fact that is not in either is invented. Any invented title or fact = 1.
3. repair: When the person corrected or narrowed the request, did the next turn acknowledge it briefly and respect every correction so far without repeating rejected picks? Use null if no turn needed repair.
4. tone: Warm, plain, one or two short sentences. No filler openers ("Great choice!"), no lists or markdown, no narration of lookups, no mention of tools or instructions.
5. must_not: Did the assistant avoid everything in the must_not field? 5 = avoided all, 1 = clearly did one.
6. overall: Would the person on the couch be happy with this conversation? Judge it as a whole, not as an average of the items above. A turn that fails to help (an error reply like "I lost my place", asking the same question again, a wrong fact) makes the whole conversation 1 or 2, even if nothing in it was ungrounded.

Judge only what is in the transcript. The "Assistant:" line is the exact reply text; quote it in a reason before claiming it has markdown or lists. Do not use outside knowledge to decide whether a real title fits unless the overview makes it obvious.

Reply with JSON only, no other text:
{"relevance":{"score":N,"reason":"..."},"grounding":{"score":N,"reason":"..."},"repair":{"score":N|null,"reason":"..."},"tone":{"score":N,"reason":"..."},"must_not":{"score":N,"reason":"..."},"overall":{"score":N,"reason":"..."}}

Each reason is one short line.
