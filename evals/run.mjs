// Eval runner: plays each golden case through the same runTurn the Lambda uses, has a judge model score it,
// and writes evals/results/<label>-<date>.json plus evals/report-<label>-<date>.md.
// Usage: node evals/run.mjs [--prompt prompts/system-v1.md] [--only clear-01,repair-02]
// ponytail: runs locally, not through the live site, so the per-visitor turn caps don't block a full run.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { createServer, loadEnv } from 'vite'

const JUDGE_MODEL = 'us.anthropic.claude-sonnet-4-6'
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : def
}
const promptPath = arg('prompt', 'prompts/system-v1.md')
const only = arg('only', '')?.split(',').filter(Boolean)
// --rejudge evals/results/x.json re-scores saved transcripts with the current rubric, without replaying them.
const rejudge = arg('rejudge', '')
const saved = rejudge ? Object.fromEntries(JSON.parse(readFileSync(rejudge, 'utf8')).results.map((r) => [r.id, r])) : null
// A partial or re-judged run never overwrites a full run's files.
const label = rejudge ? `${basename(rejudge, '.json')}-rejudged` : basename(promptPath, '.md') + (only?.length ? '-partial' : '') + arg('tag', '')
// --server server-v1 replays an older copy of the assistant code (e.g. from git archive) for a fair baseline.
const serverDir = arg('server', 'server')
const date = new Date().toISOString().slice(0, 10)

const env = loadEnv('development', '.', '')
process.env.AWS_PROFILE ??= env.AWS_PROFILE || 'tonightly'
if (!env.TMDB_READ_TOKEN) throw new Error('TMDB_READ_TOKEN missing from .env.local')

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { runTurn } = await vite.ssrLoadModule(`/${serverDir}/assistant.ts`)
const { makeConverse } = await vite.ssrLoadModule('/server/bedrock.ts')
const { makeTmdb } = await vite.ssrLoadModule(`/${serverDir}/tools.ts`)

const system = readFileSync(promptPath, 'utf8')
const rubric = readFileSync('evals/rubric.md', 'utf8')
const converse = makeConverse()
const judgeConverse = makeConverse(JUDGE_MODEL, undefined, 1500)
const tmdb = makeTmdb(env.TMDB_READ_TOKEN)
const cases = readFileSync('evals/goldens.jsonl', 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))
  .filter((c) => !only?.length || only.includes(c.id))

const brief = (t) => `${t.name} (${t.type}, ${t.year ?? '?'})`

async function play(c) {
  let session = { messages: [], seen: {}, turns: 0 }
  const turns = []
  const facts = []
  for (const message of c.turns) {
    const before = session.messages.length
    const r = await runTurn({ session, message, system, converse, tmdb })
    session = r.session
    const added = session.messages.slice(Math.max(0, before - 1)).flatMap((m) => m.content)
    const lookups = added.flatMap((b) => (b.toolUse ? [`${b.toolUse.name} ${JSON.stringify(b.toolUse.input)}`] : []))
    // get_title facts (runtime, seasons, streaming) so the judge can check them, not just title names.
    for (const b of added) {
      const j = b.toolResult?.content?.[0]?.json
      if (j && 'streaming_us' in j && j.results?.[0]) {
        const t = j.results[0]
        facts.push(`${t.name}: ${j.runtime_minutes ? `${j.runtime_minutes} min` : `${j.seasons ?? '?'} seasons`}, genres ${j.genres.join('/')}, streams on ${j.streaming_us.join(', ') || 'nothing listed'}`)
      }
    }
    turns.push({ user: message, reply: r.reply, picks: r.picks.map(brief), open: r.open && brief(r.open), dropped: r.dropped, lookups })
  }
  return { turns, toolTitles: Object.values(session.seen).map(brief), facts: [...new Set(facts)] }
}

async function judge(c, run) {
  const transcript = run.turns
    .map((t, i) => `Turn ${i + 1}\nUser: ${t.user}\nAssistant: ${t.reply}\nLookups: ${t.lookups.join('; ') || 'none'}\nOn screen: ${t.picks.join('; ') || 'none'}${t.open ? `\nOpened: ${t.open}` : ''}`)
    .join('\n\n')
  const text = `Test case: ${c.id} (${c.category}). The conversation has exactly ${run.turns.length} turn(s); judge only those.\nExpected: ${c.expected_behavior}\nmust_not: ${c.must_not}\n\n<transcript>\n${transcript}\n</transcript>\n\nTitles the tools returned:\n${run.toolTitles.join('\n') || 'none'}\n\nDetails the tools returned (runtime, seasons, streaming):\n${run.facts.join('\n') || 'none'}\n\nYou are the grader, not the assistant. Return only the JSON scores.`
  const res = await judgeConverse({ system: [{ text: rubric }], messages: [{ role: 'user', content: [{ text }] }] })
  const raw = res.output.message.content.map((b) => b.text ?? '').join('')
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
  try {
    // The judge sometimes drops the final closing brace.
    return JSON.parse(json.split('{').length > json.split('}').length ? json + '}' : json)
  } catch {
    throw new Error(`Judge returned non-JSON for ${c.id} (stop ${res.stopReason}): ${raw}`)
  }
}

const KEYS = ['relevance', 'grounding', 'repair', 'tone', 'must_not']
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
// The judge's holistic score is the case score: averaging criteria let a non-answer pass on grounding and must_not alone.
const caseScore = (s) => s.overall?.score ?? avg(KEYS.map((k) => s[k]?.score).filter((n) => typeof n === 'number'))
const pick = (r) => {
  if (!r?.turns) throw new Error('no saved transcript')
  return { turns: r.turns, toolTitles: r.toolTitles, facts: r.facts ?? [] }
}

const results = []
for (const c of cases) {
  process.stdout.write(`${c.id} ... `)
  try {
    let run, scores
    for (let attempt = 0; ; attempt++) {
      try {
        run ??= saved ? pick(saved[c.id]) : await play(c)
        scores = await judge(c, run)
        break
      } catch (e) {
        // One retry: after a minute for the 10 requests/min Bedrock quota, or straight away for a malformed judge reply.
        const throttled = /too many requests|throttl/i.test(e.message)
        if (attempt || !(throttled || /non-JSON/.test(e.message))) throw e
        if (throttled) await new Promise((r) => setTimeout(r, 60_000))
      }
    }
    results.push({ ...c, ...run, scores, overall: caseScore(scores) })
    console.log(results.at(-1).overall.toFixed(2))
  } catch (e) {
    // ponytail: a failed case is recorded and skipped, so one throttle or bad judge reply doesn't sink a 15-minute run.
    console.log('ERROR', e.message)
    results.push({ ...c, error: e.message })
  }
}
await vite.close()

mkdirSync('evals/results', { recursive: true })
writeFileSync(`evals/results/${label}-${date}.json`, JSON.stringify({ label, date, judge: JUDGE_MODEL, results }, null, 2))

// Report
const ok = results.filter((r) => !r.error)
const cats = [...new Set(cases.map((c) => c.category))]
const bar = (n) => (n == null ? '' : '█'.repeat(Math.round(n * 4)))
const fmt = (n) => (n == null ? 'n/a' : n.toFixed(2))
const rows = cats.map((cat) => {
  const rs = ok.filter((r) => r.category === cat)
  return { cat, n: rs.length, overall: avg(rs.map((r) => r.overall)), ...Object.fromEntries(KEYS.map((k) => [k, avg(rs.map((r) => r.scores[k]?.score).filter((n) => typeof n === 'number'))])) }
})
const worst = [...ok].sort((a, b) => a.overall - b.overall).slice(0, 5)
const dropped = ok.reduce((n, r) => n + r.turns.reduce((m, t) => m + t.dropped.length, 0), 0)

const md = `# Tonightly eval report: ${label} (${date})

Assistant: Claude Haiku 4.5 on Bedrock. Judge: ${JUDGE_MODEL}. Cases: ${ok.length} scored, ${results.length - ok.length} errored.
Overall: **${fmt(avg(ok.map((r) => r.overall)))} / 5**. Ungrounded titles blocked by the grounding check: ${dropped}.

## By category

| Category | Cases | Overall (holistic) | Relevance | Grounding | Repair | Tone | must_not |
|---|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.cat} | ${r.n} | ${fmt(r.overall)} | ${KEYS.map((k) => fmt(r[k])).join(' | ')} |`).join('\n')}

\`\`\`
${rows.map((r) => `${r.cat.padEnd(14)} ${bar(r.overall).padEnd(20)} ${fmt(r.overall)}`).join('\n')}
\`\`\`

## 5 weakest cases

${worst
  .map(
    (r) => `### ${r.id} (${fmt(r.overall)})
${r.turns.map((t) => `- **User:** ${t.user}\n  **Tonightly:** ${t.reply}\n  On screen: ${t.picks.join('; ') || 'none'}`).join('\n')}

${KEYS.filter((k) => r.scores[k]?.score != null && r.scores[k].score < 5).map((k) => `- ${k} ${r.scores[k].score}: ${r.scores[k].reason}`).join('\n') || '- (all 5s)'}`,
  )
  .join('\n\n')}
${results.some((r) => r.error) ? `\n## Errors\n\n${results.filter((r) => r.error).map((r) => `- ${r.id}: ${r.error}`).join('\n')}\n` : ''}`
writeFileSync(`evals/report-${label}-${date}.md`, md)
console.log(`\nWrote evals/report-${label}-${date}.md`)
