import { FocusContext, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useDetailQuery } from '../state/api'
import { toggleInList } from '../state/slices'
import { useAppDispatch, useAppSelector } from '../state/store'
import { img, titleKey, type MediaType } from '../tmdb'
import { FocusButton } from './FocusButton'

const isBackKey = (e: KeyboardEvent) => e.key === 'Escape' || e.key === 'Backspace'

export function Detail({ type, id, onBack }: { type: MediaType; id: number; onBack: () => void }) {
  const dispatch = useAppDispatch()
  const { data, isLoading, isError } = useDetailQuery({ type, id })
  const inList = useAppSelector((s) => !!data && s.list.some((t) => titleKey(t) === titleKey(data)))
  const [trailerOpen, setTrailerOpen] = useState(false)
  const { ref, focusKey } = useFocusable({ focusKey: 'DETAIL', isFocusBoundary: true, trackChildren: true })

  useEffect(() => {
    if (isLoading) return
    setFocus(trailerOpen ? 'trailer-close' : 'detail-first')
  }, [isLoading, trailerOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isBackKey(e)) return
      e.preventDefault()
      if (trailerOpen) setTrailerOpen(false)
      else onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [trailerOpen, onBack])

  return (
    <FocusContext.Provider value={focusKey}>
      <motion.section
        ref={ref}
        className="detail"
        role="dialog"
        aria-modal="true"
        aria-label={data ? `${data.name} details` : 'Title details'}
        data-testid="detail"
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 32 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        {data?.backdrop && <img className="detail-bg" src={img(data.backdrop, 'w1280') ?? ''} alt="" />}
        <div className="detail-scrim" />

        {/* While the trailer plays, the buttons underneath unmount so arrows cannot reach them. */}
        {!trailerOpen && <div className="detail-body">
          {isLoading && <p className="status">Loading…</p>}
          {isError && (
            <>
              <p className="status">Sorry, this title couldn't be loaded.</p>
              <div className="actions">
                <FocusButton focusKey="detail-first" onPress={onBack} primary>
                  Back
                </FocusButton>
              </div>
            </>
          )}
          {data && (
            <>
              <h1>{data.name}</h1>
              <p className="meta">
                {[data.year, data.length, data.rating ? `★ ${data.rating}` : '', data.genres.slice(0, 3).join(', ')].filter(Boolean).join('  ·  ')}
              </p>
              {data.tagline && <p className="tagline">{data.tagline}</p>}
              <p className="overview">{data.overview}</p>

              {data.providers.length > 0 && (
                <div className="providers">
                  <span>Stream on</span>
                  <ul>
                    {data.providers.slice(0, 5).map((p) => (
                      <li key={p.name}>{p.logo ? <img src={img(p.logo, 'w92') ?? ''} alt={p.name} title={p.name} /> : p.name}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="actions">
                {data.trailerKey ? (
                  <FocusButton focusKey="detail-first" onPress={() => setTrailerOpen(true)} primary>
                    ▶ Play trailer
                  </FocusButton>
                ) : null}
                <FocusButton focusKey={data.trailerKey ? 'detail-list' : 'detail-first'} onPress={() => dispatch(toggleInList(data))}>
                  {inList ? '✓ In My list' : '+ My list'}
                </FocusButton>
                <FocusButton focusKey="detail-back" onPress={onBack}>
                  Back
                </FocusButton>
              </div>
              {data.providers.length > 0 && <p className="credit">Streaming info from JustWatch</p>}
            </>
          )}
        </div>}

        {trailerOpen && data?.trailerKey && (
          <div className="trailer" role="dialog" aria-label={`${data.name} trailer`}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${data.trailerKey}?autoplay=1&rel=0`}
              title={`${data.name} trailer`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            />
            <div className="trailer-bar">
              <FocusButton focusKey="trailer-close" onPress={() => setTrailerOpen(false)}>
                Close trailer (Esc)
              </FocusButton>
            </div>
          </div>
        )}
      </motion.section>
    </FocusContext.Provider>
  )
}
