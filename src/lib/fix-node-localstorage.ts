/**
 * Node 22+ の `--localstorage-file` が不正だと、サーバー上の `globalThis.localStorage`
 * が壊れ（getItem が関数でない）、Next の SSR で例外になることがある。
 * ブラウザでは触らない。
 */
(function fixBrokenNodeLocalStorage() {
  if (typeof window !== "undefined") return;
  const g = globalThis as typeof globalThis & { localStorage?: unknown };
  const ls = g.localStorage;
  if (ls == null) return;
  if (typeof (ls as Storage).getItem === "function") return;

  const noopStorage: Storage = {
    length: 0,
    clear: () => {},
    getItem: () => null,
    key: () => null,
    removeItem: () => {},
    setItem: () => {},
  };
  g.localStorage = noopStorage;
})();
