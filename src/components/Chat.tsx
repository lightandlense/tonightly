import { FocusContext, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { motion } from 'motion/react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { sendMessage, setChatOpen, setVoice } from '../state/chat'
import { useAppDispatch, useAppSelector } from '../state/store'
import { canSay, hush, useSpeech } from '../speech'
import { Card } from './Card'
import { FocusButton } from './FocusButton'

// Keys the remote needs even while typing. Everything else stays with the text box (caret, Backspace, "/").
const REMOTE_KEYS = ['ArrowUp', 'ArrowDown', 'Enter', 'Escape']

function ChatInput({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  const { ref, focused, focusSelf } = useFocusable<object, HTMLInputElement>({ focusKey: 'chat-input', onEnterPress: onSubmit })
  return (
    <input
      ref={ref}
      className={`chat-text${focused ? ' is-focused' : ''}`}
      value={value}
      maxLength={500}
      placeholder="Ask for something to watch"
      aria-label="Ask for something to watch"
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => !focused && focusSelf()}
      onKeyDown={(e: KeyboardEvent) => !REMOTE_KEYS.includes(e.key) && e.stopPropagation()}
    />
  )
}

export function Chat() {
  const dispatch = useAppDispatch()
  const { messages, pending, voice } = useAppSelector((s) => s.chat)
  const [text, setText] = useState('')
  const log = useRef<HTMLOListElement>(null)
  const { ref, focusKey } = useFocusable({ focusKey: 'CHAT', isFocusBoundary: true, trackChildren: true })

  const send = (raw: string) => {
    const m = raw.trim()
    if (!m || pending) return
    setText('')
    dispatch(sendMessage(m))
  }
  const close = () => dispatch(setChatOpen(false))
  const speech = useSpeech((heard) => {
    // Talking to it means you probably want it to talk back.
    if (canSay) dispatch(setVoice(true))
    send(heard)
  })
  const toggleVoice = () => {
    if (voice) hush()
    dispatch(setVoice(!voice))
  }

  useEffect(() => {
    setFocus('chat-input')
  }, [])

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [messages.length, pending])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <FocusContext.Provider value={focusKey}>
      <motion.aside
        ref={ref}
        className="chat"
        role="dialog"
        aria-label="Ask Tonightly"
        data-testid="chat"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      >
        <div className="chat-head">
          <h2>Ask Tonightly</h2>
          <div className="chat-head-actions">
            {canSay && (
              <FocusButton focusKey="chat-voice" onPress={toggleVoice} pressed={voice}>
                Voice {voice ? 'on' : 'off'}
              </FocusButton>
            )}
            <FocusButton focusKey="chat-close" onPress={close}>
              Close
            </FocusButton>
          </div>
        </div>
        <ol className="chat-log" ref={log} aria-live="polite" aria-relevant="additions">
          {!messages.length && <li className="msg msg-hint">Try "a funny movie under two hours" or "something like Hot Rod".</li>}
          {messages.map((m) => (
            <li key={m.id} className={`msg msg-${m.role}${m.error ? ' msg-error' : ''}`}>
              <p>{m.text}</p>
              {!!m.picks?.length && (
                <div className="chat-picks">
                  {m.picks.map((t) => (
                    <Card key={`${t.type}-${t.id}`} title={t} rowId={`chat-${m.id}`} />
                  ))}
                </div>
              )}
            </li>
          ))}
          {pending && <li className="msg msg-assistant msg-pending">Thinking…</li>}
        </ol>
        {speech.error && <p className="chat-note" role="alert">{speech.error}</p>}
        <div className="chat-compose">
          <ChatInput value={text} onChange={setText} onSubmit={() => send(text)} />
          {speech.supported && (
            <FocusButton focusKey="chat-mic" onPress={speech.listening ? speech.stop : speech.start} primary={speech.listening}>
              {speech.listening ? 'Listening… stop' : 'Speak'}
            </FocusButton>
          )}
        </div>
      </motion.aside>
    </FocusContext.Provider>
  )
}
