import { StrictMode, useState, useCallback, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import TickerSetupBuilder from './TickerSetupBuilder.jsx'
import CreditVolScanner from './CreditVolScanner.jsx'
import LandingPage from './LandingPage.jsx'
import LethalBoardPage from './components/discovery/LethalBoardPage.jsx'
import {
  getAllSetups,
  addSetup,
  removeSetup,
  toggleSetup,
  saveToStorage,
  fromBuilderFormat,
  getSetupsAsObject,
} from './lib/setupRegistry.js'
import { validateSetup } from './lib/setupValidator.js'
import { hasPolygonKey, setPolygonKey, clearApiKeys } from './lib/apiKeyManager.js'
import { canAccessPolygon } from './lib/polygonProxy.js'

// --------------------------------------------------
// API KEY GATE — prompts for key before showing app
// --------------------------------------------------

function ApiKeyGate({ onUnlock }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) {
      setError("API key is required");
      return;
    }
    if (trimmed.length < 10) {
      setError("That doesn't look like a valid Polygon API key");
      return;
    }
    setPolygonKey(trimmed);
    onUnlock();
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#060a0f", display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'JetBrains Mono','Fira Code',ui-monospace,monospace",
    }}>
      <div style={{
        background: "#0d1117", border: "1px solid #1e2530", borderRadius: 12,
        padding: 32, maxWidth: 420, width: "100%",
      }}>
        <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.18em", marginBottom: 6 }}>
          TRIGGER ENGINE
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginBottom: 20 }}>
          API Key Required
        </div>
        <div style={{ fontSize: 11, color: "#b0b8c4", marginBottom: 16, lineHeight: 1.6 }}>
          Enter your Polygon.io API key to connect to live market data.
          The key is stored in your browser only — it is never sent to any server
          or included in the application code.
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={key}
            onChange={e => { setKey(e.target.value); setError(""); }}
            placeholder="Polygon API key"
            autoFocus
            style={{
              width: "100%", padding: 12, background: "#111827", color: "#f9fafb",
              border: `1px solid ${error ? "#ef4444" : "#374151"}`, borderRadius: 8,
              fontSize: 13, fontFamily: "monospace", marginBottom: 10,
              boxSizing: "border-box",
            }}
          />
          {error && (
            <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 10 }}>{error}</div>
          )}
          <button
            type="submit"
            style={{
              width: "100%", padding: 12, background: "#065f46",
              border: "1px solid #22c55e", borderRadius: 8,
              color: "#22c55e", fontSize: 13, fontWeight: 700,
              cursor: "pointer", letterSpacing: "0.05em",
            }}>
            CONNECT
          </button>
        </form>

        <div style={{ fontSize: 9, color: "#1e2530", marginTop: 16, textAlign: "center" }}>
          Get a free key at polygon.io/dashboard/signup
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------
// MAIN APP
// --------------------------------------------------

function Root() {
  const [keyReady, setKeyReady] = useState(() => hasPolygonKey());
  const [checkingProxy, setCheckingProxy] = useState(true);

  // On mount: check if proxy is available — if so, skip key prompt entirely
  useEffect(() => {
    canAccessPolygon().then(ok => {
      if (ok) setKeyReady(true);
      setCheckingProxy(false);
    });
  }, []);
  const [page, setPage] = useState("landing");

  // React owns the setup list. Registry is the mutation layer.
  const [setups, setSetups] = useState(() => getAllSetups());

  // Derived: engine-format object for App.jsx
  const engineSetups = getSetupsAsObject(setups);

  // --- Mutation handlers ---

  const handleAddSetup = useCallback((builderPayload) => {
    const registrySetup = fromBuilderFormat(builderPayload);
    const errors = validateSetup(registrySetup);
    if (errors.length > 0) return { ok: false, errors };
    const addErrors = addSetup(registrySetup);
    if (addErrors) return { ok: false, errors: addErrors };
    setSetups(getAllSetups());
    saveToStorage();
    return { ok: true };
  }, []);

  const handleToggleSetup = useCallback((id) => {
    const ok = toggleSetup(id);
    if (ok) { setSetups(getAllSetups()); saveToStorage(); }
    return ok;
  }, []);

  const handleRemoveSetup = useCallback((id) => {
    const ok = removeSetup(id);
    if (ok) { setSetups(getAllSetups()); saveToStorage(); }
    return ok;
  }, []);

  // --- Loading / API Key Gate ---
  if (checkingProxy) {
    return (
      <div style={{ minHeight: "100vh", background: "#060a0f", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontFamily: "monospace", fontSize: 12 }}>
        Connecting...
      </div>
    );
  }

  if (!keyReady) {
    return <ApiKeyGate onUnlock={() => setKeyReady(true)} />;
  }

  // --- Page routing ---

  if (page === "landing") {
    return <LandingPage onOpenDashboard={() => setPage("scanner")} />;
  }

  if (page === "builder") {
    return (
      <TickerSetupBuilder
        onBack={() => setPage("scanner")}
        onAddSetup={handleAddSetup}
        onToggleSetup={handleToggleSetup}
        onRemoveSetup={handleRemoveSetup}
        runtimeSetups={setups}
      />
    );
  }

  if (page === "credit-vol") {
    return <CreditVolScanner onBack={() => setPage("scanner")} />;
  }

  if (page === "lethal-board") {
    return <LethalBoardPage onBack={() => setPage("scanner")} />;
  }

  return (
    <App
      onOpenBuilder={() => setPage("builder")}
      onOpenCreditVol={() => setPage("credit-vol")}
      onOpenLethal={() => setPage("lethal-board")}
      engineSetups={engineSetups}
      setupCount={setups.filter(s => s.enabled).length}
    />
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
