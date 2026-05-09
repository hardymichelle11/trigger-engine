// =====================================================================
// News Provider Registry
// =====================================================================
// Provider-neutral hub. Each provider exposes:
//
//   {
//     name: string,
//     fetchForSymbol: (symbol, opts) => Promise<NewsArticle[]>,
//     available?: () => boolean,
//   }
//
// The registry is in-memory; tests clear it between cases.
// =====================================================================

const providers = new Map();

/**
 * Register a news provider. Idempotent — re-registering replaces the
 * previous binding for that name.
 */
export function registerNewsProvider(provider) {
  if (!provider || typeof provider !== "object") return;
  if (typeof provider.name !== "string" || !provider.name) return;
  if (typeof provider.fetchForSymbol !== "function") return;
  providers.set(provider.name, provider);
}

export function unregisterNewsProvider(name) {
  if (!name) return false;
  return providers.delete(name);
}

export function getNewsProvider(name) {
  if (!name) return null;
  return providers.get(name) || null;
}

export function listNewsProviders() {
  return Array.from(providers.values());
}

export function clearNewsProviders() { providers.clear(); }

/**
 * Fetch from every registered provider for `symbol`. Failures from a
 * single provider never block the others — the registry collects the
 * empty result and surfaces a warning instead.
 *
 * @returns {Promise<{ articles: object[], warnings: string[] }>}
 */
export async function fetchFromAllProviders(symbol, opts = {}) {
  const list = opts.providers && Array.isArray(opts.providers) && opts.providers.length > 0
    ? opts.providers
    : listNewsProviders();

  const articles = [];
  const warnings = [];

  await Promise.all(list.map(async (p) => {
    if (typeof p.available === "function" && p.available() === false) {
      warnings.push(`provider_${p.name}_unavailable`);
      return;
    }
    try {
      const items = await p.fetchForSymbol(symbol, opts);
      if (Array.isArray(items)) {
        for (const it of items) articles.push(it);
      }
    } catch {
      warnings.push(`provider_${p.name}_failed`);
    }
  }));

  return { articles, warnings };
}
