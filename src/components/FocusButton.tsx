import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import type { ReactNode } from 'react'

/** A button the remote (arrow keys + Enter) and the mouse can both use. */
export function FocusButton({ focusKey, onPress, children, primary }: { focusKey?: string; onPress: () => void; children: ReactNode; primary?: boolean }) {
  const { ref, focused, focusSelf } = useFocusable<object, HTMLButtonElement>({ focusKey, onEnterPress: onPress })
  return (
    <button
      ref={ref}
      type="button"
      className={`btn${primary ? ' btn-primary' : ''}${focused ? ' is-focused' : ''}`}
      onClick={onPress}
      onFocus={() => !focused && focusSelf()}
    >
      {children}
    </button>
  )
}
