import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('./dynamo', () => ({ makeDynamo: () => ({ sessions: { get: async () => undefined, put: async () => {} }, limit: async () => null }) }))
vi.mock('./bedrock', () => ({
  makeConverse: () => async () => ({ stopReason: 'end_turn', output: { message: { role: 'assistant', content: [{ text: 'Hi.' }] } } }),
}))

type Handler = typeof import('./lambda').handler
let handler: Handler
const fetchMock = vi.fn(async () => new Response('{"results":[]}', { status: 200 }))

beforeAll(async () => {
  Object.assign(process.env, { TMDB_READ_TOKEN: 'tok', TABLE_NAME: 't', ORIGIN_SECRET: 'secret' })
  vi.stubGlobal('fetch', fetchMock)
  handler = (await import('./lambda')).handler
})

const event = (rawPath: string, over: Record<string, unknown> = {}) => ({
  rawPath,
  rawQueryString: 'language=en-US',
  headers: { 'x-origin-verify': 'secret', 'cloudfront-viewer-address': '203.0.113.9:4431' } as Record<string, string | undefined>,
  isBase64Encoded: false,
  requestContext: { http: { method: 'GET', sourceIp: '1.1.1.1' } },
  ...over,
})

describe('lambda', () => {
  it('rejects calls that did not come through CloudFront', async () => {
    expect((await handler(event('/api/chat', { headers: {} }))).statusCode).toBe(403)
    expect((await handler(event('/api/chat', { headers: { 'x-origin-verify': 'wrong' } }))).statusCode).toBe(403)
  })

  it('proxies only the TMDB paths the app uses, with the token added server-side', async () => {
    expect((await handler(event('/api/tmdb/movie/10074'))).statusCode).toBe(200)
    expect(fetchMock).toHaveBeenLastCalledWith('https://api.themoviedb.org/3/movie/10074?language=en-US', { headers: { Authorization: 'Bearer tok' } })
    for (const p of ['/api/tmdb/account', '/api/tmdb/movie/1/../../account', '/api/tmdb/search/multi', '/api/tmdb/movie/abc']) {
      expect((await handler(event(p))).statusCode, p).toBe(404)
    }
  })

  it('answers chat POSTs and rejects bad bodies', async () => {
    const post = (body: string) => event('/api/chat', { body, requestContext: { http: { method: 'POST', sourceIp: '1.1.1.1' } } })
    const ok = await handler(post(JSON.stringify({ sessionId: 'session-1', message: 'hi' })))
    expect(ok.statusCode).toBe(200)
    expect(JSON.parse(ok.body)).toMatchObject({ ok: true, data: { reply: 'Hi.' } })
    expect((await handler(post('{not json'))).statusCode).toBe(400)
    expect((await handler(post('x'.repeat(10_001)))).statusCode).toBe(413)
  })
})
