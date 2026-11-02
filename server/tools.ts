// The assistant's tools. Search tools call TMDB; show_picks is the one UI action, checked in assistant.ts.
import { toTitle, toTitles, type MediaType, type RawDetail, type RawResult, type Title } from '../src/tmdb'

export type TmdbGet = (path: string, params?: Record<string, string>) => Promise<unknown>

export function makeTmdb(token: string, fetchFn: typeof fetch = fetch): TmdbGet {
  return async (path, params = {}) => {
    const set = Object.entries(params).filter(([, v]) => v !== '')
    const qs = new URLSearchParams([['include_adult', 'false'], ['language', 'en-US'], ...set])
    const res = await fetchFn(`https://api.themoviedb.org/3${path}?${qs}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`)
    return res.json()
  }
}

// TMDB genre ids. TV has no horror, thriller, romance or sci-fi of its own, so those map to the nearest TV genre or drop out.
const GENRES: Record<string, { movie: number; tv?: number }> = {
  action: { movie: 28, tv: 10759 },
  adventure: { movie: 12, tv: 10759 },
  animation: { movie: 16, tv: 16 },
  comedy: { movie: 35, tv: 35 },
  crime: { movie: 80, tv: 80 },
  documentary: { movie: 99, tv: 99 },
  drama: { movie: 18, tv: 18 },
  family: { movie: 10751, tv: 10751 },
  fantasy: { movie: 14, tv: 10765 },
  history: { movie: 36 },
  horror: { movie: 27 },
  music: { movie: 10402 },
  mystery: { movie: 9648, tv: 9648 },
  romance: { movie: 10749 },
  'science fiction': { movie: 878, tv: 10765 },
  thriller: { movie: 53, tv: 80 },
  war: { movie: 10752, tv: 10768 },
  western: { movie: 37, tv: 37 },
}
const GENRE_NAMES = Object.keys(GENRES)

const TYPE = { type: 'string', enum: ['movie', 'tv'] }

export const TOOL_SPECS = [
  {
    toolSpec: {
      name: 'search_titles',
      description: 'Search movies and TV shows by title or keywords. Use for a named title or a theme like "space" or "heist".',
      inputSchema: { json: { type: 'object', properties: { query: { type: 'string' }, type: TYPE }, required: ['query'] } },
    },
  },
  {
    toolSpec: {
      name: 'discover_titles',
      description: 'Find popular or well rated titles by genre and era. Use for moods like "funny", "scary", "feel-good".',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            type: TYPE,
            genres: { type: 'array', items: { type: 'string', enum: GENRE_NAMES }, description: 'All must match.' },
            exclude_genres: { type: 'array', items: { type: 'string', enum: GENRE_NAMES } },
            min_year: { type: 'integer' },
            max_year: { type: 'integer' },
            sort: { type: 'string', enum: ['popular', 'top_rated'] },
          },
          required: ['type'],
        },
      },
    },
  },
  {
    toolSpec: {
      name: 'similar_to',
      description: 'Titles similar to one the person liked. Needs the id and type from an earlier tool result.',
      inputSchema: { json: { type: 'object', properties: { type: TYPE, id: { type: 'integer' } }, required: ['type', 'id'] } },
    },
  },
  {
    toolSpec: {
      name: 'get_title',
      description: 'Details for one title: runtime or seasons, genres, and US streaming services.',
      inputSchema: { json: { type: 'object', properties: { type: TYPE, id: { type: 'integer' } }, required: ['type', 'id'] } },
    },
  },
  {
    toolSpec: {
      name: 'show_picks',
      description: 'Show your recommendations on screen, best first, at most 3. Set open to open one title\'s page when asked.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            picks: { type: 'array', maxItems: 3, items: { type: 'object', properties: { type: TYPE, id: { type: 'integer' } }, required: ['type', 'id'] } },
            open: { type: 'object', properties: { type: TYPE, id: { type: 'integer' } }, required: ['type', 'id'] },
          },
          required: ['picks'],
        },
      },
    },
  },
]

export interface ToolResult {
  titles: Title[]
  /** Extra facts for get_title. */
  extra?: Record<string, unknown>
}

const asType = (v: unknown): MediaType => (v === 'tv' ? 'tv' : 'movie')
const asInt = (v: unknown) => (Number.isInteger(v) ? String(v) : undefined)
const listOf = (v: unknown) => (Array.isArray(v) ? v.filter((g): g is string => typeof g === 'string' && g in GENRES) : [])
const results = (data: unknown) => (data as { results?: RawResult[] }).results ?? []

function genreIds(names: string[], type: MediaType) {
  return [...new Set(names.map((n) => GENRES[n][type]).filter((id) => id !== undefined))].join(',')
}

export async function runTool(name: string, input: Record<string, unknown>, tmdb: TmdbGet): Promise<ToolResult> {
  switch (name) {
    case 'search_titles': {
      const query = String(input.query ?? '').slice(0, 100)
      if (!input.type) return { titles: toTitles(results(await tmdb('/search/multi', { query }))) }
      const type = asType(input.type)
      return { titles: toTitles(results(await tmdb(`/search/${type}`, { query })), type) }
    }
    case 'discover_titles': {
      const type = asType(input.type)
      const dateKey = type === 'movie' ? 'primary_release_date' : 'first_air_date'
      const params: Record<string, string> = {
        sort_by: 'popularity.desc',
        with_genres: genreIds(listOf(input.genres), type),
        without_genres: genreIds(listOf(input.exclude_genres), type).replaceAll(',', '|'),
      }
      if (input.sort === 'top_rated') Object.assign(params, { sort_by: 'vote_average.desc', 'vote_count.gte': '500' })
      const min = asInt(input.min_year)
      const max = asInt(input.max_year)
      if (min) params[`${dateKey}.gte`] = `${min}-01-01`
      if (max) params[`${dateKey}.lte`] = `${max}-12-31`
      return { titles: toTitles(results(await tmdb(`/discover/${type}`, params)), type) }
    }
    case 'similar_to': {
      const type = asType(input.type)
      return { titles: toTitles(results(await tmdb(`/${type}/${Number(input.id)}/recommendations`)), type) }
    }
    case 'get_title': {
      const type = asType(input.type)
      const d = (await tmdb(`/${type}/${Number(input.id)}`, { append_to_response: 'watch/providers' })) as RawDetail
      const t = toTitle(d, type)
      const us = d['watch/providers']?.results?.US
      return {
        titles: t ? [t] : [],
        extra: {
          genres: d.genres?.map((g) => g.name) ?? [],
          runtime_minutes: d.runtime ?? undefined,
          seasons: d.number_of_seasons,
          streaming_us: [...(us?.flatrate ?? []), ...(us?.free ?? []), ...(us?.ads ?? [])].map((p) => p.provider_name),
        },
      }
    }
    default:
      throw new Error(`Unknown tool ${name}`)
  }
}
