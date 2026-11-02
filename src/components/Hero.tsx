import { AnimatePresence, motion } from 'motion/react'
import { img, titleKey, type Title } from '../tmdb'

/** The banner shows whatever card has focus, so moving through a row previews each title. */
export function Hero({ title }: { title: Title | null }) {
  return (
    <header className="hero">
      <AnimatePresence mode="popLayout" initial={false}>
        {title && (
          <motion.div
            key={titleKey(title)}
            className="hero-inner"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            {title.backdrop && <img className="hero-bg" src={img(title.backdrop, 'w1280') ?? ''} alt="" />}
            <div className="hero-scrim" />
            <div className="hero-text">
              <p className="brand">Tonightly</p>
              <h1>{title.name}</h1>
              <p className="meta">
                {[title.year, title.type === 'tv' ? 'Series' : 'Movie', title.rating ? `★ ${title.rating}` : ''].filter(Boolean).join('  ·  ')}
              </p>
              <p className="overview">{title.overview}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
