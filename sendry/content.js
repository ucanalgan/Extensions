(() => {
  if (window.__sendryLoaded) return;
  window.__sendryLoaded = true;

  const TEXT_INPUT_TYPES = new Set(["", "text"]);
  const TRIGGER_SELECTOR = 'button, input[type="submit"], input[type="button"], input[type="image"], [role="button"], a';
  const POINTER_EVENTS = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];

  let settings = mergeSettings(null);
  let sendRe = null;
  let cancelRe = phraseRegex(CANCEL_WORDS, "u");
  let bypass = false;
  let modal = null;
  let gesture = null;
  let lastPass = { el: null, ts: 0 };
  let lastBlockTs = 0;

  function applySettings(next) {
    settings = next;
    sendRe = phraseRegex([...SEND_WORDS, ...settings.extraSendWords], "u");
  }
  applySettings(settings);

  function extensionAlive() {
    return typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id;
  }

  if (extensionAlive()) {
    getSettings().then(applySettings).catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.settings) applySettings(mergeSettings(changes.settings.newValue));
    });
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

  // ---------- editable fields ----------

  function editableRoot(node) {
    let el = node && node.nodeType === 1 ? node : node && node.parentElement;
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

  function fieldText(el) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el.value || "";
    return el.innerText || "";
  }

  function markPaste(root, text) {
    root.dataset.sendryTouched = "1";
    root.dataset.sendryPasted = String(Number(root.dataset.sendryPasted || 0) + text.length);
    root.dataset.sendryPasteTs = String(Date.now());
  }

  window.addEventListener("paste", (e) => {
    const root = editableRoot(e.target);
    if (!root) return;
    markPaste(root, (e.clipboardData && e.clipboardData.getData("text/plain")) || "");
  }, true);

  window.addEventListener("drop", (e) => {
    const root = editableRoot(e.target);
    if (!root || !e.dataTransfer) return;
    const text = e.dataTransfer.getData("text/plain");
    if (text) markPaste(root, text);
  }, true);

  window.addEventListener("input", (e) => {
    const root = editableRoot(e.target);
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
    container.querySelectorAll("[data-sendry-touched]").forEach(add);
    container.querySelectorAll("iframe").forEach((frame) => {
      try {
        const doc = frame.contentDocument;
        if (doc) doc.querySelectorAll("[data-sendry-touched]").forEach(add);
      } catch {
        // cross-origin frame: its own content script handles it
      }
    });
    return found;
  }

  function collectFields(anchor) {
    const scope = anchor.closest('form, [role="dialog"], dialog');
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

  function findSendTrigger(target) {
    const el = target && target.closest && target.closest(TRIGGER_SELECTOR);
    if (!el) return null;
    if (el.disabled || el.getAttribute("aria-disabled") === "true") return null;

    const label = fold(buttonLabel(el));
    if (label && cancelRe.test(label)) return null;
    if (label && sendRe.test(label)) return el;

    const isSubmit = (el.tagName === "BUTTON" && el.type === "submit")
      || (el.tagName === "INPUT" && (el.type === "submit" || el.type === "image"));
    if (isSubmit && el.form && touchedIn(el.form).length > 0) return el;
    return null;
  }

  function swallow(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onPointer(e) {
    if (bypass || !e.isTrusted || e.button !== 0) return;
    if (modal && e.composedPath().includes(modal.host)) return;

    const btn = findSendTrigger(e.target);
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
    openModal(result, () => replayClick(btn));
  }

  POINTER_EVENTS.forEach((type) => window.addEventListener(type, onPointer, true));

  window.addEventListener("keydown", (e) => {
    if (bypass || !e.isTrusted || e.key !== "Enter" || e.isComposing) return;
    const root = editableRoot(e.target);
    if (!root) return;
    const combo = e.ctrlKey || e.metaKey;
    const plain = settings.checkPlainEnter && !combo && !e.shiftKey && !e.altKey && root.tagName !== "INPUT";
    if (!combo && !plain) return;
    if (!active() || modal) return;

    root.dataset.sendryTouched = "1";
    const result = evaluate(root);
    if (!result || !result.block) return;
    swallow(e);
    const target = e.target;
    const init = {
      key: "Enter", code: "Enter", keyCode: 13, which: 13,
      ctrlKey: e.ctrlKey, metaKey: e.metaKey, bubbles: true, cancelable: true, composed: true
    };
    openModal(result, () => {
      for (const type of ["keydown", "keypress", "keyup"]) target.dispatchEvent(new KeyboardEvent(type, init));
    });
  }, true);

  window.addEventListener("submit", (e) => {
    if (bypass || !e.isTrusted || !active() || modal) return;
    const form = e.target;
    if (lastPass.el && form.contains(lastPass.el) && Date.now() - lastPass.ts < 1500) return;

    const fields = touchedIn(form);
    const result = evaluate(form, fields);
    if (!result || !result.block) return;
    swallow(e);
    const submitter = e.submitter && e.submitter.form === form ? e.submitter : undefined;
    openModal(result, () => form.requestSubmit(submitter));
  }, true);

  function replayClick(el) {
    const opts = { bubbles: true, cancelable: true, composed: true, view: window, button: 0 };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerType: "mouse", isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerType: "mouse", isPrimary: true }));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.click();
  }

  // ---------- modal ----------

  function selectHit(hit) {
    const f = hit.field;
    if (!f || !f.isConnected) return;
    f.focus();
    if (f.tagName === "TEXTAREA" || f.tagName === "INPUT") {
      f.setSelectionRange(hit.index, hit.index + hit.length);
      return;
    }
    const doc = f.ownerDocument;
    const win = doc.defaultView;
    const sel = win.getSelection();
    const range = doc.createRange();
    range.setStart(f, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    win.find(hit.text.split("\n")[0], true, false, false, false, false, false);
  }

  // ---------- one-click fixes ----------

  const BLOCK_TAGS = /^(DIV|P|LI|UL|OL|H[1-6]|BLOCKQUOTE|PRE|TR|TABLE|SECTION|ARTICLE)$/;

  function isTextControl(f) {
    return f.tagName === "TEXTAREA" || f.tagName === "INPUT";
  }

  // Plain-text view of a field plus a way to map text offsets back to DOM positions.
  // Block boundaries and <br> become "\n" so fixes see the same line structure the user sees.
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
    closeModal();
    let changed = 0;
    for (const field of result.fields) {
      if (field.isConnected && fixField(field, ids)) changed += 1;
    }
    const next = runCheck(result.fields);
    if (next.block) {
      openModal(next, onSend);
      return;
    }
    if (result.fields[0]) result.fields[0].focus();
    showToast(changed > 0
      ? "Düzeltildi. Metne bir göz at, sonra tekrar gönder. (Geri almak için Ctrl+Z)"
      : "Düzeltilecek bir şey kalmadı.");
  }

  function showToast(message) {
    const host = document.createElement("sendry-toast");
    host.style.cssText = "all: initial; position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483647;";
    const root = host.attachShadow({ mode: "closed" });
    const style = el("style");
    style.textContent = TOAST_CSS;
    root.append(style, el("div", "toast", message));
    document.documentElement.appendChild(host);
    setTimeout(() => host.remove(), 5000);
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderSnippet(hit) {
    const full = fieldText(hit.field);
    const start = Math.max(0, hit.index - 22);
    const end = Math.min(full.length, hit.index + hit.length + 22);
    const clean = (s) => s.replace(/\n/g, " ↵ ");
    const chip = el("button", "snippet");
    chip.type = "button";
    chip.title = "Metinde göster";
    chip.append(
      (start > 0 ? "…" : "") + clean(full.slice(start, hit.index)),
      el("mark", null, clean(full.slice(hit.index, hit.index + hit.length))),
      clean(full.slice(hit.index + hit.length, end)) + (end < full.length ? "…" : "")
    );
    chip.addEventListener("click", () => {
      closeModal();
      selectHit(hit);
    });
    return chip;
  }

  function openModal(result, onSend) {
    const host = document.createElement("sendry-modal");
    host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
    const root = host.attachShadow({ mode: "closed" });

    const style = el("style");
    style.textContent = MODAL_CSS;
    const backdrop = el("div", "backdrop");
    const dialog = el("div", "dialog");
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "sendry-title");

    const header = el("div", "header");
    const title = el("h2", null, "Göndermeden önce bir bak");
    title.id = "sendry-title";
    const blocking = result.issues.filter((i) => i.severity !== "low").length;
    header.append(el("span", "badge", "Sendry"), title,
      el("p", "sub", `Bu mesajda ${blocking} sorun buldum. Karşı tarafa bu haliyle gidecek.`));

    const fixable = fixableIds(result);
    const list = el("ul", "issues");
    for (const issue of result.issues) {
      const li = el("li", `issue ${issue.severity}`);
      const head = el("div", "issue-head");
      head.append(el("span", "dot"), el("strong", null, issue.title));
      if (issue.count > 1) head.append(el("span", "count", `×${issue.count}`));
      if (fixable.includes(issue.id)) {
        const btn = el("button", "fix", FIX_LABELS[issue.id]);
        btn.type = "button";
        btn.title = "Tek tıkla düzelt";
        btn.addEventListener("click", () => runFixes(result, [issue.id], onSend));
        head.append(btn);
      }
      li.append(head, el("p", "detail", issue.detail));
      if (issue.hits.length > 0) {
        const snippets = el("div", "snippets");
        issue.hits.slice(0, 3).forEach((h) => snippets.append(renderSnippet(h)));
        li.append(snippets);
      }
      list.append(li);
    }

    const confirmRow = el("label", "confirm");
    const checkbox = el("input");
    checkbox.type = "checkbox";
    confirmRow.append(checkbox, el("span", null, "Metni baştan sona okudum; isim, tarih, saat ve bilgiler doğru."));
    if (!settings.requireConfirm) confirmRow.hidden = true;

    const actions = el("div", "actions");
    const sendBtn = el("button", "ghost");
    sendBtn.type = "button";
    const fixBtn = el("button", "primary", "Düzenlemeye dön");
    fixBtn.type = "button";
    actions.append(sendBtn);
    if (fixable.length > 1) {
      const fixAllBtn = el("button", "ghost fix-all", "Hepsini düzelt");
      fixAllBtn.type = "button";
      // Run every enabled fix, not just the visible ones: cleaning "**Konu:**" can reveal a header line.
      const allIds = FIX_ORDER.filter((id) => settings.detectors[id]);
      fixAllBtn.addEventListener("click", () => runFixes(result, allIds, onSend));
      actions.append(fixAllBtn);
    }
    actions.append(fixBtn);

    dialog.append(header, list, confirmRow, actions);
    backdrop.append(dialog);
    root.append(style, backdrop);

    let remaining = result.cooldown;
    const refresh = () => {
      const ready = remaining <= 0 && (!settings.requireConfirm || checkbox.checked);
      sendBtn.disabled = !ready;
      sendBtn.textContent = remaining > 0 ? `Yine de gönder (${remaining} sn)` : "Yine de gönder";
    };
    const timer = setInterval(() => {
      remaining -= 1;
      refresh();
      if (remaining <= 0) clearInterval(timer);
    }, 1000);
    refresh();

    checkbox.addEventListener("change", refresh);
    fixBtn.addEventListener("click", () => {
      closeModal();
      const first = result.issues.flatMap((i) => i.hits)[0];
      if (first) selectHit(first);
      else if (result.fields[0]) result.fields[0].focus();
    });
    sendBtn.addEventListener("click", () => {
      if (sendBtn.disabled) return;
      closeModal();
      lastBlockTs = 0;
      safeRecord({ bypassed: 1 });
      bypass = true;
      try {
        onSend();
      } finally {
        bypass = false;
      }
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) fixBtn.click();
    });
    host.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") fixBtn.click();
    });

    document.documentElement.appendChild(host);
    modal = { host, timer };
    fixBtn.focus();
  }

  function closeModal() {
    if (!modal) return;
    clearInterval(modal.timer);
    modal.host.remove();
    modal = null;
  }

  const MODAL_CSS = `
    :host { all: initial; }
    .backdrop {
      --bg: #ffffff; --fg: #1f2430; --muted: #6b7280; --border: #e5e7eb; --card: #f9fafb;
      --accent: #d97706; --accent-fg: #ffffff; --high: #dc2626; --medium: #d97706; --low: #6b7280;
      --mark: #fde68a; --mark-fg: #1f2430;
      position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
      background: rgba(15, 17, 23, 0.55); padding: 16px; box-sizing: border-box;
      font-family: -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 14px; line-height: 1.45;
    }
    @media (prefers-color-scheme: dark) {
      .backdrop {
        --bg: #17181d; --fg: #e5e7eb; --muted: #9ca3af; --border: #33353d; --card: #1f2127;
        --high: #f87171; --medium: #fbbf24; --mark: #78350f; --mark-fg: #fde68a;
      }
    }
    * { box-sizing: border-box; }
    .dialog {
      width: 100%; max-width: 520px; max-height: calc(100vh - 32px); overflow-y: auto;
      background: var(--bg); color: var(--fg); border-radius: 12px; border: 1px solid var(--border);
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35); padding: 20px 22px;
    }
    .badge {
      display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: 0.02em;
      color: var(--accent); border: 1px solid var(--accent); border-radius: 999px; padding: 1px 8px;
    }
    h2 { font-size: 17px; margin: 8px 0 2px; }
    .sub { margin: 0 0 14px; color: var(--muted); font-size: 13px; }
    .issues { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .issue { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; }
    .issue-head { display: flex; align-items: center; gap: 8px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
    .high .dot { background: var(--high); }
    .medium .dot { background: var(--medium); }
    .low .dot { background: var(--low); }
    .issue-head strong { margin-right: auto; }
    .count { color: var(--muted); font-size: 12px; }
    button.fix {
      all: unset; cursor: pointer; font-size: 12px; font-weight: 600; color: var(--accent);
      border: 1px solid var(--accent); border-radius: 6px; padding: 2px 8px; white-space: nowrap;
    }
    button.fix:hover { background: var(--accent); color: var(--accent-fg); }
    .detail { margin: 4px 0 0 16px; color: var(--muted); font-size: 13px; }
    .snippets { display: flex; flex-direction: column; gap: 4px; margin: 8px 0 0 16px; }
    .snippet {
      all: unset; cursor: pointer; font-family: ui-monospace, Consolas, monospace; font-size: 12px;
      background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 6px;
      padding: 4px 8px; word-break: break-word;
    }
    .snippet:hover, .snippet:focus-visible { border-color: var(--accent); }
    mark { background: var(--mark); color: var(--mark-fg); border-radius: 3px; padding: 0 2px; }
    .confirm { display: flex; gap: 8px; align-items: flex-start; margin: 14px 0 4px; font-size: 13px; cursor: pointer; }
    .confirm[hidden] { display: none; }
    .confirm input { margin-top: 2px; accent-color: var(--accent); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
    button.primary, button.ghost {
      all: unset; cursor: pointer; border-radius: 6px; padding: 7px 14px; font-size: 13px; font-weight: 600;
    }
    button.primary { background: var(--accent); color: var(--accent-fg); }
    button.ghost { color: var(--muted); border: 1px solid var(--border); font-weight: 500; }
    button.ghost:disabled { opacity: 0.5; cursor: not-allowed; }
    button.fix-all { color: var(--accent); border-color: var(--accent); }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  `;

  const TOAST_CSS = `
    .toast {
      font-family: -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 13px;
      background: #1f2430; color: #ffffff; border-radius: 8px; padding: 10px 16px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); max-width: min(90vw, 480px);
    }
    @media (prefers-color-scheme: dark) {
      .toast { background: #e5e7eb; color: #17181d; }
    }
  `;
})();
