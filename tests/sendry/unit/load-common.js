// common.js is a classic browser script (globals, no exports), so load it into a vm context
// the same way Chrome does, with an in-memory chrome.storage for the settings/stats helpers.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const COMMON_PATH = path.resolve(here, "../../../sendry/common.js");
const source = fs.readFileSync(COMMON_PATH, "utf8");

function memoryArea({ failWrites = false } = {}) {
  const data = {};
  return {
    data,
    async get(keys) {
      const out = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) if (k in data) out[k] = structuredClone(data[k]);
      return out;
    },
    async set(obj) {
      if (failWrites) throw new Error("QUOTA_BYTES quota exceeded");
      Object.assign(data, structuredClone(obj));
    },
    async remove(key) {
      delete data[key];
    }
  };
}

export function loadCommon({ syncFails = false } = {}) {
  const chrome = { storage: { local: memoryArea(), sync: memoryArea({ failWrites: syncFails }) } };
  const ctx = vm.createContext({ chrome, structuredClone, console });
  vm.runInContext(source, ctx, { filename: COMMON_PATH });
  // Loading the same file twice must not throw: background.js re-injects it into open tabs.
  vm.runInContext(source, ctx, { filename: COMMON_PATH });
  return ctx;
}

// vm objects come from another realm; round-trip through JSON so deepStrictEqual compares plain data.
export const plain = (v) => JSON.parse(JSON.stringify(v));
