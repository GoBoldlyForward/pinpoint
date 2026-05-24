/*!
 * Pinpoint — drop-in feedback widget
 * https://github.com/GoBoldlyForward/pinpoint
 * MIT License — Copyright (c) 2026 Go Boldly Forward
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Pinpoint = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const STORAGE_TYPES = ["session", "local", "memory"];

  const DEFAULTS = {
    position: "bottom-left",
    storage: "session",
    storageKey: "pinpoint:pins",
    screenshot: true,
    screenshotWidth: 400,
    screenshotHeight: 200,
    html2canvasUrl:
      "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
    keyboardTrigger: null,
    autoStart: true,
    showMarkers: true,
    onPinAdd: null,
    onPinDelete: null,
    onPinClick: null,
  };

  const ICON_PIN =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>';
  const ICON_CLOSE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  class Pinpoint {
    constructor(options = {}) {
      this.opts = Object.assign({}, DEFAULTS, options || {});
      this._validateOptions();

      this.mode = "idle";
      this.pins = [];
      this._memoryStore = [];
      this._els = {};
      this._h2cPromise = null;

      this._onEsc = this._onEsc.bind(this);
      this._onPageClick = this._onPageClick.bind(this);
      this._onKeyboardTrigger = this._onKeyboardTrigger.bind(this);
      this._onDocClick = this._onDocClick.bind(this);

      if (!this.opts.autoStart) return;

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => this.start(), {
          once: true,
        });
      } else {
        this.start();
      }
    }

    // ─── Lifecycle ───────────────────────────────────────────────

    start() {
      if (this._started) return this;
      this._started = true;
      this._loadPins();
      this._renderRoot();
      this._renderTrigger();
      this._renderPinLayer();
      this._renderAllPins();
      this._bindGlobalKeys();
      document.addEventListener("click", this._onDocClick, true);
      return this;
    }

    destroy() {
      this._exitPinMode({ silent: true });
      this._closePanel();
      this._closeComposer();
      this._closeDetails();
      document.removeEventListener("keydown", this._onEsc);
      document.removeEventListener("keydown", this._onKeyboardTrigger);
      document.removeEventListener("click", this._onDocClick, true);
      ["root", "layer", "composer", "details"].forEach((k) => {
        const el = this._els[k];
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
      this._els = {};
      this._started = false;
      return this;
    }

    // ─── Public API ──────────────────────────────────────────────

    enable() {
      this._enterPinMode();
      return this;
    }

    disable() {
      this._exitPinMode();
      return this;
    }

    toggle() {
      this.mode === "pin" ? this.disable() : this.enable();
      return this;
    }

    setPosition(position) {
      if (!POSITIONS.includes(position)) {
        console.warn(
          `[pinpoint] invalid position "${position}". Use one of: ${POSITIONS.join(", ")}`,
        );
        return this;
      }
      this.opts.position = position;
      if (this._els.root) this._els.root.dataset.position = position;
      this._closePanel();
      return this;
    }

    getPins() {
      return this.pins.map((p) => Object.assign({}, p));
    }

    deletePin(id) {
      const idx = this.pins.findIndex((p) => p.id === id);
      if (idx === -1) return false;
      const [pin] = this.pins.splice(idx, 1);
      this._persistPins();
      this._renderAllPins();
      this._refreshPanel();
      if (typeof this.opts.onPinDelete === "function") {
        try {
          this.opts.onPinDelete(pin);
        } catch (_) {}
      }
      return true;
    }

    clear() {
      this.pins = [];
      this._persistPins();
      this._renderAllPins();
      this._refreshPanel();
      return this;
    }

    exportJSON() {
      return JSON.stringify(this.pins, null, 2);
    }

    exportFile(filename = "pinpoint-pins.json") {
      this._downloadFile(filename, this.exportJSON(), "application/json");
      return this;
    }

    importJSON(json) {
      try {
        const data = typeof json === "string" ? JSON.parse(json) : json;
        if (!Array.isArray(data)) throw new Error("expected array of pins");
        this.pins = data.filter((p) => p && typeof p === "object" && p.id);
        this._persistPins();
        this._renderAllPins();
        this._refreshPanel();
        return true;
      } catch (e) {
        console.warn("[pinpoint] importJSON failed:", e.message);
        return false;
      }
    }

    // ─── Storage ─────────────────────────────────────────────────

    _store() {
      if (this.opts.storage === "session") {
        return _safeStorage(window.sessionStorage);
      }
      if (this.opts.storage === "local") {
        return _safeStorage(window.localStorage);
      }
      return null;
    }

    _loadPins() {
      const store = this._store();
      if (!store) {
        this.pins = this._memoryStore.slice();
        return;
      }
      try {
        const raw = store.getItem(this.opts.storageKey);
        const parsed = raw ? JSON.parse(raw) : [];
        this.pins = Array.isArray(parsed) ? parsed : [];
      } catch {
        this.pins = [];
      }
    }

    _persistPins() {
      const store = this._store();
      if (!store) {
        this._memoryStore = this.pins.slice();
        return;
      }
      try {
        store.setItem(this.opts.storageKey, JSON.stringify(this.pins));
      } catch (e) {
        console.warn("[pinpoint] persist failed:", e.message);
      }
    }

    // ─── DOM rendering ───────────────────────────────────────────

    _renderRoot() {
      const root = document.createElement("div");
      root.className = "pinpoint";
      root.dataset.position = this.opts.position;
      document.body.appendChild(root);
      this._els.root = root;
    }

    _renderTrigger() {
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "pinpoint-trigger";
      trigger.setAttribute("aria-label", "Open Pinpoint feedback widget");
      trigger.innerHTML = `<span class="pinpoint-trigger__icon">${ICON_PIN}</span>`;
      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        this._togglePanel();
      });
      this._els.trigger = trigger;
      this._els.root.appendChild(trigger);
    }

    _renderPinLayer() {
      const layer = document.createElement("div");
      layer.className = "pinpoint-layer";
      layer.setAttribute("aria-hidden", "true");
      document.body.appendChild(layer);
      this._els.layer = layer;
    }

    _renderAllPins() {
      if (!this._els.layer) return;
      this._els.layer.innerHTML = "";
      if (!this.opts.showMarkers) return;
      this.pins.forEach((pin, idx) => this._renderPin(pin, idx + 1));
    }

    _renderPin(pin, number) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "pinpoint-marker";
      dot.style.left = pin.x + "px";
      dot.style.top = pin.y + "px";
      dot.dataset.pinId = pin.id;
      dot.setAttribute(
        "aria-label",
        `Pin ${number}: ${pin.body ? pin.body.slice(0, 60) : "no comment"}`,
      );
      dot.textContent = String(number);
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this._openDetails(pin, dot);
        if (typeof this.opts.onPinClick === "function") {
          try {
            this.opts.onPinClick(Object.assign({}, pin));
          } catch (_) {}
        }
      });
      this._els.layer.appendChild(dot);
    }

    _togglePanel() {
      this._els.panel ? this._closePanel() : this._openPanel();
    }

    _openPanel() {
      this._closeDetails();
      const panel = document.createElement("div");
      panel.className = "pinpoint-panel";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Pinpoint settings");
      panel.innerHTML = this._panelHTML();
      this._els.root.appendChild(panel);
      this._els.panel = panel;
      this._wirePanel(panel);
      this._enterPinMode();
    }

    _closePanel() {
      if (!this._els.panel) return;
      this._els.panel.remove();
      this._els.panel = null;
      this._exitPinMode({ silent: true });
    }

    _refreshPanel() {
      if (!this._els.panel) return;
      this._els.panel.innerHTML = this._panelHTML();
      this._wirePanel(this._els.panel);
    }

    _panelHTML() {
      const count = this.pins.length;
      const positionButtons = POSITIONS.map((p) => {
        const active = p === this.opts.position ? " is-active" : "";
        return `<button type="button" class="pinpoint-pos${active}" data-pos="${p}" aria-label="${p}" title="${p}"><span class="pinpoint-pos__dot pinpoint-pos__dot--${p}"></span></button>`;
      }).join("");
      const list =
        count === 0
          ? `<p class="pinpoint-panel__empty">No pins yet. Drop one to start.</p>`
          : this.pins
              .map((pin, idx) => {
                const preview = pin.body
                  ? pin.body.length > 80
                    ? pin.body.slice(0, 80) + "…"
                    : pin.body
                  : "<em>no comment</em>";
                return `<li class="pinpoint-panel__item" data-pin-id="${pin.id}">
                  <button type="button" class="pinpoint-panel__open" data-pin-id="${pin.id}" aria-label="Open pin ${idx + 1}">
                    <span class="pinpoint-panel__num">${idx + 1}</span>
                    <span class="pinpoint-panel__preview">${_escape(preview)}</span>
                  </button>
                  <button type="button" class="pinpoint-panel__del" data-pin-id="${pin.id}" aria-label="Delete pin ${idx + 1}">${ICON_CLOSE}</button>
                </li>`;
              })
              .join("");
      return `
        <header class="pinpoint-panel__header">
          <strong>Pinpoint</strong>
          <button type="button" class="pinpoint-panel__close" aria-label="Close">${ICON_CLOSE}</button>
        </header>
        <p class="pinpoint-panel__hint">Click anywhere on the page to drop a pin.</p>
        <section class="pinpoint-panel__section">
          <label class="pinpoint-panel__label">Position</label>
          <div class="pinpoint-panel__positions">${positionButtons}</div>
        </section>
        <section class="pinpoint-panel__section">
          <div class="pinpoint-panel__heading">
            <label class="pinpoint-panel__label">Pins (${count})</label>
            <div class="pinpoint-panel__bulk">
              <button type="button" class="pinpoint-link" data-action="export"${count === 0 ? " disabled" : ""}>Export</button>
              <button type="button" class="pinpoint-link pinpoint-link--danger" data-action="clear"${count === 0 ? " disabled" : ""}>Clear</button>
            </div>
          </div>
          <ul class="pinpoint-panel__list">${list}</ul>
        </section>
      `;
    }

    _wirePanel(panel) {
      panel
        .querySelector(".pinpoint-panel__close")
        ?.addEventListener("click", () => this._closePanel());
      panel
        .querySelector('[data-action="export"]')
        ?.addEventListener("click", () => this.exportFile());
      panel
        .querySelector('[data-action="clear"]')
        ?.addEventListener("click", () => {
          if (confirm(`Delete all ${this.pins.length} pin(s)?`)) this.clear();
        });
      panel.querySelectorAll(".pinpoint-pos").forEach((btn) => {
        btn.addEventListener("click", () =>
          this.setPosition(btn.dataset.pos),
        );
      });
      panel.querySelectorAll(".pinpoint-panel__open").forEach((btn) => {
        btn.addEventListener("click", () => {
          const pin = this.pins.find((p) => p.id === btn.dataset.pinId);
          if (!pin) return;
          this._closePanel();
          this._scrollToPin(pin);
          const marker = this._els.layer.querySelector(
            `[data-pin-id="${pin.id}"]`,
          );
          this._openDetails(pin, marker);
        });
      });
      panel.querySelectorAll(".pinpoint-panel__del").forEach((btn) => {
        btn.addEventListener("click", () => this.deletePin(btn.dataset.pinId));
      });
    }

    // ─── Pin mode ────────────────────────────────────────────────

    _enterPinMode() {
      if (this.mode === "pin") return;
      this._closeDetails();
      this.mode = "pin";
      document.documentElement.classList.add("pinpoint-active");
      this._els.trigger.classList.add("is-active");
      this._els.trigger.setAttribute("aria-label", "Cancel pin mode");
      this._els.trigger.querySelector(".pinpoint-trigger__icon").innerHTML =
        ICON_CLOSE;
      document.addEventListener("click", this._onPageClick, true);
      if (this.opts.screenshot) this._ensureHtml2canvas();
    }

    _exitPinMode({ silent = false } = {}) {
      if (this.mode !== "pin") return;
      this.mode = "idle";
      document.documentElement.classList.remove("pinpoint-active");
      document.removeEventListener("click", this._onPageClick, true);
      if (this._els.trigger) {
        this._els.trigger.classList.remove("is-active");
        this._els.trigger.setAttribute(
          "aria-label",
          "Open Pinpoint feedback widget",
        );
        this._els.trigger.querySelector(".pinpoint-trigger__icon").innerHTML =
          ICON_PIN;
      }
      if (silent) return;
    }

    _onPageClick(e) {
      if (this.mode !== "pin") return;
      if (this._isInsideWidget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      this._createPinAt(e.pageX, e.pageY);
    }

    async _createPinAt(pageX, pageY) {
      const viewport = this._viewportDims();
      const docDims = this._docDims();
      const pin = {
        id: this._uid(),
        x: pageX,
        y: pageY,
        xPercent: docDims.width ? pageX / docDims.width : 0,
        yPercent: docDims.height ? pageY / docDims.height : 0,
        viewport: viewport,
        document: docDims,
        body: "",
        thumbnail: null,
        pageUrl: location.href,
        pageTitle: document.title,
        createdAt: new Date().toISOString(),
      };

      // Pause pin mode while we capture + show the composer so the overlay
      // is gone for the screenshot and a click on the composer doesn't drop
      // a second pin.
      const wasInPinMode = this.mode === "pin";
      if (wasInPinMode) this._exitPinMode({ silent: true });

      if (this.opts.screenshot) {
        try {
          pin.thumbnail = await this._captureThumb(pageX, pageY);
        } catch (e) {
          console.warn("[pinpoint] screenshot capture failed:", e.message);
        }
      }

      this._openComposer(pin, { resumePinMode: wasInPinMode });
    }

    _savePin(pin) {
      this.pins.push(pin);
      this._persistPins();
      this._renderAllPins();
      if (typeof this.opts.onPinAdd === "function") {
        try {
          this.opts.onPinAdd(Object.assign({}, pin));
        } catch (_) {}
      }
    }

    // ─── Composer (new-pin dialog) ──────────────────────────────

    _openComposer(pin, { resumePinMode = false } = {}) {
      this._closeComposer();
      this._closeDetails();
      const dialog = document.createElement("div");
      dialog.className = "pinpoint-dialog pinpoint-dialog--composer";
      dialog.setAttribute("role", "dialog");
      dialog.style.left = pin.x + "px";
      dialog.style.top = pin.y + "px";
      const thumb = pin.thumbnail
        ? `<img class="pinpoint-dialog__thumb" src="${pin.thumbnail}" alt="Screenshot of selected area">`
        : `<div class="pinpoint-dialog__thumb pinpoint-dialog__thumb--placeholder" aria-hidden="true">No screenshot</div>`;
      dialog.innerHTML = `
        ${thumb}
        <textarea class="pinpoint-dialog__body" placeholder="Describe the issue or feedback..." rows="3"></textarea>
        <div class="pinpoint-dialog__actions">
          <button type="button" class="pinpoint-btn pinpoint-btn--ghost" data-action="cancel">Cancel</button>
          <button type="button" class="pinpoint-btn pinpoint-btn--primary" data-action="save">Save</button>
        </div>
      `;
      document.body.appendChild(dialog);
      this._els.composer = dialog;
      this._composerResume = resumePinMode;
      this._positionDialog(dialog, pin);

      const ta = dialog.querySelector(".pinpoint-dialog__body");
      setTimeout(() => ta && ta.focus(), 0);

      const save = () => {
        pin.body = ta.value.trim();
        this._savePin(pin);
        this._closeComposer();
      };

      dialog
        .querySelector('[data-action="cancel"]')
        .addEventListener("click", () => this._closeComposer());
      dialog
        .querySelector('[data-action="save"]')
        .addEventListener("click", save);
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
      });
    }

    _closeComposer() {
      if (!this._els.composer) return;
      this._els.composer.remove();
      this._els.composer = null;
      // Resume pin mode if it was active before the composer opened and the
      // panel is still around to signal "feedback session in progress".
      if (this._composerResume && this._els.panel) {
        this._enterPinMode();
      }
      this._composerResume = false;
    }

    // ─── Details popover ─────────────────────────────────────────

    _openDetails(pin, anchor) {
      this._closeDetails();
      this._closeComposer();
      const dialog = document.createElement("div");
      dialog.className = "pinpoint-dialog pinpoint-dialog--details";
      dialog.setAttribute("role", "dialog");
      dialog.style.left = pin.x + "px";
      dialog.style.top = pin.y + "px";
      const thumb = pin.thumbnail
        ? `<img class="pinpoint-dialog__thumb" src="${pin.thumbnail}" alt="Screenshot of pin area">`
        : "";
      const date = new Date(pin.createdAt).toLocaleString();
      const body = pin.body
        ? `<p class="pinpoint-dialog__text">${_escape(pin.body)}</p>`
        : `<p class="pinpoint-dialog__text pinpoint-dialog__text--empty">No comment</p>`;
      dialog.innerHTML = `
        <header class="pinpoint-dialog__header">
          <time class="pinpoint-dialog__time">${date}</time>
          <button type="button" class="pinpoint-dialog__close" data-action="close" aria-label="Close">${ICON_CLOSE}</button>
        </header>
        ${thumb}
        ${body}
        <footer class="pinpoint-dialog__footer">
          <button type="button" class="pinpoint-link pinpoint-link--danger" data-action="delete">Delete</button>
        </footer>
      `;
      document.body.appendChild(dialog);
      this._els.details = dialog;
      this._positionDialog(dialog, pin);

      dialog
        .querySelector('[data-action="close"]')
        .addEventListener("click", () => this._closeDetails());
      dialog
        .querySelector('[data-action="delete"]')
        .addEventListener("click", () => {
          if (confirm("Delete this pin?")) {
            this.deletePin(pin.id);
            this._closeDetails();
          }
        });
    }

    _closeDetails() {
      if (!this._els.details) return;
      this._els.details.remove();
      this._els.details = null;
    }

    // ─── Screenshot ──────────────────────────────────────────────

    _ensureHtml2canvas() {
      if (typeof window.html2canvas === "function") return Promise.resolve();
      if (this._h2cPromise) return this._h2cPromise;
      this._h2cPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = this.opts.html2canvasUrl;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("failed to load html2canvas"));
        document.head.appendChild(script);
      });
      return this._h2cPromise;
    }

    async _captureThumb(pageX, pageY) {
      await this._ensureHtml2canvas();
      if (typeof window.html2canvas !== "function") {
        throw new Error("html2canvas not available");
      }
      const w = this.opts.screenshotWidth;
      const h = this.opts.screenshotHeight;
      const docDims = this._docDims();
      const cropX = Math.max(0, Math.min(pageX - w / 2, docDims.width - w));
      const cropY = Math.max(0, Math.min(pageY - h / 2, docDims.height - h));

      const canvas = await window.html2canvas(document.body, {
        x: cropX,
        y: cropY,
        width: w,
        height: h,
        useCORS: true,
        logging: false,
        backgroundColor: null,
        ignoreElements: (el) =>
          el.classList &&
          (el.classList.contains("pinpoint") ||
            el.classList.contains("pinpoint-layer") ||
            el.classList.contains("pinpoint-dialog") ||
            el.classList.contains("pinpoint-marker")),
      });
      return canvas.toDataURL("image/png");
    }

    // ─── Events ──────────────────────────────────────────────────

    _bindGlobalKeys() {
      document.addEventListener("keydown", this._onEsc);
      if (this.opts.keyboardTrigger) {
        document.addEventListener("keydown", this._onKeyboardTrigger);
      }
    }

    _onEsc(e) {
      if (e.key !== "Escape") return;
      if (this._els.composer) {
        this._closeComposer();
      } else if (this._els.details) {
        this._closeDetails();
      } else if (this.mode === "pin") {
        this.disable();
      } else if (this._els.panel) {
        this._closePanel();
      }
    }

    _onKeyboardTrigger(e) {
      const trig = this._parseHotkey(this.opts.keyboardTrigger);
      if (!trig) return;
      if (e.key.toLowerCase() !== trig.key) return;
      if (Boolean(e.shiftKey) !== trig.shift) return;
      if (Boolean(e.metaKey) !== trig.meta) return;
      if (Boolean(e.ctrlKey) !== trig.ctrl) return;
      if (Boolean(e.altKey) !== trig.alt) return;
      e.preventDefault();
      this.toggle();
    }

    _onDocClick(e) {
      if (!this._els.panel) return;
      // In the new design the panel is only open while pin mode or a
      // transient dialog is active, and those self-manage. Outside clicks
      // never need to close the panel — the trigger toggle, the panel's
      // own X, and Esc are the only ways out.
      if (this.mode === "pin") return;
      if (this._els.composer || this._els.details) return;
      if (this._isInsideWidget(e.target)) return;
      this._closePanel();
    }

    // ─── Helpers ─────────────────────────────────────────────────

    _validateOptions() {
      if (!POSITIONS.includes(this.opts.position)) {
        console.warn(
          `[pinpoint] invalid position "${this.opts.position}"; falling back to "${DEFAULTS.position}"`,
        );
        this.opts.position = DEFAULTS.position;
      }
      if (!STORAGE_TYPES.includes(this.opts.storage)) {
        console.warn(
          `[pinpoint] invalid storage "${this.opts.storage}"; falling back to "${DEFAULTS.storage}"`,
        );
        this.opts.storage = DEFAULTS.storage;
      }
      if (
        typeof this.opts.screenshotWidth !== "number" ||
        this.opts.screenshotWidth < 50
      ) {
        this.opts.screenshotWidth = DEFAULTS.screenshotWidth;
      }
      if (
        typeof this.opts.screenshotHeight !== "number" ||
        this.opts.screenshotHeight < 50
      ) {
        this.opts.screenshotHeight = DEFAULTS.screenshotHeight;
      }
    }

    _isInsideWidget(node) {
      if (!node || !node.closest) return false;
      return Boolean(
        node.closest(".pinpoint, .pinpoint-dialog, .pinpoint-marker"),
      );
    }

    _positionDialog(dialog, pin) {
      const rect = dialog.getBoundingClientRect();
      const viewport = this._viewportDims();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;
      let left = pin.x + 16;
      let top = pin.y + 16;
      if (left + rect.width > scrollX + viewport.width - 8) {
        left = pin.x - rect.width - 16;
      }
      if (left < scrollX + 8) left = scrollX + 8;
      if (top + rect.height > scrollY + viewport.height - 8) {
        top = pin.y - rect.height - 16;
      }
      if (top < scrollY + 8) top = scrollY + 8;
      dialog.style.left = left + "px";
      dialog.style.top = top + "px";
    }

    _scrollToPin(pin) {
      const viewport = this._viewportDims();
      window.scrollTo({
        left: Math.max(0, pin.x - viewport.width / 2),
        top: Math.max(0, pin.y - viewport.height / 2),
        behavior: "smooth",
      });
    }

    _viewportDims() {
      return {
        width: window.innerWidth || document.documentElement.clientWidth,
        height: window.innerHeight || document.documentElement.clientHeight,
      };
    }

    _docDims() {
      const d = document.documentElement;
      return {
        width: Math.max(d.scrollWidth, d.clientWidth),
        height: Math.max(d.scrollHeight, d.clientHeight),
      };
    }

    _uid() {
      return (
        "pin-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 8)
      );
    }

    _parseHotkey(str) {
      if (!str || typeof str !== "string") return null;
      const parts = str.toLowerCase().split("+").map((s) => s.trim());
      const key = parts.pop();
      return {
        key,
        shift: parts.includes("shift"),
        meta: parts.includes("meta") || parts.includes("cmd"),
        ctrl: parts.includes("ctrl") || parts.includes("control"),
        alt: parts.includes("alt") || parts.includes("option"),
      };
    }

    _downloadFile(filename, content, type) {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  function _escape(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function _safeStorage(store) {
    try {
      const key = "__pinpoint_test__";
      store.setItem(key, "1");
      store.removeItem(key);
      return store;
    } catch {
      return null;
    }
  }

  Pinpoint.POSITIONS = POSITIONS.slice();
  Pinpoint.DEFAULTS = Object.assign({}, DEFAULTS);

  return Pinpoint;
});
