// One chat turn: call the model, run its tools, repeat until it answers. The grounding check lives here.
import { titleKey, type Title } from '../src/tmdb'
import { runTool, TOOL_SPECS, type TmdbGet } from './tools'

// Shapes match the Bedrock Converse API, so the real client and test fakes are interchangeable.
export type Block =
  | { text: string }
  | { toolUse: { toolUseId: string; name: string; input: Record<string, unknown> } }
  | { toolResult: { toolUseId: string; content: { json: unknown }[]; status?: 'error' } }
export interface Message {
  role: 'user' | 'assistant'
  content: Block[]
}
export interface ConverseInput {
  system: { text: string }[]
  messages: Message[]
  toolConfig: { tools: typeof TOOL_SPECS }
}
export interface ConverseOutput {
  output: { message: Message }
  stopReason: string
}
export type Converse = (input: ConverseInput) => Promise<ConverseOutput>

export interface Session {
  messages: Message[]
  /** Every title a tool returned in this session, by titleKey. The only titles the assistant may show. */
  seen: Record<string, Title>
  turns: number
}

export interface TurnResult {
  reply: string
  picks: Title[]
  open: Title | null
  /** Ids the model tried to show that no tool returned. Logged for evals. */
  dropped: string[]
  session: Session
}

const MAX_ROUNDS = 6
const STUCK = "Sorry, I lost my place there. Could you say that another way?"

const compact = (t: Title) => ({ type: t.type, id: t.id, name: t.name, year: t.year, rating: t.rating, overview: t.overview.slice(0, 160) })

type Ref = { type?: unknown; id?: unknown }
const refKey = (r: Ref) => `${r.type}-${r.id}`

export async function runTurn(opts: { session: Session; message: string; system: string; converse: Converse; tmdb: TmdbGet }): Promise<TurnResult> {
  const seen = { ...opts.session.seen }
  // Picks must come from this turn's lookups, so a correction ("no musicals") always gets a fresh search.
  // Opening a title can still use anything seen earlier ("open the first one").
  const fresh = new Set<string>()
  // Converse needs roles to alternate. A turn that ended on tool results leaves a user message last, so join onto it.
  const prev = opts.session.messages
  const last = prev.at(-1)
  const ask: Block = { text: opts.message }
  const messages: Message[] =
    last?.role === 'user' ? [...prev.slice(0, -1), { role: 'user', content: [...last.content, ask] }] : [...prev, { role: 'user', content: [ask] }]
  let picks: Title[] = []
  let open: Title | null = null
  const dropped: string[] = []
  let said = ''
  let ended = false

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await opts.converse({ system: [{ text: opts.system }], messages, toolConfig: { tools: TOOL_SPECS } })
    const msg = res.output.message
    // The reply is the model's latest text. Earlier text is narration ("Let me check..."), and the model often
    // talks, then calls show_picks, then ends with an empty message.
    const text = msg.content.flatMap((b) => ('text' in b ? [b.text.trim()] : [])).filter(Boolean).join(' ')
    if (text) said = text
    if (msg.content.length) messages.push(msg)
    const uses = msg.content.flatMap((b) => ('toolUse' in b ? [b.toolUse] : []))
    if (res.stopReason !== 'tool_use' || !uses.length) {
      ended = true
      break
    }
    const results = await Promise.all(
      uses.map(async (tu): Promise<Block> => {
        const done = (json: unknown, status?: 'error'): Block => ({ toolResult: { toolUseId: tu.toolUseId, content: [{ json }], ...(status && { status }) } })
        try {
          if (tu.name === 'show_picks') {
            // Grounding: only titles a tool returned this session reach the screen.
            const refs = (Array.isArray(tu.input.picks) ? tu.input.picks : []) as Ref[]
            const bad = refs.map(refKey).filter((k) => !fresh.has(k))
            dropped.push(...bad)
            picks = refs.map((r) => (fresh.has(refKey(r)) ? seen[refKey(r)] : undefined)).filter((t): t is Title => !!t).slice(0, 3)
            const o = tu.input.open as Ref | undefined
            open = o ? (seen[refKey(o)] ?? null) : null
            if (o && !open) dropped.push(refKey(o))
            return done({ shown: picks.map((t) => t.name), rejected: bad.length ? `${bad.join(', ')} not returned by a lookup this turn, not shown. Search again to show it.` : undefined })
          }
          const out = await runTool(tu.name, tu.input, opts.tmdb)
          for (const t of out.titles) {
            seen[titleKey(t)] = t
            fresh.add(titleKey(t))
          }
          return done({ results: out.titles.slice(0, 8).map(compact), ...out.extra })
        } catch (e) {
          console.error('tool failed', tu.name, e)
          return done({ error: 'That lookup failed. Try a different search or tell the person.' }, 'error')
        }
      }),
    )
    // Before the last round, tell the model to stop looking things up, so a long hunt still ends in an answer.
    const last = round === MAX_ROUNDS - 2 ? [{ text: 'No more lookups left this turn. Answer now with what you have.' }] : []
    messages.push({ role: 'user', content: [...results, ...last] })
  }

  const reply = ended ? said : ''
  // A turn that ran out of rounds is dropped so the next turn starts cleanly.
  const clean = reply ? messages : opts.session.messages
  return {
    reply: reply || STUCK,
    picks: reply ? picks : [],
    open: reply ? open : null,
    dropped,
    session: { messages: clean, seen, turns: opts.session.turns + 1 },
  }
}
