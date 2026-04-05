import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import TickerSetupBuilder from './TickerSetupBuilder.jsx'

function Root() {
  const [page, setPage] = useState("scanner");

  if (page === "builder") {
    return <TickerSetupBuilder onBack={() => setPage("scanner")} />;
  }

  return <App onOpenBuilder={() => setPage("builder")} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
