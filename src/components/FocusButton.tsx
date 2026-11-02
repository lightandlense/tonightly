import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import type { ReactNode } from 'react'

/** A button the remote (arrow keys + Enter) and the mouse can both use. */
export function FocusButton({ focusKey, onPress, children, primary, pressed }: { focusKey?: string; onPress: () => void; children: ReactNode; primary?: boolean; pressed?: boolean }) {
  const { ref, focused, focusSelf } = useFocusable<object, HTMLButtonElement>({ focusKey, onEnterPress: onPress })
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed}
      className={`btn${primary ? ' btn-primary' : ''}${focused ? ' is-focused' : ''}`}
      onClick={onPress}
      onFocus={() => !focused && focusSelf()}
    >
      {children}
    </button>
  )
}
