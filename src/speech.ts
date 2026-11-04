import { useCallback, useEffect, useRef, useState } from 'react'

// Browser speech-to-text (Chrome, Edge, Safari). Firefox has none, so the mic button hides there.
interface Recognition {
  lang: string
  interimResults: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionCtor = new () => Recognition
const w = globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone is blocked. Allow it in the address bar to talk.',
  'service-not-allowed': 'Microphone is blocked. Allow it in the address bar to talk.',
  'audio-capture': 'No microphone found.',
  network: "Couldn't reach the browser's speech service. Try Chrome or Edge.",
  'no-speech': "Didn't hear anything. Try again.",
}

/** Push to talk: start() listens for one phrase and stops by itself on silence. */
export function useSpeech(onHeard: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<Recognition | null>(null)
  const heard = useRef(onHeard)
  useEffect(() => {
    heard.current = onHeard
  })

  const start = useCallback(() => {
    if (!Ctor) {
      setError("This browser can't do speech to text. Try Chrome, Edge or Safari, or type instead.")
      return
    }
    if (rec.current) return
    const r = new Ctor()
    r.lang = 'en-US'
    r.interimResults = false
    r.onresult = (e) => heard.current(e.results[0][0].transcript)
    r.onerror = (e) => setError(ERRORS[e.error] ?? "Didn't catch that. Try again.")
    r.onend = () => {
      rec.current = null
      setListening(false)
    }
    rec.current = r
    setError(null)
    setListening(true)
    r.start()
  }, [])
  const stop = useCallback(() => rec.current?.stop(), [])
  useEffect(() => () => rec.current?.abort(), [])

  return { supported: !!Ctor, listening, error, start, stop }
}

// ponytail: the browser's own voice reads replies until Polly is available (AWS region lock, 2026-11-01).
export const canSay = 'speechSynthesis' in globalThis

export function say(text: string) {
  if (!canSay) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const voices = speechSynthesis.getVoices().filter((v) => v.lang === 'en-US')
  u.voice = voices.find((v) => /natural|neural/i.test(v.name)) ?? voices[0] ?? null
  u.lang = 'en-US'
  speechSynthesis.speak(u)
}

export const hush = () => canSay && speechSynthesis.cancel()
