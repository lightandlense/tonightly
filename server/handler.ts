// POST /api/chat. Shared by the Vite dev server now and the Lambda in Phase 3.
import { runTurn, type Converse, type Session } from './assistant'
import type { TmdbGet } from './tools'

export const MAX_MESSAGE = 500
export const MAX_TURNS = 20

export interface SessionStore {
  get(id: string): Promise<Session | undefined>
  put(id: string, s: Session): Promise<void>
}

// ponytail: in-memory sessions for dev; DynamoDB with a 30-day TTL replaces this at deploy.
export function memoryStore(): SessionStore {
  const m = new Map<string, Session>()
  return { get: async (id) => m.get(id), put: async (id, s) => void m.set(id, s) }
}

export interface Deps {
  converse: Converse
  tmdb: TmdbGet
  sessions: SessionStore
  system: string
  /** Turned on with KILL_SWITCH=1 to stop all model calls. */
  disabled?: boolean
  /** Daily usage caps. Returns a message when over, or null. */
  limit?: (ip: string) => Promise<string | null>
}

type Res = { status: number; body: { ok: true; data: unknown } | { ok: false; error: string } }
const fail = (status: number, error: string): Res => ({ status, body: { ok: false, error } })

export async function handleChat(body: unknown, deps: Deps, ip = 'local'): Promise<Res> {
  if (deps.disabled) return fail(503, 'The assistant is resting right now. Browsing still works.')
  const { sessionId, message } = (body ?? {}) as { sessionId?: unknown; message?: unknown }
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(sessionId)) return fail(400, 'Bad session.')
  const text = typeof message === 'string' ? message.trim() : ''
  if (!text) return fail(400, 'Say something first.')
  if (text.length > MAX_MESSAGE) return fail(400, `Keep it under ${MAX_MESSAGE} characters.`)

  try {
    const session = (await deps.sessions.get(sessionId)) ?? { messages: [], seen: {}, turns: 0 }
    if (session.turns >= MAX_TURNS) return fail(429, 'This chat is full. Reload the page to start a new one.')
    const over = await deps.limit?.(ip)
    if (over) return fail(429, over)
    const r = await runTurn({ session, message: text, system: deps.system, converse: deps.converse, tmdb: deps.tmdb })
    await deps.sessions.put(sessionId, r.session)
    if (r.dropped.length) console.warn('grounding dropped', sessionId, r.dropped)
    return { status: 200, body: { ok: true, data: { reply: r.reply, picks: r.picks, open: r.open } } }
  } catch (e) {
    console.error('chat turn failed', sessionId, e)
    return fail(502, 'I could not reach the assistant. Try again in a moment.')
  }
}
