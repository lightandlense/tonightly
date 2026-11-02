import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { titleKey, type Title } from '../tmdb'
import { openDetail } from './slices'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  picks?: Title[]
  error?: boolean
}

export interface ChatState {
  open: boolean
  pending: boolean
  messages: ChatMessage[]
  /** The assistant's latest picks, shown as the "For tonight" row on home. */
  tonight: Title[]
}

interface Answer {
  reply: string
  picks: Title[]
  open: Title | null
}

// One chat per page load. The server keeps the history for this id.
const SESSION_ID = crypto.randomUUID()

export const sendMessage = createAsyncThunk<Answer, string, { rejectValue: string }>('chat/send', async (text, { dispatch, rejectWithValue }) => {
  let body: { ok: boolean; data?: Answer; error?: string }
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, message: text }),
    })
    body = await res.json()
  } catch {
    return rejectWithValue('I could not reach the assistant. Check your connection and try again.')
  }
  if (!body.ok || !body.data) return rejectWithValue(body.error ?? 'Something went wrong. Try again.')
  const answer = body.data
  // The assistant can act on the UI: open a title's page. Back returns to that title in the "For tonight" row.
  if (answer.open) dispatch(openDetail({ title: answer.open, returnKey: `card-tonight-${titleKey(answer.open)}` }))
  return answer
})

const initial: ChatState = { open: false, pending: false, messages: [], tonight: [] }
let nextId = 1

export const chatSlice = createSlice({
  name: 'chat',
  initialState: initial,
  reducers: {
    setChatOpen: (s, a: PayloadAction<boolean>) => {
      s.open = a.payload
    },
  },
  extraReducers: (b) => {
    b.addCase(sendMessage.pending, (s, a) => {
      s.pending = true
      s.messages.push({ id: nextId++, role: 'user', text: a.meta.arg })
    })
    b.addCase(sendMessage.fulfilled, (s, a) => {
      const { reply, picks, open } = a.payload
      s.pending = false
      s.messages.push({ id: nextId++, role: 'assistant', text: reply, picks })
      // Keep the opened title in the row so focus has somewhere to return to.
      const row = open && !picks.some((t) => titleKey(t) === titleKey(open)) ? [open, ...picks] : picks
      if (row.length) s.tonight = row
      if (open) s.open = false
    })
    b.addCase(sendMessage.rejected, (s, a) => {
      s.pending = false
      s.messages.push({ id: nextId++, role: 'assistant', text: a.payload ?? 'Something went wrong. Try again.', error: true })
    })
  },
})

export const { setChatOpen } = chatSlice.actions
