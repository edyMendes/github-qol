/**
 * Minimal chrome.storage / chrome.runtime mock backed by in-memory Maps,
 * with test hooks for simulating storage failures. Mirrors Chrome MV3's
 * promise-based storage API (callback-less calls return Promises).
 */

function createArea() {
  const store = new Map();
  const area = {
    __store: store,
    __failGet: false,
    __failSet: false,
    get(keys) {
      if (area.__failGet) {
        return Promise.reject(new Error("mock storage get failed"));
      }
      const items = {};
      if (typeof keys === "string") {
        items[keys] = store.get(keys);
      } else if (Array.isArray(keys)) {
        for (const key of keys) items[key] = store.get(key);
      } else if (keys && typeof keys === "object") {
        for (const [key, fallback] of Object.entries(keys)) {
          const value = store.get(key);
          items[key] = value === undefined ? fallback : value;
        }
      }
      return Promise.resolve(items);
    },
    set(items) {
      if (area.__failSet) {
        return Promise.reject(new Error("mock storage set failed"));
      }
      for (const [key, value] of Object.entries(items)) store.set(key, value);
      return Promise.resolve();
    },
  };
  return area;
}

const sync = createArea();
const local = createArea();

globalThis.chrome = {
  runtime: { lastError: null },
  storage: {
    sync,
    local,
    onChanged: { addListener: () => {}, removeListener: () => {} },
  },
};

globalThis.__resetChromeStorage = () => {
  sync.__store.clear();
  local.__store.clear();
  sync.__failGet = false;
  sync.__failSet = false;
  local.__failGet = false;
  local.__failSet = false;
};
