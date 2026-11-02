import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { motion } from 'motion/react'
import { img, titleKey, type Title } from '../tmdb'
import { openDetail, showInHero } from '../state/slices'
import { useAppDispatch } from '../state/store'

export function Card({ title, rowId }: { title: Title; rowId: string }) {
  const dispatch = useAppDispatch()
  const focusKey = `card-${rowId}-${titleKey(title)}`
  const open = () => dispatch(openDetail({ title, returnKey: focusKey }))
  const { ref, focused, focusSelf } = useFocusable<object, HTMLButtonElement>({
    focusKey,
    onEnterPress: open,
    onFocus: (layout) => {
      dispatch(showInHero(title))
      // Rows and the rows viewport use CSS smooth scrolling, which turns off under prefers-reduced-motion.
      layout.node.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    },
  })
  const label = [title.name, title.year, title.rating ? `rated ${title.rating} out of 10` : '', title.type === 'tv' ? 'TV show' : 'movie']
    .filter(Boolean)
    .join(', ')

  return (
    <motion.button
      ref={ref}
      type="button"
      className={`card${focused ? ' is-focused' : ''}`}
      aria-label={label}
      data-testid="card"
      onClick={open}
      onFocus={() => !focused && focusSelf()}
      animate={{ scale: focused ? 1.08 : 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
    >
      <img src={img(title.poster) ?? ''} alt="" loading="lazy" draggable={false} />
    </motion.button>
  )
}
