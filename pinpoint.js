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

  // Only local schemes — a remote URL in pin.thumbnail would be an XSS / leak vector.
  function isSafeThumbnail(v) {
    return typeof v === "string" && (v.startsWith("data:image/") || v.startsWith("blob:"));
  }

  const DEFAULTS = {
    position: "bottom-left",
    storage: "session",
    storageKey: "pinpoint:pins",
    screenshot: true,
    screenshotWidth: 400,
    screenshotHeight: 200,
    html2canvasUrl:
      "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
    html2canvasIntegrity:
      "sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H",
    keyboardTrigger: null,
    notes: true,
    noteMaxEdge: 1600,
    noteQuality: 0.85,
    noteMaxBytes: 2 * 1024 * 1024,
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
  const ICON_IMAGE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';

  const NOTE_SECTION_HTML = `
    <section class="pinpoint-panel__section">
      <label class="pinpoint-panel__label">Page note</label>
      <div class="pinpoint-drop" tabindex="0" role="button" aria-label="Add a screenshot note: paste, drop a file, or click to browse">
        <span class="pinpoint-drop__icon">${ICON_IMAGE}</span>
        <span class="pinpoint-drop__title">Paste or drop a screenshot</span>
        <span class="pinpoint-drop__hint">or click to choose a file</span>
      </div>
      <p class="pinpoint-drop__error" role="alert"></p>
      <input type="file" class="pinpoint-drop__input" accept="image/*" hidden>
    </section>`;

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
      this._onPaste = this._onPaste.bind(this);

      // Instance-lifetime listeners, not start()/destroy() ones: the
      // before-cache teardown calls destroy(), and turbo:load must survive
      // that call to remount. Both are inert when Turbo isn't on the page.
      this._onTurboBeforeCache = this._onTurboBeforeCache.bind(this);
      this._onTurboLoad = this._onTurboLoad.bind(this);
      document.addEventListener("turbo:before-cache", this._onTurboBeforeCache);
      document.addEventListener("turbo:load", this._onTurboLoad);

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
      document.removeEventListener("paste", this._onPaste);
      ["root", "layer", "composer", "details"].forEach((k) => {
        const el = this._els[k];
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
      this._els = {};
      this._started = false;
      return this;
    }

    // Turbo Drive swaps <body> on navigation, discarding the widget's DOM.
    // Tear down before the old page is cached; remount after render.
    _onTurboBeforeCache() {
      if (!this._started) return;
      this._remountOnTurboLoad = true;
      this.destroy();
    }

    _onTurboLoad() {
      if (!this._remountOnTurboLoad) return;
      this._remountOnTurboLoad = false;
      this.start();
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
        this.pins = data
          .filter((p) => p && typeof p === "object" && p.id)
          .map((p) => {
            // Strip any thumbnail that isn't a local data: or blob: URL.
            if (p.thumbnail != null && !isSafeThumbnail(p.thumbnail)) {
              return Object.assign({}, p, { thumbnail: null });
            }
            return p;
          });
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
      // Markers are page-scoped, but numbering stays global so a marker's
      // number always matches the same pin's number in the panel list.
      this.pins.forEach((pin, idx) => {
        if (this._isNote(pin)) return;
        if (this._samePage(pin)) this._renderPin(pin, idx + 1);
      });
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
      // Wrap the number in an element: .pinpoint-marker rotates -45deg to
      // form the teardrop and `.pinpoint-marker > *` counter-rotates its
      // children upright — a bare text node would inherit the tilt.
      const num = document.createElement("span");
      num.className = "pinpoint-marker__num";
      num.textContent = String(number);
      dot.appendChild(num);
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
      if (this.opts.notes) document.addEventListener("paste", this._onPaste);
      this._enterPinMode();
    }

    _closePanel() {
      if (!this._els.panel) return;
      document.removeEventListener("paste", this._onPaste);
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
        const pa = _escapeAttr(p);
        return `<button type="button" class="pinpoint-pos${active}" data-pos="${pa}" aria-label="${pa}" title="${pa}"><span class="pinpoint-pos__dot pinpoint-pos__dot--${pa}"></span></button>`;
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
                const idAttr = _escapeAttr(pin.id);
                const isNote = this._isNote(pin);
                const label = isNote ? `note ${idx + 1}` : `pin ${idx + 1}`;
                const badge = isNote
                  ? `<span class="pinpoint-panel__num pinpoint-panel__num--note">${ICON_IMAGE}</span>`
                  : `<span class="pinpoint-panel__num">${idx + 1}</span>`;
                return `<li class="pinpoint-panel__item" data-pin-id="${idAttr}">
                  <button type="button" class="pinpoint-panel__open" data-pin-id="${idAttr}" aria-label="Open ${label}">
                    ${badge}
                    <span class="pinpoint-panel__preview">${_escape(preview)}</span>
                  </button>
                  <button type="button" class="pinpoint-panel__del" data-pin-id="${idAttr}" aria-label="Delete ${label}">${ICON_CLOSE}</button>
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
        ${this.opts.notes ? NOTE_SECTION_HTML : ""}
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
          // Pins from other pages have no marker here — jump to their page
          // instead (same-origin only; pageUrl is data, not trusted).
          if (!this._samePage(pin)) {
            try {
              const u = new URL(pin.pageUrl, location.href);
              if (u.origin === location.origin) location.href = u.href;
            } catch (_) {}
            return;
          }
          this._closePanel();
          if (this._isNote(pin)) {
            this._openDetails(pin, null);
            return;
          }
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
      this._wireDropZone(panel);
    }

    _wireDropZone(panel) {
      const drop = panel.querySelector(".pinpoint-drop");
      const input = panel.querySelector(".pinpoint-drop__input");
      if (!drop || !input) return;

      drop.addEventListener("click", () => input.click());
      drop.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        input.click();
      });
      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        // Reset first so re-picking the same file still fires change.
        input.value = "";
        if (file) this._handleNoteFile(file);
      });

      ["dragenter", "dragover"].forEach((type) => {
        drop.addEventListener(type, (e) => {
          e.preventDefault();
          e.stopPropagation();
          drop.classList.add("is-dragging");
        });
      });
      ["dragleave", "dragend"].forEach((type) => {
        drop.addEventListener(type, () => drop.classList.remove("is-dragging"));
      });
      drop.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        drop.classList.remove("is-dragging");
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files[0]) this._handleNoteFile(files[0]);
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
        id: this._uid("pin"),
        kind: "pin",
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
      this._refreshPanel();
      if (typeof this.opts.onPinAdd === "function") {
        try {
          this.opts.onPinAdd(Object.assign({}, pin));
        } catch (_) {}
      }
    }

    // ─── Notes (whole-page screenshot + comment) ─────────────────

    // Pins stored before notes existed have no kind at all.
    _isNote(pin) {
      return Boolean(pin) && pin.kind === "note";
    }

    _onPaste(e) {
      if (!this.opts.notes || !this._els.panel) return;
      if (this._els.composer || this._els.details) return;
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind !== "file") continue;
        if (!/^image\//.test(items[i].type)) continue;
        const file = items[i].getAsFile();
        if (!file) return;
        e.preventDefault();
        this._handleNoteFile(file);
        return;
      }
    }

    async _handleNoteFile(file) {
      if (!file || !/^image\//.test(file.type)) {
        this._noteError("That is not an image file.");
        return;
      }
      this._noteError("");
      this._noteBusy(true);
      try {
        const thumbnail = await this._normalizeImage(file);
        this._createNote(thumbnail);
      } catch (err) {
        this._noteError(err.message);
      } finally {
        this._noteBusy(false);
      }
    }

    _createNote(thumbnail) {
      this._exitPinMode({ silent: true });
      this._openComposer({
        id: this._uid("note"),
        kind: "note",
        x: null,
        y: null,
        xPercent: null,
        yPercent: null,
        viewport: this._viewportDims(),
        document: this._docDims(),
        body: "",
        thumbnail: thumbnail,
        pageUrl: location.href,
        pageTitle: document.title,
        createdAt: new Date().toISOString(),
      });
    }

    // Retina screenshots routinely run several megabytes; a receiving
    // backend usually will not take that. Shed quality first, then pixels.
    async _normalizeImage(blob) {
      const url = URL.createObjectURL(blob);
      let img;
      try {
        img = await new Promise((resolve, reject) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = () => reject(new Error("That image could not be read."));
          im.src = url;
        });
      } finally {
        URL.revokeObjectURL(url);
      }
      if (!img.naturalWidth || !img.naturalHeight) {
        throw new Error("That image could not be read.");
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const draw = (edge) => {
        const longest = Math.max(img.naturalWidth, img.naturalHeight);
        const scale = Math.min(1, edge / longest);
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        // JPEG has no alpha, so transparent pixels would encode as black.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };

      let edge = this.opts.noteMaxEdge;
      let quality = this.opts.noteQuality;
      draw(edge);
      let dataUri = canvas.toDataURL("image/jpeg", quality);

      while (_dataUriBytes(dataUri) > this.opts.noteMaxBytes) {
        if (quality > 0.4) {
          quality -= 0.15;
        } else if (edge > 600) {
          edge = Math.round(edge * 0.75);
          quality = this.opts.noteQuality;
          draw(edge);
        } else {
          throw new Error("That screenshot is too large to attach.");
        }
        dataUri = canvas.toDataURL("image/jpeg", quality);
      }
      return dataUri;
    }

    _noteError(message) {
      const el = this._els.panel &&
        this._els.panel.querySelector(".pinpoint-drop__error");
      if (!el) return;
      el.textContent = message || "";
      el.classList.toggle("is-visible", Boolean(message));
    }

    _noteBusy(busy) {
      const drop = this._els.panel &&
        this._els.panel.querySelector(".pinpoint-drop");
      if (drop) drop.classList.toggle("is-busy", Boolean(busy));
    }

    // ─── Composer (new-pin dialog) ──────────────────────────────

    _openComposer(pin, { resumePinMode = false } = {}) {
      this._closeComposer();
      this._closeDetails();
      const isNote = this._isNote(pin);
      const anchor = this._dialogAnchor(pin);
      const dialog = document.createElement("div");
      dialog.className =
        "pinpoint-dialog pinpoint-dialog--composer" +
        (isNote ? " pinpoint-dialog--note" : "");
      dialog.setAttribute("role", "dialog");
      dialog.style.left = anchor.x + "px";
      dialog.style.top = anchor.y + "px";
      const thumb = this._thumbHTML(
        pin,
        isNote ? "Screenshot attached to this note" : "Screenshot of selected area",
        !isNote,
      );
      const placeholder = isNote
        ? "What should we know about this screen?"
        : "Describe the issue or feedback...";
      dialog.innerHTML = `
        ${thumb}
        <textarea class="pinpoint-dialog__body" placeholder="${placeholder}" rows="3"></textarea>
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
      const isNote = this._isNote(pin);
      const anchorPoint = this._dialogAnchor(pin);
      const dialog = document.createElement("div");
      dialog.className =
        "pinpoint-dialog pinpoint-dialog--details" +
        (isNote ? " pinpoint-dialog--note" : "");
      dialog.setAttribute("role", "dialog");
      dialog.style.left = anchorPoint.x + "px";
      dialog.style.top = anchorPoint.y + "px";
      const thumb = this._thumbHTML(
        pin,
        isNote ? "Screenshot attached to this note" : "Screenshot of pin area",
        false,
      );
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
          if (confirm(isNote ? "Delete this note?" : "Delete this pin?")) {
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
        if (this.opts.html2canvasIntegrity) {
          script.integrity = this.opts.html2canvasIntegrity;
        }
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
      if (
        typeof this.opts.noteMaxEdge !== "number" ||
        this.opts.noteMaxEdge < 200
      ) {
        this.opts.noteMaxEdge = DEFAULTS.noteMaxEdge;
      }
      if (
        typeof this.opts.noteQuality !== "number" ||
        this.opts.noteQuality <= 0 ||
        this.opts.noteQuality > 1
      ) {
        this.opts.noteQuality = DEFAULTS.noteQuality;
      }
      if (
        typeof this.opts.noteMaxBytes !== "number" ||
        this.opts.noteMaxBytes < 50 * 1024
      ) {
        this.opts.noteMaxBytes = DEFAULTS.noteMaxBytes;
      }
    }

    _isInsideWidget(node) {
      if (!node || !node.closest) return false;
      return Boolean(
        node.closest(".pinpoint, .pinpoint-dialog, .pinpoint-marker"),
      );
    }

    // Pin thumbs are a fixed crop, so width/height attributes reserve the
    // box before the data: URI decodes. A note keeps the screenshot's own
    // ratio instead and _positionDialog re-measures once it loads.
    _thumbHTML(pin, alt, placeholder) {
      if (!isSafeThumbnail(pin.thumbnail)) {
        return placeholder
          ? `<div class="pinpoint-dialog__thumb pinpoint-dialog__thumb--placeholder" aria-hidden="true">No screenshot</div>`
          : "";
      }
      const isNote = this._isNote(pin);
      const cls = isNote
        ? "pinpoint-dialog__thumb pinpoint-dialog__thumb--note"
        : "pinpoint-dialog__thumb";
      const dims = isNote
        ? ""
        : ` width="${this.opts.screenshotWidth}" height="${this.opts.screenshotHeight}"`;
      return `<img class="${cls}" src="${_escapeAttr(pin.thumbnail)}"${dims} alt="${_escapeAttr(alt)}">`;
    }

    // Notes belong to the page, not a point on it, so their dialogs hang
    // off the widget itself.
    _dialogAnchor(pin) {
      if (!this._isNote(pin)) return { x: pin.x, y: pin.y };
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;
      const el = this._els.panel || this._els.trigger;
      if (!el) return { x: scrollX + 24, y: scrollY + 24 };
      const rect = el.getBoundingClientRect();
      return { x: rect.right + scrollX, y: rect.top + scrollY };
    }

    _positionDialog(dialog, pin) {
      // Thumbnails decode async; re-measure on load in case the decoded
      // size differs from the box the width/height attributes reserved.
      const thumb = dialog.querySelector("img.pinpoint-dialog__thumb");
      if (thumb && !thumb.complete) {
        thumb.addEventListener(
          "load",
          () => {
            if (dialog.isConnected) this._positionDialog(dialog, pin);
          },
          { once: true },
        );
      }
      const rect = dialog.getBoundingClientRect();
      const viewport = this._viewportDims();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;
      const anchor = this._dialogAnchor(pin);
      let left = anchor.x + 16;
      let top = anchor.y + 16;
      if (left + rect.width > scrollX + viewport.width - 8) {
        left = anchor.x - rect.width - 16;
      }
      if (left < scrollX + 8) left = scrollX + 8;
      if (top + rect.height > scrollY + viewport.height - 8) {
        top = anchor.y - rect.height - 16;
      }
      if (top < scrollY + 8) top = scrollY + 8;
      dialog.style.left = left + "px";
      dialog.style.top = top + "px";
    }

    _samePage(pin) {
      // Query and hash are ignored so anchor links and tracking params
      // don't strand a pin; pins without a pageUrl show everywhere.
      if (!pin.pageUrl) return true;
      try {
        const u = new URL(pin.pageUrl, location.href);
        return (
          u.origin === location.origin && u.pathname === location.pathname
        );
      } catch (_) {
        return true;
      }
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

    _uid(prefix = "pin") {
      return (
        prefix +
        "-" +
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

  // Defense-in-depth for values interpolated into HTML attributes.
  const _escapeAttr = _escape;

  function _dataUriBytes(dataUri) {
    const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    return Math.floor((base64.length * 3) / 4) - padding;
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
