/**
 * Minimal chrome.storage / chrome.runtime mock backed by in-memory Maps,
 * with test hooks for simulating storage failures.
 */

function createArea() {
  const store = new Map();
  const area = {
    __store: store,
    __failGet: false,
    __failSet: false,
    get(keys, callback) {
      const items = {};
      if (!area.__failGet) {
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
      }
      const error = area.__failGet ? { message: "mock storage get failed" } : null;
      chrome.runtime.lastError = error;
      try {
        callback(items);
      } finally {
        chrome.runtime.lastError = null;
      }
    },
    set(items, callback = () => {}) {
      const error = area.__failSet ? { message: "mock storage set failed" } : null;
      if (!area.__failSet) {
        for (const [key, value] of Object.entries(items)) store.set(key, value);
      }
      chrome.runtime.lastError = error;
      try {
        callback();
      } finally {
        chrome.runtime.lastError = null;
      }
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
