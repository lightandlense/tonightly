import { beforeEach, describe, expect, it } from 'vitest'
import type { Title } from '../tmdb'
import { closeDetail, listSlice, openDetail, showInHero, toggleInList, uiSlice } from './slices'
import { makeStore } from './store'

const title = (id: number, type: Title['type'] = 'movie'): Title => ({ id, type, name: `T${id}`, year: '2020', rating: 7, overview: '', poster: '/p.jpg', backdrop: null })

describe('list slice', () => {
  it('adds to the front and removes on a second toggle', () => {
    let s = listSlice.reducer([title(1)], toggleInList(title(2)))
    expect(s.map((t) => t.id)).toEqual([2, 1])
    s = listSlice.reducer(s, toggleInList(title(1)))
    expect(s.map((t) => t.id)).toEqual([2])
  })

  it('treats a movie and a show with the same id as different titles', () => {
    const s = listSlice.reducer([title(1, 'movie')], toggleInList(title(1, 'tv')))
    expect(s).toHaveLength(2)
  })
})

describe('ui slice', () => {
  it('opens and closes the detail page and remembers which card to return to', () => {
    let s = uiSlice.reducer(undefined, openDetail({ title: title(5), returnKey: 'card-x' }))
    expect(s.detail).toEqual({ type: 'movie', id: 5 })
    s = uiSlice.reducer(s, closeDetail())
    expect(s).toMatchObject({ detail: null, returnKey: 'card-x' })
  })

  it('shows the focused title in the hero', () => {
    expect(uiSlice.reducer(undefined, showInHero(title(9))).hero?.id).toBe(9)
  })
})

describe('My list persistence', () => {
  const mem = new Map<string, string>()
  beforeEach(() => {
    mem.clear()
    Object.assign(globalThis, {
      localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) },
    })
  })

  it('saves changes and loads them in a new store', () => {
    makeStore().dispatch(toggleInList(title(3)))
    expect(makeStore().getState().list.map((t) => t.id)).toEqual([3])
  })

  it('starts empty when storage holds junk or throws', () => {
    mem.set('tonightly:my-list', '{not json')
    expect(makeStore().getState().list).toEqual([])
    Object.assign(globalThis, { localStorage: { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } } })
    const store = makeStore()
    expect(() => store.dispatch(toggleInList(title(4)))).not.toThrow()
  })
})
