import { SoloSiteApp, ThemeProvider } from '@songara/pwa-base'
import { BrowserRouter } from 'react-router-dom'
import { FplDataProvider } from './data/FplDataProvider'
import { PwaRegister } from './PwaRegister'
import { fplSite } from './site'
import './App.css'

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <FplDataProvider>
          <SoloSiteApp site={fplSite} />
          <PwaRegister />
        </FplDataProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
