// TMDB data shapes and the mappers that turn raw API results into the app's Title and Detail.

export type MediaType = 'movie' | 'tv'

export interface Title {
  id: number
  type: MediaType
  name: string
  year: string
  rating: number
  overview: string
  poster: string | null
  backdrop: string | null
}

export interface Provider {
  name: string
  logo: string | null
}

export interface Detail extends Title {
  tagline: string
  genres: string[]
  length: string
  trailerKey: string | null
  providers: Provider[]
}

export interface RawResult {
  id: number
  media_type?: string
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  vote_average?: number
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  adult?: boolean
}

interface RawVideo {
  key: string
  site: string
  type: string
  official?: boolean
}

interface RawProvider {
  provider_name: string
  logo_path: string | null
}

export interface RawDetail extends RawResult {
  tagline?: string
  genres?: { name: string }[]
  runtime?: number | null
  number_of_seasons?: number
  videos?: { results: RawVideo[] }
  'watch/providers'?: { results: Record<string, { flatrate?: RawProvider[]; free?: RawProvider[]; ads?: RawProvider[] }> }
}

export const img = (path: string | null, size = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null

export const titleKey = (t: Pick<Title, 'type' | 'id'>) => `${t.type}-${t.id}`

/** Maps one search/list result. Returns null for people, adult titles and titles without a poster. */
export function toTitle(r: RawResult, fallbackType?: MediaType): Title | null {
  const type = (r.media_type ?? fallbackType) as MediaType | undefined
  if ((type !== 'movie' && type !== 'tv') || r.adult || !r.poster_path) return null
  const date = r.release_date || r.first_air_date || ''
  return {
    id: r.id,
    type,
    name: r.title ?? r.name ?? 'Untitled',
    year: date.slice(0, 4),
    rating: Math.round((r.vote_average ?? 0) * 10) / 10,
    overview: r.overview ?? '',
    poster: r.poster_path,
    backdrop: r.backdrop_path ?? null,
  }
}

/** Maps a list response, dropping unusable and duplicate titles. */
export function toTitles(results: RawResult[], fallbackType?: MediaType): Title[] {
  const seen = new Set<string>()
  const out: Title[] = []
  for (const r of results) {
    const t = toTitle(r, fallbackType)
    if (!t || seen.has(titleKey(t))) continue
    seen.add(titleKey(t))
    out.push(t)
  }
  return out
}

function formatLength(r: RawDetail): string {
  if (r.runtime) return `${Math.floor(r.runtime / 60)}h ${r.runtime % 60}m`.replace(/^0h /, '')
  if (r.number_of_seasons) return `${r.number_of_seasons} season${r.number_of_seasons === 1 ? '' : 's'}`
  return ''
}

function pickTrailer(videos: RawVideo[] = []): string | null {
  const yt = videos.filter((v) => v.site === 'YouTube')
  const best =
    yt.find((v) => v.type === 'Trailer' && v.official) ?? yt.find((v) => v.type === 'Trailer') ?? yt.find((v) => v.type === 'Teaser')
  return best?.key ?? null
}

export function toDetail(r: RawDetail, type: MediaType): Detail | null {
  const base = toTitle({ ...r, media_type: type })
  if (!base) return null
  const us = r['watch/providers']?.results?.US
  const providers = (us?.flatrate ?? us?.free ?? us?.ads ?? []).map((p) => ({ name: p.provider_name, logo: p.logo_path }))
  return {
    ...base,
    tagline: r.tagline ?? '',
    genres: (r.genres ?? []).map((g) => g.name),
    length: formatLength(r),
    trailerKey: pickTrailer(r.videos?.results),
    providers,
  }
}
