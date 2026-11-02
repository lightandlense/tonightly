import { FocusContext, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useEffect } from 'react'
import { useHomeRowsQuery } from '../state/api'
import { setChatOpen } from '../state/chat'
import { useAppDispatch, useAppSelector } from '../state/store'
import { FocusButton } from './FocusButton'
import { Hero } from './Hero'
import { Row } from './Row'

export function Home({ hidden }: { hidden: boolean }) {
  const { data, isLoading, isError, refetch } = useHomeRowsQuery()
  const dispatch = useAppDispatch()
  const list = useAppSelector((s) => s.list)
  const tonight = useAppSelector((s) => s.chat.tonight)
  const focusedTitle = useAppSelector((s) => s.ui.hero)
  const { ref, focusKey } = useFocusable({ focusKey: 'HOME', saveLastFocusedChild: true, trackChildren: true })
  const loaded = !!data

  useEffect(() => {
    if (loaded) setFocus('HOME')
  }, [loaded])

  useEffect(() => {
    if (isError) setFocus('retry')
  }, [isError])

  const extra = [
    { id: 'tonight', label: 'For tonight', titles: tonight },
    { id: 'my-list', label: 'My list', titles: list },
  ].filter((r) => r.titles.length)
  const rows = data ? [...extra, ...data] : []

  return (
    <FocusContext.Provider value={focusKey}>
      {/* inert while the detail page or chat is open, so Tab and screen readers stay inside it */}
      <main className="home" inert={hidden}>
        <div className="ask">
          <FocusButton focusKey="ask" onPress={() => dispatch(setChatOpen(true))}>
            Ask Tonightly <kbd>/</kbd>
          </FocusButton>
        </div>
        <Hero title={focusedTitle ?? data?.[0]?.titles[0] ?? null} />
        <div ref={ref} className="rows" data-testid="rows">
          {isLoading && <p className="status">Loading tonight's picks…</p>}
          {isError && (
            <div className="status">
              <p>Couldn't reach the movie database. Check your connection and try again.</p>
              <FocusButton focusKey="retry" onPress={refetch} primary>
                Try again
              </FocusButton>
            </div>
          )}
          {rows.map((r) => (
            <Row key={r.id} id={r.id} label={r.label} titles={r.titles} />
          ))}
          <footer className="footer">
            <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
            <p>Tonightly is a portfolio prototype by Russell Klimas. Not affiliated with any streaming service.</p>
          </footer>
        </div>
      </main>
    </FocusContext.Provider>
  )
}
