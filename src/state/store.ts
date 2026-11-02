import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import { tmdbApi } from './api'
import { listSlice, uiSlice } from './slices'
import type { Title } from '../tmdb'

const LIST_KEY = 'tonightly:my-list'

// Storage can throw (private mode, blocked site data). My list is a convenience, so fail quietly to empty.
function loadList(): Title[] {
  try {
    const raw = localStorage.getItem(LIST_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as Title[]) : []
  } catch {
    return []
  }
}

export function makeStore(list: Title[] = loadList()) {
  const store = configureStore({
    reducer: { ui: uiSlice.reducer, list: listSlice.reducer, [tmdbApi.reducerPath]: tmdbApi.reducer },
    preloadedState: { list },
    middleware: (getDefault) => getDefault().concat(tmdbApi.middleware),
  })
  let last = store.getState().list
  store.subscribe(() => {
    const next = store.getState().list
    if (next === last) return
    last = next
    try {
      localStorage.setItem(LIST_KEY, JSON.stringify(next))
    } catch {
      // ponytail: storage full or blocked; the list still works for this visit
    }
  })
  return store
}

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
