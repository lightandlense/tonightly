// AWS Lambda entry (Function URL behind CloudFront). Serves POST /api/chat and GET /api/tmdb/*.
import { createHash, timingSafeEqual } from 'node:crypto'
import system from '../prompts/system-v1.md?raw'
import { makeConverse } from './bedrock'
import { makeDynamo } from './dynamo'
import { handleChat, type Deps } from './handler'
import { makeTmdb } from './tools'

interface UrlEvent {
  rawPath: string
  rawQueryString: string
  headers: Record<string, string | undefined>
  body?: string
  isBase64Encoded: boolean
  requestContext: { http: { method: string; sourceIp: string } }
}
interface UrlResult {
  statusCode: number
  headers?: Record<string, string>
  body: string
}

const env = (name: string) => {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

const TOKEN = env('TMDB_READ_TOKEN')
const { sessions, limit } = makeDynamo(env('TABLE_NAME'))
const caps = { perVisitor: Number(process.env.VISITOR_DAILY_TURNS ?? 60), perDay: Number(process.env.SITE_DAILY_TURNS ?? 600) }
const deps: Deps = {
  converse: makeConverse(process.env.BEDROCK_MODEL_ID || undefined, process.env.BEDROCK_REGION || undefined),
  tmdb: makeTmdb(TOKEN),
  sessions,
  system,
  disabled: process.env.KILL_SWITCH === '1',
  limit: (ip) => limit(ip, caps),
}

const json = (statusCode: number, body: unknown, headers: Record<string, string> = {}): UrlResult => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  body: JSON.stringify(body),
})

// CloudFront adds a secret header, so the Function URL is useless if called directly.
const digest = (s: string) => createHash('sha256').update(s).digest()
const fromCloudFront = (h: string | undefined) => !!h && timingSafeEqual(digest(h), digest(env('ORIGIN_SECRET')))

// Only the TMDB endpoints the app uses. Anything else would turn this into an open proxy for the token.
const TMDB_PATH = /^\/api\/tmdb(\/(?:trending\/all\/week|discover\/(?:movie|tv)|tv\/popular|(?:movie|tv)\/\d+(?:\/recommendations)?))$/

async function tmdbProxy(e: UrlEvent): Promise<UrlResult> {
  const m = e.rawPath.match(TMDB_PATH)
  if (!m || e.requestContext.http.method !== 'GET') return json(404, { ok: false, error: 'Not found.' })
  const res = await fetch(`https://api.themoviedb.org/3${m[1]}?${e.rawQueryString}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  return {
    statusCode: res.status,
    headers: { 'content-type': 'application/json', 'cache-control': res.ok ? 'public, max-age=3600' : 'no-store' },
    body: await res.text(),
  }
}

export async function handler(e: UrlEvent): Promise<UrlResult> {
  if (!fromCloudFront(e.headers['x-origin-verify'])) return json(403, { ok: false, error: 'Forbidden.' })
  try {
    if (e.rawPath.startsWith('/api/tmdb/')) return await tmdbProxy(e)
    if (e.rawPath === '/api/chat' && e.requestContext.http.method === 'POST') {
      const raw = e.isBase64Encoded ? Buffer.from(e.body ?? '', 'base64').toString() : (e.body ?? '')
      if (raw.length > 10_000) return json(413, { ok: false, error: 'Too long.' })
      let body: unknown = null
      try {
        body = JSON.parse(raw)
      } catch {
        // handleChat rejects a null body with a 400
      }
      // CloudFront-Viewer-Address is "ip:port" (IPv6 too), so drop the last segment.
      const viewer = e.headers['cloudfront-viewer-address']
      const ip = viewer ? viewer.slice(0, viewer.lastIndexOf(':')) : e.requestContext.http.sourceIp
      const out = await handleChat(body, deps, ip)
      return json(out.status, out.body)
    }
    return json(404, { ok: false, error: 'Not found.' })
  } catch (err) {
    console.error('request failed', e.rawPath, err)
    return json(500, { ok: false, error: 'Something went wrong. Try again.' })
  }
}
