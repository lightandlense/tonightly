import type { Page } from '@playwright/test'

// A fake TMDB so the tests run offline and the same way every time.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

const fakeTitle = (path: string, i: number) => {
  const tv = path.startsWith('/tv')
  const id = Math.abs([...path].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) % 100000) * 100 + i
  return tv
    ? { id, name: `Show ${id}`, first_air_date: '2021-05-01', vote_average: 7.5, overview: 'A fake show.', poster_path: '/p.png', backdrop_path: '/b.png' }
    : { id, media_type: 'movie', title: `Movie ${id}`, release_date: '2019-02-01', vote_average: 6.9, overview: 'A fake movie.', poster_path: '/p.png', backdrop_path: '/b.png' }
}

export async function fakeTmdb(page: Page) {
  await page.route('https://image.tmdb.org/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }))
  await page.route('**/api/tmdb/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/tmdb', '')
    const detail = path.match(/^\/(movie|tv)\/(\d+)$/)
    if (detail) {
      const [, type, id] = detail
      return route.fulfill({
        json: {
          id: Number(id), title: `Movie ${id}`, name: `Show ${id}`, release_date: '2019-02-01', first_air_date: '2021-05-01',
          vote_average: 7, overview: 'Details.', poster_path: '/p.png', backdrop_path: '/b.png', runtime: type === 'movie' ? 101 : null,
          number_of_seasons: type === 'tv' ? 2 : undefined, genres: [{ name: 'Comedy' }], tagline: 'A tagline.',
          videos: { results: [{ key: 'abc123', site: 'YouTube', type: 'Trailer', official: true }] },
          'watch/providers': { results: { US: { flatrate: [{ provider_name: 'Max', logo_path: '/m.png' }] } } },
        },
      })
    }
    return route.fulfill({ json: { results: Array.from({ length: 12 }, (_, i) => fakeTitle(path, i)) } })
  })
  // Trailer iframe: answer with an empty page instead of loading YouTube.
  await page.route('https://www.youtube-nocookie.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html></html>' }))
}
