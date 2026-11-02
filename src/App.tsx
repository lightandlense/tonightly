import { doesFocusableExist, setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { AnimatePresence, MotionConfig } from 'motion/react'
import { useCallback, useEffect, useRef } from 'react'
import { Detail } from './components/Detail'
import { Home } from './components/Home'
import { closeDetail } from './state/slices'
import { useAppDispatch, useAppSelector } from './state/store'

export function App() {
  const dispatch = useAppDispatch()
  const detail = useAppSelector((s) => s.ui.detail)
  const returnKey = useAppSelector((s) => s.ui.returnKey)
  const back = useCallback(() => dispatch(closeDetail()), [dispatch])

  // After the detail page closes (and home is no longer inert), put focus back on the card that opened it.
  // That card can be gone (removed from My list), so fall back to home's last focused card.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !detail) setFocus(returnKey && doesFocusableExist(returnKey) ? returnKey : 'HOME')
    wasOpen.current = !!detail
  }, [detail, returnKey])

  return (
    <MotionConfig reducedMotion="user">
      <Home hidden={!!detail} />
      <AnimatePresence>{detail && <Detail key={`${detail.type}-${detail.id}`} type={detail.type} id={detail.id} onBack={back} />}</AnimatePresence>
    </MotionConfig>
  )
}
