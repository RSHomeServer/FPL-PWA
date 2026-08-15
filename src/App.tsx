import { SoloSiteApp, ThemeProvider } from '@songara/pwa-base'
import { BrowserRouter } from 'react-router-dom'
import { PwaRegister } from './PwaRegister'
import { fplSite } from './site'
import './App.css'

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <SoloSiteApp site={fplSite} />
        <PwaRegister />
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
