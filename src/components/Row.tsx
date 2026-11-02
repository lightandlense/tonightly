import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import type { Title } from '../tmdb'
import { titleKey } from '../tmdb'
import { Card } from './Card'

export function Row({ id, label, titles }: { id: string; label: string; titles: Title[] }) {
  // saveLastFocusedChild: coming back to a row lands on the card you left, not the first one.
  const { ref, focusKey, hasFocusedChild } = useFocusable({ focusKey: `row-${id}`, saveLastFocusedChild: true, trackChildren: true })
  const headingId = `row-${id}-label`

  return (
    <FocusContext.Provider value={focusKey}>
      <section className={`row${hasFocusedChild ? ' is-active' : ''}`} aria-labelledby={headingId} data-testid="row">
        <h2 id={headingId}>{label}</h2>
        <div ref={ref} className="row-track">
          {titles.map((t) => (
            <Card key={titleKey(t)} title={t} rowId={id} />
          ))}
        </div>
      </section>
    </FocusContext.Provider>
  )
}
