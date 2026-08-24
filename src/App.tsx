import { SoloSiteApp, ThemeProvider } from '@songara/pwa-base'
import { BrowserRouter } from 'react-router-dom'
import { FplDataProvider } from './data/FplDataProvider'
import { useUserStateBootRefresh } from './hooks/useUserStateBootRefresh'
import { PwaRegister } from './PwaRegister'
import { fplSite } from './site'
import './App.css'

function AppShell() {
  useUserStateBootRefresh()
  return (
    <>
      <SoloSiteApp site={fplSite} />
      <PwaRegister />
    </>
  )
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <FplDataProvider>
          <AppShell />
        </FplDataProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
