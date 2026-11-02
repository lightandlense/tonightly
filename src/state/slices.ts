import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { titleKey, type MediaType, type Title } from '../tmdb'

export interface UiState {
  hero: Title | null
  detail: { type: MediaType; id: number } | null
  returnKey: string | null
}

const initialUi: UiState = { hero: null, detail: null, returnKey: null }

export const uiSlice = createSlice({
  name: 'ui',
  initialState: initialUi,
  reducers: {
    showInHero: (s, a: PayloadAction<Title>) => {
      s.hero = a.payload
    },
    openDetail: (s, a: PayloadAction<{ title: Pick<Title, 'type' | 'id'>; returnKey: string }>) => {
      s.detail = { type: a.payload.title.type, id: a.payload.title.id }
      s.returnKey = a.payload.returnKey
    },
    closeDetail: (s) => {
      s.detail = null
    },
  },
})

export const listSlice = createSlice({
  name: 'list',
  initialState: [] as Title[],
  reducers: {
    toggleInList: (s, a: PayloadAction<Title>) => {
      const key = titleKey(a.payload)
      const i = s.findIndex((t) => titleKey(t) === key)
      if (i >= 0) s.splice(i, 1)
      else s.unshift(a.payload)
    },
  },
})

export const { showInHero, openDetail, closeDetail } = uiSlice.actions
export const { toggleInList } = listSlice.actions
