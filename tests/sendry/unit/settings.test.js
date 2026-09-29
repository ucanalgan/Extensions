import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCommon, plain } from "./load-common.js";

test("new settings are saved to sync, not local", async () => {
  const S = loadCommon();
  await S.saveSettings({ customPhrases: ["tam zamanlı"] });
  assert.deepEqual(plain(S.chrome.storage.sync.data.settings.customPhrases), ["tam zamanlı"]);
  assert.equal(S.chrome.storage.local.data.settings, undefined);
  assert.deepEqual(plain((await S.getSettings()).customPhrases), ["tam zamanlı"]);
});

test("settings from 1.1 (in local) move to sync on first read", async () => {
  const S = loadCommon();
  S.chrome.storage.local.data.settings = { enabled: false, customPhrases: ["eski"] };
  const settings = await S.getSettings();
  assert.equal(settings.enabled, false);
  assert.deepEqual(plain(settings.customPhrases), ["eski"]);
  assert.equal(S.chrome.storage.sync.data.settings.enabled, false);
  assert.equal(S.chrome.storage.local.data.settings, undefined);
});

test("when sync rejects writes, settings fall back to local and still persist", async () => {
  const S = loadCommon({ syncFails: true });
  await S.saveSettings({ pasteRatio: 80 });
  assert.equal(S.chrome.storage.local.data.settings.pasteRatio, 80);
  assert.equal((await S.getSettings()).pasteRatio, 80);
});

test("stats stay in local storage", async () => {
  const S = loadCommon();
  await S.recordStats({ checked: 1, blocked: 1 }, ["header"]);
  const day = S.todayKey();
  assert.equal(S.chrome.storage.local.data.stats[day].blocked, 1);
  assert.equal(S.chrome.storage.local.data.stats[day].detectors.header, 1);
  assert.equal(S.chrome.storage.sync.data.stats, undefined);
});

test("missing or partial settings are filled with defaults", () => {
  const S = loadCommon();
  const merged = plain(S.mergeSettings({ detectors: { header: false } }));
  assert.equal(merged.detectors.header, false);
  assert.equal(merged.detectors.placeholder, true);
  assert.deepEqual(merged.disabledSites, plain(S.DEFAULT_SETTINGS.disabledSites));
});

test("settings change events from either area are recognised; removals are ignored", () => {
  const S = loadCommon();
  assert.equal(S.isSettingsChange({ settings: { newValue: {} } }, "sync"), true);
  assert.equal(S.isSettingsChange({ settings: { newValue: {} } }, "local"), true);
  assert.equal(S.isSettingsChange({ settings: { oldValue: {} } }, "local"), false);
  assert.equal(S.isSettingsChange({ stats: { newValue: {} } }, "local"), false);
});
