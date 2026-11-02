import { init } from '@noriginmedia/norigin-spatial-navigation'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { App } from './App'
import { makeStore } from './state/store'
import './styles.css'

// Arrow keys + Enter drive focus, like a TV remote. DOM focus follows so screen readers announce each card.
init({ shouldFocusDOMNode: true, domNodeFocusOptions: { preventScroll: true } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={makeStore()}>
      <App />
    </Provider>
  </StrictMode>,
)
