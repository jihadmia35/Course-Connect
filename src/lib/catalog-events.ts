// Only an invalidation signal crosses tabs; no catalog, credentials or form data.
export const CATALOG_CHANGE_EVENT = 'seu:catalog-changed';

export function notifyCatalogChanged(): void {
  try {
    window.localStorage.setItem(CATALOG_CHANGE_EVENT, `${Date.now()}:${Math.random()}`);
  } catch {
    // Browsers that disable storage still refresh on focus and at intervals.
  }
}
