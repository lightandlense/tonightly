import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { toDetail, toTitles, type Detail, type MediaType, type RawDetail, type RawResult, type Title } from '../tmdb'

export interface Row {
  id: string
  label: string
  titles: Title[]
}

interface RowSource {
  id: string
  label: string
  path: string
  type?: MediaType
  params?: Record<string, string>
}

// Russell's 5 favorites seed the "Because you liked" rows (TMDB ids checked 2026-11-01).
const because = (id: string, label: string, movieId: number): RowSource => ({
  id,
  label: `Because you liked ${label}`,
  path: `/movie/${movieId}/recommendations`,
  type: 'movie',
})

export const ROW_SOURCES: RowSource[] = [
  { id: 'trending', label: 'Trending this week', path: '/trending/all/week' },
  because('because-your-name', 'Your Name', 372058),
  { id: 'comedies', label: 'Comedies', path: '/discover/movie', type: 'movie', params: { with_genres: '35', sort_by: 'popularity.desc' } },
  because('because-eeaao', 'Everything Everywhere All at Once', 545611),
  { id: 'shows', label: 'Popular shows', path: '/tv/popular', type: 'tv' },
  because('because-hot-rod', 'Hot Rod', 10074),
  because('because-la-la-land', 'La La Land', 313369),
  because('because-other-guys', 'The Other Guys', 27581),
]

const BASE_PARAMS = { include_adult: 'false', language: 'en-US' }

const qs = (params: Record<string, string> = {}) => new URLSearchParams({ ...BASE_PARAMS, ...params }).toString()

export const tmdbApi = createApi({
  reducerPath: 'tmdb',
  baseQuery: fetchBaseQuery({ baseUrl: '/api/tmdb' }),
  endpoints: (build) => ({
    homeRows: build.query<Row[], void>({
      // One query for the whole home screen. A failed row is dropped instead of failing the page.
      async queryFn(_arg, _api, _extra, baseQuery) {
        const results = await Promise.all(
          ROW_SOURCES.map(async (src): Promise<Row | null> => {
            const res = await baseQuery(`${src.path}?${qs(src.params)}`)
            if (res.error) return null
            const titles = toTitles((res.data as { results: RawResult[] }).results ?? [], src.type)
            return titles.length ? { id: src.id, label: src.label, titles } : null
          }),
        )
        const rows = results.filter((r): r is Row => r !== null)
        return rows.length ? { data: rows } : { error: { status: 'CUSTOM_ERROR', error: 'Could not load titles.' } }
      },
    }),
    detail: build.query<Detail, { type: MediaType; id: number }>({
      query: ({ type, id }) => `/${type}/${id}?${qs({ append_to_response: 'videos,watch/providers' })}`,
      transformResponse: (raw: RawDetail, _meta, { type }) => {
        const d = toDetail(raw, type)
        if (!d) throw new Error('Title not available')
        return d
      },
    }),
  }),
})

export const { useHomeRowsQuery, useDetailQuery } = tmdbApi
