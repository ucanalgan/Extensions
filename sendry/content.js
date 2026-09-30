(() => {
  // background.js re-injects this file into open tabs after install/update. If an older copy is
  // still running in this world, shut it down so only one set of listeners intercepts sends.
  if (typeof window.__sendryTeardown === "function") {
    try {
      window.__sendryTeardown();
    } catch {
      // the old copy is already half-dead; nothing to clean up
    }
  }

  // Open, not closed: a closed root would protect nothing (the page can remove the host element
  // either way), and an open one lets accessibility tools and the e2e tests reach the modal.
  const SHADOW_MODE = "open";

  // Same tokens as theme.css (the modal lives in the page's shadow DOM and can't load that file).
  const MODAL_CSS = `
    :host { all: initial; }
    .scrim {
      --paper: #f3f6f5; --sheet: #ffffff; --ink: #14201e; --ink-2: #4a5a57; --ink-3: #7a8986;
      --rule: #dbe3e1; --teal: #0b7a6f; --marker: #fde68a; --marker-ink: #3d3000;
      --proof: #c0392b; --proof-2: #b7791f;
      --display: "Sendry Literata", Georgia, "Times New Roman", serif;
      --body: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      --mono: ui-monospace, "Cascadia Mono", Consolas, monospace;
      position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
      background: rgba(20, 32, 30, 0.42); padding: 16px; box-sizing: border-box;
      font: 14px/1.5 var(--body); color: var(--ink); color-scheme: light;
    }
    @media (prefers-color-scheme: dark) {
      .scrim {
        --paper: #101715; --sheet: #172120; --ink: #e2ebe9; --ink-2: #a2b2ae; --ink-3: #72817e;
        --rule: #25302e; --teal: #3dd6c3; --marker: rgba(250, 204, 21, 0.26); --marker-ink: #fde68a;
        --proof: #f47a6c; --proof-2: #f5b942;
        background: rgba(0, 0, 0, 0.55); color-scheme: dark;
      }
    }
    * { box-sizing: border-box; }
    .dialog {
      width: 100%; max-width: 500px; max-height: calc(100vh - 32px); overflow-y: auto;
      background: var(--sheet); color: var(--ink); border-radius: 10px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
    }
    header { padding: 18px 22px 12px; display: flex; gap: 12px; align-items: flex-start; }
    header svg { flex: none; }
    h2 { font-family: var(--display); font-weight: 600; font-size: 19px; letter-spacing: -0.01em; margin: 0; }
    .sub { margin: 2px 0 0; color: var(--ink-2); font-size: 13px; }
    .issues { list-style: none; margin: 0; padding: 0 22px; }
    .issue { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 3px 8px; padding: 11px 0; border-top: 1px solid var(--rule); }
    .mk { font-family: var(--display); font-size: 18px; line-height: 1.1; text-align: center; color: var(--proof); grid-row: span 3; }
    .medium .mk { color: var(--proof-2); }
    .low .mk { color: var(--ink-3); }
    .issue strong { font-weight: 600; }
    .count { color: var(--ink-3); font-weight: 400; }
    button.fix {
      all: unset; cursor: pointer; grid-column: 3; grid-row: 1; align-self: start;
      color: var(--teal); font-size: 13px; font-weight: 600; white-space: nowrap;
    }
    button.fix:hover { text-decoration: underline; }
    button.fix .pm { font-family: var(--display); margin-right: 4px; }
    .detail { grid-column: 2 / span 2; margin: 0; color: var(--ink-2); font-size: 13px; }
    .snippets { grid-column: 2 / span 2; display: flex; flex-direction: column; gap: 4px; margin-top: 3px; }
    .snippet {
      all: unset; cursor: pointer; font-family: var(--mono); font-size: 12px; color: var(--ink-2);
      background: var(--paper); border: 1px solid transparent; border-radius: 4px; padding: 5px 8px;
      overflow-wrap: anywhere;
    }
    .snippet:hover, .snippet:focus-visible { border-color: var(--teal); }
    .note { color: var(--ink-3); font-size: 12px; margin: -1px 0 2px 8px; }
    mark { background: var(--marker); color: var(--marker-ink); border-radius: 2px; padding: 0 2px; }
    footer {
      position: sticky; bottom: 0;
      padding: 14px 22px 18px; border-top: 1px solid var(--rule); display: flex; flex-direction: column; gap: 12px;
      background: color-mix(in srgb, var(--paper) 60%, var(--sheet));
    }
    .confirm { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: var(--ink-2); cursor: pointer; }
    .confirm[hidden] { display: none; }
    .confirm input { margin-top: 3px; accent-color: var(--teal); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    button.primary, button.ghost {
      all: unset; cursor: pointer; border-radius: 6px; padding: 7px 14px; font-size: 13px; font-weight: 600;
    }
    button.primary { background: var(--teal); color: var(--sheet); }
    button.ghost { color: var(--ink-2); border: 1px solid var(--rule); font-weight: 500; }
    button.ghost:hover { border-color: var(--ink-3); }
    button.ghost:disabled { opacity: 0.5; cursor: not-allowed; }
    button:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
  `;

  const TOAST_CSS = `
    .toast {
      font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: #14201e; color: #f3f6f5; border-radius: 8px; padding: 10px 16px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); max-width: min(90vw, 480px);
      display: flex; gap: 10px; align-items: baseline;
    }
    .toast b { font-family: "Sendry Literata", Georgia, serif; color: #3dd6c3; }
    @media (prefers-color-scheme: dark) {
      .toast { background: #e2ebe9; color: #14201e; }
      .toast b { color: #0b7a6f; }
    }
  `;

  // The extension icon, inline so page CSPs that block extension images can't hide it.
  const ICON_SVG =
    '<svg width="32" height="32" viewBox="0 0 64 64" aria-hidden="true">' +
    '<rect width="64" height="64" rx="14" fill="#0d9488"/>' +
    '<path d="M11 33 L54 13 L32 57 L27 37 Z" fill="#fff"/><path d="M27 37 L54 13 L32 57 Z" fill="#ccfbf1"/>' +
    '<circle cx="46" cy="46" r="12" fill="#0d9488"/><circle cx="46" cy="46" r="10" fill="#facc15"/>' +
    '<path d="M41 46 l3.5 3.5 l6.5 -7" stroke="#0d9488" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>";

  const FONT_FILES = [
    ["literata-600-latin.woff2", "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212, U+FEFF"],
    ["literata-600-latin-ext.woff2", "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+20A0-20C0, U+A720-A7FF"]
  ];
  let fontRequested = false;

  // Headings use the bundled Literata under a Sendry-only family name, so the page's own fonts are
  // untouched. If the page refuses to load it, the modal falls back to Georgia.
  function ensureFont() {
    if (fontRequested || !extensionAlive()) return;
    fontRequested = true;
    try {
      for (const [file, range] of FONT_FILES) {
        const face = new FontFace("Sendry Literata", `url("${chrome.runtime.getURL(`fonts/${file}`)}")`, { weight: "600", unicodeRange: range });
        document.fonts.add(face);
        face.load().catch(() => {});
      }
    } catch {
      // FontFace unavailable or blocked; the serif fallback is fine
    }
  }

  const TEXT_INPUT_TYPES = new Set(["", "text"]);
  const TRIGGER_SELECTOR = 'button, input[type="submit"], input[type="button"], input[type="image"], [role="button"], a';
  const POINTER_EVENTS = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
  const IS_TOP = window === window.top;

  let settings = mergeSettings(null);
  let sendRe = null;
  const cancelRe = phraseRegex(CANCEL_WORDS, "u");
  let bypass = false;
  let modal = null;
  let pending = null;
  let gesture = null;
  let lastPass = { el: null, ts: 0 };
  let lastBlockTs = 0;
  let tornDown = false;

  const cleanups = [];
  const hookedRoots = new WeakSet();

  function teardown() {
    if (tornDown) return;
    tornDown = true;
    cleanups.forEach((fn) => fn());
    closeModal();
    if (window.__sendryTeardown === teardown) delete window.__sendryTeardown;
  }
  window.__sendryTeardown = teardown;

  function extensionAlive() {
    return typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id;
  }

  // Every listener goes through here so teardown can remove it, and so a copy orphaned by an
  // extension reload switches itself off the first time it sees an event.
  function on(target, type, fn, opts) {
    const wrapped = (e) => {
      if (!extensionAlive()) {
        teardown();
        return;
      }
      fn(e);
    };
    target.addEventListener(type, wrapped, opts);
    cleanups.push(() => target.removeEventListener(type, wrapped, opts));
  }

  function applySettings(next) {
    settings = next;
    sendRe = phraseRegex([...SEND_WORDS, ...settings.extraSendWords], "u");
  }
  applySettings(settings);

  if (extensionAlive()) {
    getSettings().then(applySettings).catch(() => {});
    const onStorage = (changes, area) => {
      if (isSettingsChange(changes, area)) applySettings(mergeSettings(changes.settings.newValue));
    };
    try {
      chrome.storage.onChanged.addListener(onStorage);
      cleanups.push(() => chrome.storage.onChanged.removeListener(onStorage));
    } catch {
      // settings changes will apply after the next page load instead
    }
  }

  function safeRecord(delta, ids) {
    if (!extensionAlive()) return;
    recordStats(delta, ids).catch(() => {});
  }

  function pageHost() {
    try {
      return window.top.location.hostname || location.hostname;
    } catch {
      return location.hostname;
    }
  }

  function active() {
    return settings.enabled && !isSiteDisabled(settings, pageHost());
  }

  // ---------- shadow DOM helpers ----------

  function shadowOf(el) {
    try {
      if (chrome.dom && chrome.dom.openOrClosedShadowRoot) return chrome.dom.openOrClosedShadowRoot(el);
    } catch {
      // not an element that can host a shadow root
    }
    return el.shadowRoot || null;
  }

  // Events from inside a closed shadow root are retargeted to its host, so follow the focus chain
  // down to the element that actually has focus.
  function innermost(node) {
    let el = node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement;
    for (let depth = 0; el && depth < 20; depth++) {
      const root = shadowOf(el);
      if (!root || !root.activeElement) break;
      el = root.activeElement;
    }
    return el;
  }

  function eventTarget(e) {
    return innermost(e.composedPath()[0] || e.target);
  }

  function closestDeep(node, selector) {
    let el = node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement;
    while (el) {
      const hit = el.closest(selector);
      if (hit) return hit;
      const root = el.getRootNode();
      el = root instanceof ShadowRoot ? root.host : null;
    }
    return null;
  }

  function deepQueryAll(root, selector, out = []) {
    out.push(...root.querySelectorAll(selector));
    for (const el of root.querySelectorAll("*")) {
      const sr = shadowOf(el);
      if (sr) deepQueryAll(sr, selector, out);
    }
    return out;
  }

  // `submit` is not a composed event, so a form inside a shadow root never reaches window.
  // Hook each shadow root the user types in, the first time we see it.
  function hookShadowRoots(e) {
    let node = eventTarget(e);
    for (let root = node && node.getRootNode(); root instanceof ShadowRoot; root = root.host.getRootNode()) {
      if (!hookedRoots.has(root)) {
        hookedRoots.add(root);
        on(root, "submit", onSubmit, true);
      }
    }
  }

  // ---------- editable fields ----------

  function editableRoot(node) {
    let el = node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement;
    if (!el) return null;
    if (el.tagName === "TEXTAREA") return el;
    if (el.tagName === "INPUT") {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (!TEXT_INPUT_TYPES.has(type)) return null;
      if (el.getAttribute("role") === "combobox" || el.hasAttribute("aria-autocomplete")) return null;
      return el;
    }
    if (el.isContentEditable) {
      while (el.parentElement && el.parentElement.isContentEditable) el = el.parentElement;
      return el;
    }
    return null;
  }

  function isTextControl(f) {
    return f.tagName === "TEXTAREA" || f.tagName === "INPUT";
  }

  function fieldText(el) {
    if (isTextControl(el)) return el.value || "";
    return textModel(el).text;
  }

  function markPaste(root, text) {
    root.dataset.sendryTouched = "1";
    root.dataset.sendryPasted = String(Number(root.dataset.sendryPasted || 0) + text.length);
    root.dataset.sendryPasteTs = String(Date.now());
  }

  on(window, "focusin", hookShadowRoots, true);

  on(window, "paste", (e) => {
    const root = editableRoot(eventTarget(e));
    if (!root) return;
    markPaste(root, (e.clipboardData && e.clipboardData.getData("text/plain")) || "");
  }, true);

  on(window, "drop", (e) => {
    const root = editableRoot(eventTarget(e));
    if (!root || !e.dataTransfer) return;
    const text = e.dataTransfer.getData("text/plain");
    if (text) markPaste(root, text);
  }, true);

  on(window, "input", (e) => {
    hookShadowRoots(e);
    const root = editableRoot(eventTarget(e));
    if (!root) return;
    root.dataset.sendryTouched = "1";
    if (!fieldText(root).trim()) {
      delete root.dataset.sendryPasted;
      delete root.dataset.sendryPasteTs;
    }
  }, true);

  function touchedIn(container, { includeInputs = true } = {}) {
    const found = [];
    const add = (el) => {
      if (!includeInputs && el.tagName === "INPUT") return;
      if (el.isConnected && fieldText(el).trim() && !found.includes(el)) found.push(el);
    };
    if (container.matches && container.matches("[data-sendry-touched]")) add(container);
    deepQueryAll(container, "[data-sendry-touched]").forEach(add);
    deepQueryAll(container, "iframe").forEach((frame) => {
      try {
        const doc = frame.contentDocument;
        if (doc) deepQueryAll(doc, "[data-sendry-touched]").forEach(add);
      } catch {
        // cross-origin frame: its own content script handles it
      }
    });
    return found;
  }

  function collectFields(anchor) {
    const scope = closestDeep(anchor, 'form, [role="dialog"], dialog');
    let fields = scope ? touchedIn(scope) : [];
    if (fields.length === 0) fields = touchedIn(anchor.ownerDocument, { includeInputs: false });
    return fields;
  }

  // ---------- analysis ----------

  function runCheck(fields) {
    const byId = new Map();
    for (const field of fields) {
      const text = fieldText(field);
      for (const issue of analyzeText(text, settings, { singleLine: field.tagName === "INPUT" })) {
        issue.hits.forEach((h) => { h.field = field; });
        const prev = byId.get(issue.id);
        if (prev) {
          prev.count += issue.count;
          prev.hits.push(...issue.hits);
          if (SEVERITY_ORDER[issue.severity] < SEVERITY_ORDER[prev.severity]) prev.severity = issue.severity;
        } else {
          byId.set(issue.id, issue);
        }
      }
    }

    let cooldown = 0;
    if (settings.detectors.paste) {
      const bodies = fields.filter((f) => f.tagName !== "INPUT");
      let len = 0, pasted = 0, lastTs = 0, all = "";
      for (const f of bodies) {
        const t = fieldText(f);
        len += t.length;
        pasted += Math.min(t.length, Number(f.dataset.sendryPasted || 0));
        lastTs = Math.max(lastTs, Number(f.dataset.sendryPasteTs || 0));
        all += t + "\n";
      }
      const ratio = len > 0 ? Math.round((pasted / len) * 100) : 0;
      if (len >= 80 && lastTs && ratio >= settings.pasteRatio) {
        const need = computeReadSeconds(all, settings);
        const elapsed = Math.floor((Date.now() - lastTs) / 1000);
        if (elapsed < need) {
          cooldown = need - elapsed;
          byId.set("paste", {
            id: "paste", severity: "medium", count: 1, hits: [],
            title: `Yapıştırdıktan ${elapsed} sn sonra gönderiyorsun`,
            detail: `Metnin %${ratio}'i yapıştırılmış. Okuması yaklaşık ${need} sn sürer; en azından bir kez baştan sona oku.`
          });
        } else {
          byId.set("paste", {
            id: "paste", severity: "low", count: 1, hits: [],
            title: `Metnin %${ratio}'i yapıştırılmış`,
            detail: "İsim, tarih, saat ve kişisel bilgilerin sana ait olduğundan emin ol."
          });
        }
      }
    }

    const issues = [...byId.values()].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    return { issues, fields, cooldown, block: issues.some((i) => i.severity !== "low") };
  }

  function evaluate(anchor, fields = collectFields(anchor)) {
    if (fields.length === 0) return null;
    const result = runCheck(fields);
    if (result.block) {
      lastBlockTs = Date.now();
      safeRecord({ checked: 1, blocked: 1 }, result.issues.filter((i) => i.severity !== "low").map((i) => i.id));
    } else {
      const fixed = lastBlockTs && Date.now() - lastBlockTs < FIX_WINDOW_MS;
      lastBlockTs = 0;
      safeRecord(fixed ? { checked: 1, fixed: 1 } : { checked: 1 });
    }
    return result;
  }

  // ---------- send triggers ----------

  function buttonLabel(el) {
    const attr = el.getAttribute("aria-label") || el.getAttribute("data-tooltip") || el.getAttribute("title");
    if (attr) return attr;
    if (el.tagName === "INPUT") return el.value || "";
    const text = (el.innerText || "").trim();
    return text.length <= 40 ? text : "";
  }

  // Walk the composed path from the innermost node outwards, so a <button> inside a web component
  // and a custom element like <my-send-button> are both found.
  function findSendTrigger(path) {
    for (const el of path) {
      if (!(el instanceof Element) || el === document.body || el === document.documentElement) continue;
      // A click that lands in a text box is never a send, whatever the wrapper around it is called.
      if (editableRoot(el)) return null;
      const custom = el.tagName.includes("-");
      if (!custom && !el.matches(TRIGGER_SELECTOR)) continue;
      if (el.disabled || el.getAttribute("aria-disabled") === "true") return null;

      // Custom elements often carry descriptive aria-labels ("Comment composer"), so unless they
      // declare themselves a button, only their short visible text counts as a label.
      let label;
      if (custom && el.getAttribute("role") !== "button") {
        const text = (el.innerText || "").trim();
        label = text.length <= 40 ? fold(text) : "";
      } else {
        label = fold(buttonLabel(el));
      }
      if (label && cancelRe.test(label)) return null;
      if (label && sendRe.test(label)) return el;

      const isSubmit = (el.tagName === "BUTTON" && el.type === "submit")
        || (el.tagName === "INPUT" && (el.type === "submit" || el.type === "image"));
      if (isSubmit && el.form && touchedIn(el.form).length > 0) return el;
    }
    return null;
  }

  function swallow(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onPointer(e) {
    if (bypass || !e.isTrusted || e.button !== 0) return;
    const path = e.composedPath();
    if (modal && path.includes(modal.host)) return;

    const btn = findSendTrigger(path);
    if (!btn) return;

    const now = Date.now();
    if (gesture && gesture.el === btn && now < gesture.until) {
      if (gesture.blocked) swallow(e);
      if (e.type === "click") gesture = null;
      return;
    }
    if (!active() || modal) return;

    const result = evaluate(btn);
    const blocked = !!(result && result.block);
    gesture = e.type === "click" ? null : { el: btn, until: now + 2000, blocked };
    if (!blocked) {
      lastPass = { el: btn, ts: now };
      return;
    }
    swallow(e);
    present(result, () => replayClick(btn));
  }

  POINTER_EVENTS.forEach((type) => on(window, type, onPointer, true));

  on(window, "keydown", (e) => {
    if (bypass || !e.isTrusted || e.key !== "Enter" || e.isComposing) return;
    const target = eventTarget(e);
    const root = editableRoot(target);
    if (!root) return;
    const combo = e.ctrlKey || e.metaKey;
    const plain = settings.checkPlainEnter && !combo && !e.shiftKey && !e.altKey && root.tagName !== "INPUT";
    if (!combo && !plain) return;
    if (!active() || modal) return;

    root.dataset.sendryTouched = "1";
    const result = evaluate(root);
    if (!result || !result.block) return;
    swallow(e);
    const init = {
      key: "Enter", code: "Enter", keyCode: 13, which: 13,
      ctrlKey: e.ctrlKey, metaKey: e.metaKey, bubbles: true, cancelable: true, composed: true
    };
    present(result, () => {
      for (const type of ["keydown", "keypress", "keyup"]) target.dispatchEvent(new KeyboardEvent(type, init));
    });
  }, true);

  function onSubmit(e) {
    if (bypass || !e.isTrusted || !active() || modal) return;
    const form = e.target;
    if (lastPass.el && form.contains(lastPass.el) && Date.now() - lastPass.ts < 1500) return;

    const fields = touchedIn(form);
    const result = evaluate(form, fields);
    if (!result || !result.block) return;
    swallow(e);
    const submitter = e.submitter && e.submitter.form === form ? e.submitter : undefined;
    present(result, () => form.requestSubmit(submitter));
  }

  on(window, "submit", onSubmit, true);

  function replayClick(el) {
    const opts = { bubbles: true, cancelable: true, composed: true, view: window, button: 0 };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerType: "mouse", isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerType: "mouse", isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.click();
  }

  // ---------- decisions: where the modal shows and what its buttons do ----------
  //
  // A blocked send becomes a "pending" decision in the frame that owns the fields. The modal itself
  // is plain data (a view), so a frame can hand it to the top page through background.js and get the
  // user's choice back as an action. That keeps the modal full-size even for editors in iframes.

  function snippetParts(hit) {
    const full = fieldText(hit.field);
    const start = Math.max(0, hit.index - 22);
    const end = Math.min(full.length, hit.index + hit.length + 22);
    return {
      before: (start > 0 ? "…" : "") + visibleText(full.slice(start, hit.index)),
      match: visibleText(full.slice(hit.index, hit.index + hit.length)),
      after: visibleText(full.slice(hit.index + hit.length, end)) + (end < full.length ? "…" : ""),
      note: hit.note || ""
    };
  }

  function buildView(result) {
    const fixable = fixableIds(result);
    return {
      cooldown: result.cooldown,
      requireConfirm: settings.requireConfirm,
      fixAllIds: fixable.length > 1 ? FIX_ORDER.filter((id) => settings.detectors[id]) : [],
      issues: result.issues.map((i) => ({
        id: i.id,
        severity: i.severity,
        title: i.title,
        detail: i.detail,
        count: i.count,
        fixable: fixable.includes(i.id),
        mark: (DETECTOR_INFO[i.id] && DETECTOR_INFO[i.id].mark) || "!",
        hits: i.hits.slice(0, 3).map(snippetParts)
      }))
    };
  }

  // The send has already been swallowed by the time we get here. If the modal can't be shown for
  // any reason, let the send through: Sendry must never leave the user unable to send at all.
  function failOpen(onSend, err) {
    console.warn("[Sendry] could not show the warning, letting the send through", err);
    pending = null;
    bypass = true;
    try {
      onSend();
    } finally {
      bypass = false;
    }
  }

  function present(result, onSend) {
    let view;
    try {
      pending = { result, onSend };
      view = buildView(result);
    } catch (err) {
      failOpen(onSend, err);
      return;
    }
    const local = () => {
      try {
        showModal(view, handleAction);
      } catch (err) {
        closeModal();
        failOpen(onSend, err);
      }
    };
    if (IS_TOP || !extensionAlive()) {
      local();
      return;
    }
    chrome.runtime.sendMessage({ type: "sendry:present", view })
      .then((res) => { if (!res || !res.ok) local(); })
      .catch(local);
  }

  function notify(message) {
    if (IS_TOP || !extensionAlive()) {
      showToast(message);
      return;
    }
    chrome.runtime.sendMessage({ type: "sendry:toast", message }).catch(() => showToast(message));
  }

  function handleAction(action) {
    if (!pending) return;
    const { result, onSend } = pending;
    pending = null;

    if (action.kind === "send") {
      lastBlockTs = 0;
      safeRecord({ bypassed: 1 });
      bypass = true;
      try {
        onSend();
      } finally {
        bypass = false;
      }
    } else if (action.kind === "fix") {
      runFixes(result, action.ids, onSend);
    } else if (action.kind === "select") {
      const issue = result.issues[action.issueIndex];
      const hit = issue && issue.hits[action.hitIndex];
      if (hit) selectHit(hit);
    } else {
      const first = result.issues.flatMap((i) => i.hits)[0];
      if (first) selectHit(first);
      else if (result.fields[0]) result.fields[0].focus();
    }
  }

  if (extensionAlive()) {
    const onMessage = (msg, sender, sendResponse) => {
      if (!msg || typeof msg.type !== "string") return;
      if (msg.type === "sendry:present" && IS_TOP) {
        try {
          showModal(msg.view, (action) => {
            chrome.runtime.sendMessage({ type: "sendry:action", frameId: msg.frameId, action }).catch(() => {});
          });
          sendResponse({ ok: true });
        } catch {
          closeModal();
          sendResponse({ ok: false });
        }
      } else if (msg.type === "sendry:action" && !IS_TOP) {
        handleAction(msg.action);
      } else if (msg.type === "sendry:toast" && IS_TOP) {
        showToast(msg.message);
      }
    };
    try {
      chrome.runtime.onMessage.addListener(onMessage);
      cleanups.push(() => chrome.runtime.onMessage.removeListener(onMessage));
    } catch {
      // without messaging, iframes simply show their modal locally
    }
  }

  // ---------- selecting and fixing text ----------

  function selectHit(hit) {
    const f = hit.field;
    if (!f || !f.isConnected) return;
    f.focus();
    if (isTextControl(f)) {
      f.setSelectionRange(hit.index, hit.index + hit.length);
      return;
    }
    // Hit offsets come from the same text model, so they map straight back to DOM positions.
    const doc = f.ownerDocument;
    const { locate } = textModel(f);
    const range = doc.createRange();
    range.setStart(...locate(hit.index));
    range.setEnd(...locate(hit.index + hit.length));
    const sel = doc.defaultView.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const anchor = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    if (anchor) anchor.scrollIntoView({ block: "nearest" });
  }

  const BLOCK_TAGS = /^(DIV|P|LI|UL|OL|H[1-6]|BLOCKQUOTE|PRE|TR|TABLE|SECTION|ARTICLE)$/;

  // Quoted history in replies and forwards (Gmail, Outlook, Thunderbird, Yahoo, Apple Mail).
  // It isn't what the user is writing, and its "From:/Subject:" lines and second sign-off would
  // otherwise trigger the header and duplicate checks on every reply.
  const QUOTE_SELECTOR = [
    "blockquote", ".gmail_quote", ".gmail_attr", "[type=cite]", "#divRplyFwdMsg", "#appendonsend",
    ".moz-cite-prefix", ".yahoo_quoted", "[data-marker=__QUOTED_TEXT__]"
  ].join(", ");

  // Plain-text view of a field plus a way to map text offsets back to DOM positions.
  // Block boundaries and <br> become "\n" so fixes see the same line structure the user sees.
  // For rich editors this is also the text Sendry analyses, so hits, fixes and selections all share
  // one set of offsets.
  function textModel(field) {
    if (isTextControl(field)) return { text: field.value, locate: null };
    let text = "";
    const segs = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          segs.push({ node: child, start: text.length });
          text += child.data;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.tagName === "BR") {
            text += "\n";
            continue;
          }
          if (child.matches(QUOTE_SELECTOR) || child.hidden) continue;
          if (child.style && child.style.display === "none") continue;
          const block = BLOCK_TAGS.test(child.tagName);
          if (block && text && !text.endsWith("\n")) text += "\n";
          walk(child);
          if (block && text && !text.endsWith("\n")) text += "\n";
        }
      }
    };
    walk(field);
    text = text.replace(/\n+$/, "");
    const locate = (p) => {
      for (const s of segs) {
        if (p >= s.start && p <= s.start + s.node.data.length) return [s.node, p - s.start];
      }
      const next = segs.find((s) => s.start > p);
      if (next) return [next.node, 0];
      const last = segs[segs.length - 1];
      return last ? [last.node, last.node.data.length] : [field, field.childNodes.length];
    };
    return { text, locate };
  }

  function applyEdit(field, edit) {
    const doc = field.ownerDocument;
    field.focus();
    if (isTextControl(field)) {
      field.setSelectionRange(edit.start, edit.end);
    } else {
      const { locate } = textModel(field);
      const range = doc.createRange();
      range.setStart(...locate(edit.start));
      range.setEnd(...locate(edit.end));
      const sel = doc.defaultView.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    if (edit.end > edit.start) doc.execCommand("delete");
    edit.text.split("\n").forEach((part, i) => {
      if (i > 0) doc.execCommand(isTextControl(field) ? "insertText" : "insertLineBreak", false, "\n");
      if (part) doc.execCommand("insertText", false, part);
    });
  }

  function fixApplies(field, id) {
    return !(field.tagName === "INPUT" && id !== "markdown");
  }

  function fixableIds(result) {
    return FIX_ORDER.filter((id) =>
      result.issues.some((i) => i.id === id) &&
      result.fields.some((f) => fixApplies(f, id) && computeFixEdits(id, textModel(f).text).length > 0));
  }

  function fixField(field, ids) {
    const original = textModel(field).text;
    const mode = fixMode(original);
    for (const id of FIX_ORDER) {
      if (!ids.includes(id) || !fixApplies(field, id)) continue;
      const before = textModel(field).text;
      const edits = computeFixEdits(id, before, mode);
      if (edits.length === 0) continue;
      edits.forEach((e) => applyEdit(field, e));

      // Some pages block execCommand in text boxes; fall back to setting the value directly.
      const expected = applyEditsToString(before, edits);
      if (isTextControl(field) && field.value !== expected) {
        const proto = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(field, expected);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
    return textModel(field).text !== original;
  }

  function runFixes(result, ids, onSend) {
    let changed = 0;
    for (const field of result.fields) {
      if (field.isConnected && fixField(field, ids)) changed += 1;
    }
    const next = runCheck(result.fields);
    if (next.block) {
      present(next, onSend);
      return;
    }
    if (result.fields[0]) result.fields[0].focus();
    notify(changed > 0
      ? "Düzeltildi. Metne bir göz at, sonra tekrar gönder. (Geri almak için Ctrl+Z)"
      : "Düzeltilecek bir şey kalmadı.");
  }

  // ---------- UI ----------

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function showToast(message) {
    ensureFont();
    const host = document.createElement("sendry-toast");
    host.style.cssText = "all: initial; position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483647;";
    const root = host.attachShadow({ mode: SHADOW_MODE });
    const style = el("style");
    style.textContent = TOAST_CSS;
    const toast = el("div", "toast");
    toast.append(el("b", null, "Sendry"), el("span", null, message));
    root.append(style, toast);
    document.documentElement.appendChild(host);
    setTimeout(() => host.remove(), 5000);
  }

  const COUNT_WORDS = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];

  // Renders a view (plain data) and reports the user's choice as an action; it never touches the
  // page's fields itself, so the same modal works for this frame or for a child frame.
  function showModal(view, onAction) {
    closeModal();
    ensureFont();
    const host = document.createElement("sendry-modal");
    host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
    const root = host.attachShadow({ mode: SHADOW_MODE });

    const act = (action) => {
      closeModal();
      onAction(action);
    };

    const style = el("style");
    style.textContent = MODAL_CSS;
    const scrim = el("div", "scrim");
    const dialog = el("div", "dialog");
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "sendry-title");

    const blocking = view.issues.filter((i) => i.severity !== "low").length;
    const header = el("header");
    header.innerHTML = ICON_SVG;
    const heading = el("div");
    const title = el("h2", null, `Göndermeden önce ${COUNT_WORDS[blocking] || blocking} şeye bak`);
    title.id = "sendry-title";
    heading.append(title, el("p", "sub", "Mesaj şu haliyle karşı tarafa gidecek."));
    header.append(heading);

    const list = el("ul", "issues");
    view.issues.forEach((issue, issueIndex) => {
      const li = el("li", `issue ${issue.severity}`);
      const heading = el("strong", null, issue.title);
      li.append(el("span", "mk", issue.mark), el("div"));
      li.lastChild.append(heading);
      if (issue.count > 1) li.lastChild.append(el("span", "count", ` (${issue.count})`));
      if (issue.fixable) {
        const btn = el("button", "fix");
        btn.type = "button";
        btn.append(el("span", "pm", issue.mark), FIX_LABELS[issue.id]);
        btn.addEventListener("click", () => act({ kind: "fix", ids: [issue.id] }));
        li.append(btn);
      }
      li.append(el("p", "detail", issue.detail));
      if (issue.hits.length > 0) {
        const snippets = el("div", "snippets");
        issue.hits.forEach((parts, hitIndex) => {
          const chip = el("button", "snippet");
          chip.type = "button";
          chip.title = "Metinde göster";
          chip.append(parts.before, el("mark", null, parts.match), parts.after);
          chip.addEventListener("click", () => act({ kind: "select", issueIndex, hitIndex }));
          snippets.append(chip);
          // Per-hit explanation (e.g. which weekday a date really is), unless it already is the detail.
          if (parts.note && parts.note !== issue.detail) snippets.append(el("span", "note", parts.note));
        });
        li.append(snippets);
      }
      list.append(li);
    });

    const footer = el("footer");
    const confirmRow = el("label", "confirm");
    const checkbox = el("input");
    checkbox.type = "checkbox";
    confirmRow.append(checkbox, el("span", null, "Metni baştan sona okudum. İsimler, tarihler ve saatler doğru."));
    if (!view.requireConfirm) confirmRow.hidden = true;

    const actions = el("div", "actions");
    const sendBtn = el("button", "ghost send");
    sendBtn.type = "button";
    const editBtn = el("button", "primary", "Düzenlemeye dön");
    editBtn.type = "button";
    actions.append(sendBtn);
    if (view.fixAllIds.length > 0) {
      const fixAllBtn = el("button", "ghost fix-all", "Hepsini düzelt");
      fixAllBtn.type = "button";
      fixAllBtn.addEventListener("click", () => act({ kind: "fix", ids: view.fixAllIds }));
      actions.append(fixAllBtn);
    }
    actions.append(editBtn);
    footer.append(confirmRow, actions);

    dialog.append(header, list, footer);
    scrim.append(dialog);
    root.append(style, scrim);

    let remaining = view.cooldown;
    const refresh = () => {
      const ready = remaining <= 0 && (!view.requireConfirm || checkbox.checked);
      sendBtn.disabled = !ready;
      sendBtn.textContent = remaining > 0 ? `Yine de gönder · ${remaining} sn` : "Yine de gönder";
    };
    const timer = setInterval(() => {
      remaining -= 1;
      refresh();
      if (remaining <= 0) clearInterval(timer);
    }, 1000);
    refresh();

    checkbox.addEventListener("change", refresh);
    editBtn.addEventListener("click", () => act({ kind: "edit" }));
    sendBtn.addEventListener("click", () => {
      if (!sendBtn.disabled) act({ kind: "send" });
    });
    scrim.addEventListener("click", (e) => {
      if (e.target === scrim) editBtn.click();
    });
    host.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") editBtn.click();
    });

    document.documentElement.appendChild(host);
    modal = { host, timer };
    // Without preventScroll a long list would open scrolled to the buttons, hiding the heading.
    editBtn.focus({ preventScroll: true });
  }

  function closeModal() {
    if (!modal) return;
    clearInterval(modal.timer);
    modal.host.remove();
    modal = null;
  }
})();
