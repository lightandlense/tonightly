import { describe, expect, it } from 'vitest'
import { toDetail, toTitle, toTitles, type RawDetail } from './tmdb'

const movie = { id: 1, media_type: 'movie', title: 'Hot Rod', release_date: '2007-08-03', vote_average: 6.73, poster_path: '/p.jpg', backdrop_path: '/b.jpg', overview: 'Stunts.' }

describe('toTitle', () => {
  it('maps a movie result', () => {
    expect(toTitle(movie)).toEqual({ id: 1, type: 'movie', name: 'Hot Rod', year: '2007', rating: 6.7, overview: 'Stunts.', poster: '/p.jpg', backdrop: '/b.jpg' })
  })

  it('uses the fallback type and TV field names', () => {
    const t = toTitle({ id: 2, name: 'Show', first_air_date: '2020-01-01', poster_path: '/s.jpg' }, 'tv')
    expect(t).toMatchObject({ type: 'tv', name: 'Show', year: '2020', rating: 0 })
  })

  it('drops people, adult titles and titles without a poster', () => {
    expect(toTitle({ id: 3, media_type: 'person', name: 'Andy', poster_path: '/x.jpg' })).toBeNull()
    expect(toTitle({ ...movie, adult: true })).toBeNull()
    expect(toTitle({ ...movie, poster_path: null })).toBeNull()
  })
})

describe('toTitles', () => {
  it('removes duplicates but keeps a movie and a show that share an id', () => {
    const out = toTitles([movie, movie, { ...movie, media_type: 'tv' }])
    expect(out.map((t) => `${t.type}-${t.id}`)).toEqual(['movie-1', 'tv-1'])
  })
})

describe('toDetail', () => {
  const raw: RawDetail = {
    ...movie,
    runtime: 88,
    genres: [{ name: 'Comedy' }],
    videos: {
      results: [
        { key: 'teaser', site: 'YouTube', type: 'Teaser' },
        { key: 'fan', site: 'YouTube', type: 'Trailer' },
        { key: 'official', site: 'YouTube', type: 'Trailer', official: true },
      ],
    },
    'watch/providers': { results: { US: { flatrate: [{ provider_name: 'Max', logo_path: '/m.png' }] } } },
  }

  it('picks the official trailer, US streaming providers and formats runtime', () => {
    const d = toDetail(raw, 'movie')!
    expect(d.trailerKey).toBe('official')
    expect(d.providers).toEqual([{ name: 'Max', logo: '/m.png' }])
    expect(d.length).toBe('1h 28m')
    expect(d.genres).toEqual(['Comedy'])
  })

  it('formats seasons for shows and handles missing trailers and providers', () => {
    const d = toDetail({ ...raw, runtime: null, number_of_seasons: 1, videos: { results: [] }, 'watch/providers': { results: {} } }, 'tv')!
    expect(d).toMatchObject({ length: '1 season', trailerKey: null, providers: [] })
  })

  it('formats short runtimes without hours', () => {
    expect(toDetail({ ...raw, runtime: 45 }, 'movie')!.length).toBe('45m')
  })
})
