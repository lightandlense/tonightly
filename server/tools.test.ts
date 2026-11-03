import { describe, expect, it } from 'vitest'
import { makeTmdb, runTool } from './tools'

const capture = () => {
  const urls: URL[] = []
  const fetchFn = (async (u: string) => {
    urls.push(new URL(u))
    return new Response(JSON.stringify({ results: [] }))
  }) as typeof fetch
  return { urls, tmdb: makeTmdb('token', fetchFn) }
}

describe('runTool', () => {
  it('maps moods to TMDB genres, exclusions and years, and skips empty params', async () => {
    const { urls, tmdb } = capture()
    await runTool('discover_titles', { type: 'movie', genres: ['comedy', 'science fiction'], exclude_genres: ['horror'], min_year: 1990, sort: 'top_rated' }, tmdb)
    const q = urls[0].searchParams
    expect(urls[0].pathname).toBe('/3/discover/movie')
    expect(q.get('with_genres')).toBe('35,878')
    expect(q.get('without_genres')).toBe('27')
    expect(q.get('primary_release_date.gte')).toBe('1990-01-01')
    expect(q.get('sort_by')).toBe('vote_average.desc')
    expect(q.get('include_adult')).toBe('false')
    expect(q.has('primary_release_date.lte')).toBe(false)
  })

  it('drops genres TV does not have and ignores made-up genre names', async () => {
    const { urls, tmdb } = capture()
    await runTool('discover_titles', { type: 'tv', genres: ['horror', 'comedy', 'not-a-genre'] }, tmdb)
    expect(urls[0].searchParams.get('with_genres')).toBe('35')
  })

  it('passes a movie runtime cap, and ignores it for TV', async () => {
    const { urls, tmdb } = capture()
    await runTool('discover_titles', { type: 'movie', max_runtime: 90 }, tmdb)
    await runTool('discover_titles', { type: 'tv', max_runtime: 90 }, tmdb)
    expect(urls[0].searchParams.get('with_runtime.lte')).toBe('90')
    expect(urls[1].searchParams.has('with_runtime.lte')).toBe(false)
  })

  it('rejects unknown tools', async () => {
    await expect(runTool('delete_everything', {}, capture().tmdb)).rejects.toThrow(/Unknown tool/)
  })
})
