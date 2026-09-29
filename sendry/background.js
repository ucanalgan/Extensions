const CONTENT_FILES = ["common.js", "content.js"];

// Tabs that were already open when Sendry was installed or updated have no (or a stale) content
// script until they are reloaded. Inject into them right away so protection starts immediately.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== "install" && reason !== "update") return;
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  await Promise.all(
    tabs
      .filter((tab) => !tab.discarded)
      .map((tab) =>
        chrome.scripting
          .executeScript({ target: { tabId: tab.id, allFrames: true }, files: CONTENT_FILES })
          .catch(() => {
            // restricted pages (Web Store, other extensions) refuse injection; skip them
          })
      )
  );
});

// Relay between frames of the same tab. An editor inside an iframe hands its modal to the top
// frame (frameId 0) so it can cover the whole page, and the user's choice is sent back to the
// iframe that owns the text. Going through the extension instead of window.postMessage means
// the page itself can't forge or read these messages.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;
  if (tabId == null || !msg || typeof msg.type !== "string") return;

  if (msg.type === "sendry:present") {
    chrome.tabs
      .sendMessage(tabId, { type: "sendry:present", view: msg.view, frameId: sender.frameId }, { frameId: 0 })
      .then((res) => sendResponse(res || { ok: false }), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "sendry:action" && typeof msg.frameId === "number") {
    chrome.tabs.sendMessage(tabId, { type: "sendry:action", action: msg.action }, { frameId: msg.frameId }).catch(() => {});
  } else if (msg.type === "sendry:toast") {
    chrome.tabs.sendMessage(tabId, { type: "sendry:toast", message: msg.message }, { frameId: 0 }).catch(() => {});
  }
});
