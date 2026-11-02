import { doesFocusableExist, setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { AnimatePresence, MotionConfig } from 'motion/react'
import { useCallback, useEffect, useRef } from 'react'
import { Chat } from './components/Chat'
import { Detail } from './components/Detail'
import { Home } from './components/Home'
import { setChatOpen } from './state/chat'
import { closeDetail } from './state/slices'
import { useAppDispatch, useAppSelector } from './state/store'

export function App() {
  const dispatch = useAppDispatch()
  const detail = useAppSelector((s) => s.ui.detail)
  const returnKey = useAppSelector((s) => s.ui.returnKey)
  const chatOpen = useAppSelector((s) => s.chat.open)
  const hasTonight = useAppSelector((s) => s.chat.tonight.length > 0)
  const back = useCallback(() => dispatch(closeDetail()), [dispatch])

  // After the detail page closes (and home is no longer inert), put focus back on the card that opened it.
  // That card can be gone (removed from My list), so fall back to home's last focused card.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !detail) setFocus(returnKey && doesFocusableExist(returnKey) ? returnKey : 'HOME')
    wasOpen.current = !!detail
  }, [detail, returnKey])

  // Closing the chat lands on its picks in the "For tonight" row, or back where you were.
  const chatWasOpen = useRef(false)
  useEffect(() => {
    if (chatWasOpen.current && !chatOpen && !detail) setFocus(hasTonight ? 'row-tonight' : 'HOME')
    chatWasOpen.current = chatOpen
  }, [chatOpen, detail, hasTonight])

  // "/" opens the assistant from anywhere on home, like a remote's voice button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || chatOpen || detail) return
      e.preventDefault()
      dispatch(setChatOpen(true))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chatOpen, detail, dispatch])

  return (
    <MotionConfig reducedMotion="user">
      <Home hidden={!!detail || chatOpen} />
      {/* The chat steps aside while a title's page is open and comes back with it closed */}
      <AnimatePresence>{chatOpen && !detail && <Chat key="chat" />}</AnimatePresence>
      <AnimatePresence>{detail && <Detail key={`${detail.type}-${detail.id}`} type={detail.type} id={detail.id} onBack={back} />}</AnimatePresence>
    </MotionConfig>
  )
}
