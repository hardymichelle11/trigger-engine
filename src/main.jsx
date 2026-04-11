import { StrictMode, useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import TickerSetupBuilder from './TickerSetupBuilder.jsx'
import CreditVolScanner from './CreditVolScanner.jsx'
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

function Root() {
  const [page, setPage] = useState("scanner");

  // React owns the setup list. Registry is the mutation layer.
  // This ensures re-renders happen when setups change.
  const [setups, setSetups] = useState(() => getAllSetups());

  // Derived: engine-format object for App.jsx
  const engineSetups = getSetupsAsObject(setups);

  // --- Mutation handlers ---

  const handleAddSetup = useCallback((builderPayload) => {
    // Convert builder format → registry format
    const registrySetup = fromBuilderFormat(builderPayload);

    // Validate
    const errors = validateSetup(registrySetup);
    if (errors.length > 0) return { ok: false, errors };

    // Add to registry
    const addErrors = addSetup(registrySetup);
    if (addErrors) return { ok: false, errors: addErrors };

    // Sync React state + persist
    setSetups(getAllSetups());
    saveToStorage();
    return { ok: true };
  }, []);

  const handleToggleSetup = useCallback((id) => {
    const ok = toggleSetup(id);
    if (ok) {
      setSetups(getAllSetups());
      saveToStorage();
    }
    return ok;
  }, []);

  const handleRemoveSetup = useCallback((id) => {
    const ok = removeSetup(id);
    if (ok) {
      setSetups(getAllSetups());
      saveToStorage();
    }
    return ok;
  }, []);

  // --- Page routing ---

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

  return (
    <App
      onOpenBuilder={() => setPage("builder")}
      onOpenCreditVol={() => setPage("credit-vol")}
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
