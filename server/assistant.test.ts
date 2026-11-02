import { describe, expect, it, vi } from 'vitest'
import { runTurn, type Converse, type ConverseOutput, type Message, type Session } from './assistant'
import { handleChat, memoryStore, MAX_TURNS, type Deps } from './handler'
import type { TmdbGet } from './tools'

const empty = (): Session => ({ messages: [], seen: {}, turns: 0 })
const say = (text: string): ConverseOutput => ({ stopReason: 'end_turn', output: { message: { role: 'assistant', content: [{ text }] } } })
const use = (name: string, input: Record<string, unknown>, id = name): ConverseOutput => ({
  stopReason: 'tool_use',
  output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: id, name, input } }] } },
})
const script = (...steps: ConverseOutput[]): Converse => {
  let i = 0
  return async () => steps[i++] ?? say('done')
}
const space = { id: 1, media_type: 'movie', title: 'Space Ride', release_date: '2001-01-01', vote_average: 7, poster_path: '/p.jpg', overview: 'Up.' }
const tmdb: TmdbGet = async () => ({ results: [space] })
const turn = (converse: Converse, session = empty(), t = tmdb) => runTurn({ session, message: 'a space movie', system: 'sys', converse, tmdb: t })

describe('runTurn', () => {
  it('runs tools, shows grounded picks and keeps the history', async () => {
    const r = await turn(script(use('search_titles', { query: 'space' }), use('show_picks', { picks: [{ type: 'movie', id: 1 }] }), say('Try Space Ride.')))
    expect(r.reply).toBe('Try Space Ride.')
    expect(r.picks.map((t) => t.name)).toEqual(['Space Ride'])
    expect(r.dropped).toEqual([])
    expect(r.session.seen['movie-1']).toBeDefined()
    expect(r.session.messages.map((m: Message) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user', 'assistant'])
  })

  it('replies with the latest text, not narration, even when the model ends with an empty message when the model ends with an empty message, and alternates roles next turn', async () => {
    const talkThenPick: ConverseOutput = {
      stopReason: 'tool_use',
      output: { message: { role: 'assistant', content: [{ text: 'Try Space Ride.' }, { toolUse: { toolUseId: 'p', name: 'show_picks', input: { picks: [{ type: 'movie', id: 1 }] } } }] } },
    }
    const silent: ConverseOutput = { stopReason: 'end_turn', output: { message: { role: 'assistant', content: [] } } }
    const narrate: ConverseOutput = {
      stopReason: 'tool_use',
      output: { message: { role: 'assistant', content: [{ text: 'Let me look.' }, { toolUse: { toolUseId: 's', name: 'search_titles', input: { query: 'space' } } }] } },
    }
    const r = await turn(script(narrate, talkThenPick, silent))
    expect(r.reply).toBe('Try Space Ride.')
    expect(r.picks.map((t) => t.name)).toEqual(['Space Ride'])
    const next = await turn(script(say('Sure.')), r.session)
    const roles = next.session.messages.map((m) => m.role)
    expect(roles.every((role, i) => i === 0 || role !== roles[i - 1])).toBe(true)
  })

  it('drops picks and opens that no tool returned', async () => {
    const r = await turn(script(use('show_picks', { picks: [{ type: 'movie', id: 999 }], open: { type: 'movie', id: 999 } }), say('Here you go.')))
    expect(r.picks).toEqual([])
    expect(r.open).toBeNull()
    expect(r.dropped).toEqual(['movie-999', 'movie-999'])
  })

  it('remembers titles from earlier turns', async () => {
    const first = await turn(script(use('search_titles', { query: 'space' }), say('Found one.')))
    const r = await turn(script(use('show_picks', { picks: [], open: { type: 'movie', id: 1 } }), say('Opening it.')), first.session)
    expect(r.open?.name).toBe('Space Ride')
  })

  it('reports a failed tool to the model instead of crashing', async () => {
    const converse = vi.fn(script(use('search_titles', { query: 'x' }), say('Search is down.')))
    const r = await turn(converse, empty(), async () => {
      throw new Error('TMDB 500')
    })
    expect(r.reply).toBe('Search is down.')
    // The array is shared and grows after the call: [user, assistant toolUse, user toolResult, assistant reply]
    const toolMsg = converse.mock.calls[1][0].messages[2]
    expect(toolMsg.content[0]).toMatchObject({ toolResult: { status: 'error' } })
  })

  it('gives up after too many tool rounds and leaves history untouched', async () => {
    const loop: Converse = async () => use('search_titles', { query: 'again' })
    const r = await turn(loop)
    expect(r.reply).toMatch(/lost my place/)
    expect(r.session.messages).toEqual([])
  })
})

describe('handleChat', () => {
  const deps = (over: Partial<Deps> = {}): Deps => ({ converse: script(say('Hi.')), tmdb, sessions: memoryStore(), system: 'sys', ...over })

  it('validates input', async () => {
    expect((await handleChat({ sessionId: 'x', message: 'hi' }, deps())).status).toBe(400)
    expect((await handleChat({ sessionId: 'session-1', message: '   ' }, deps())).status).toBe(400)
    expect((await handleChat({ sessionId: 'session-1', message: 'a'.repeat(501) }, deps())).status).toBe(400)
    expect((await handleChat(null, deps())).status).toBe(400)
  })

  it('answers, then caps turns per session', async () => {
    const d = deps({ converse: async () => say('Hi.') })
    const ok = await handleChat({ sessionId: 'session-1', message: 'hi' }, d)
    expect(ok).toMatchObject({ status: 200, body: { ok: true, data: { reply: 'Hi.', picks: [] } } })
    for (let i = 1; i < MAX_TURNS; i++) await handleChat({ sessionId: 'session-1', message: 'hi' }, d)
    expect((await handleChat({ sessionId: 'session-1', message: 'hi' }, d)).status).toBe(429)
  })

  it('honors the kill switch and hides model errors', async () => {
    expect((await handleChat({ sessionId: 'session-1', message: 'hi' }, deps({ disabled: true }))).status).toBe(503)
    const broken = deps({ converse: async () => { throw new Error('AccessDenied arn:secret') } })
    const r = await handleChat({ sessionId: 'session-1', message: 'hi' }, broken)
    expect(r.status).toBe(502)
    expect(JSON.stringify(r.body)).not.toMatch(/arn/)
  })
})
