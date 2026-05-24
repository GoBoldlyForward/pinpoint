(function() {
  "use strict";

  // Prevent double-initialization (important for Turbo)
  if (window.__pinpointInitialized) return;
  window.__pinpointInitialized = true;

  // ---- Configuration (injected via data attributes on the script tag) ----
  const scriptTag = document.querySelector("script[data-pinpoint]");
  const CONFIG = {
    apiBase: scriptTag?.dataset.apiBase || "/pinpoint/api",
    triggerKey: scriptTag?.dataset.triggerKey || "shift+meta+f",
    csrfToken: document.querySelector('meta[name="csrf-token"]')?.content || ""
  };

  // ---- State ----
  let pinModeActive = false;
  let menuOpen = false;
  let pinsVisible = true;
  let listPanelOpen = false;
  let existingPins = [];
  let bubble = null;
  let currentPageUrl = null;

  // ---- Styles ----
  const STYLES = `
    /* ---- Bubble ---- */
    .pp-bubble {
      position: fixed;
      bottom: 20px;
      left: 20px;
      z-index: 2147483647;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #6366f1;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      transition: transform 0.15s ease, background 0.15s ease;
      font-size: 20px;
      color: white;
    }
    .pp-bubble:hover { transform: scale(1.1); }
    .pp-bubble.active { background: #ef4444; }

    /* ---- Menu ---- */
    .pp-menu {
      position: fixed;
      bottom: 76px;
      left: 20px;
      z-index: 2147483647;
      background: white;
      border-radius: 10px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.15);
      padding: 6px 0;
      min-width: 200px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      color: #1f2937;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.15s ease, transform 0.15s ease;
      pointer-events: none;
    }
    .pp-menu.open {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    .pp-menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 16px;
      border: none;
      background: none;
      cursor: pointer;
      font-family: inherit;
      font-size: 13px;
      color: #1f2937;
      text-align: left;
      white-space: nowrap;
    }
    .pp-menu-item:hover { background: #f3f4f6; }
    .pp-menu-item .pp-menu-icon { width: 18px; text-align: center; font-size: 15px; }
    .pp-menu-item .pp-menu-label { flex: 1; }
    .pp-menu-item .pp-menu-badge {
      background: #e5e7eb;
      color: #6b7280;
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 999px;
      font-weight: 600;
    }
    .pp-menu-divider {
      height: 1px;
      background: #e5e7eb;
      margin: 4px 0;
    }

    /* ---- Overlay (pin mode) ---- */
    .pp-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 2147483646;
      cursor: crosshair;
    }

    /* ---- Pin markers ---- */
    .pp-pin-marker {
      position: fixed;
      width: 24px;
      height: 24px;
      margin-left: -12px;
      margin-top: -24px;
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
      z-index: 2147483645;
      user-select: none;
      transition: transform 0.1s ease;
    }
    .pp-pin-marker:hover { transform: scale(1.2); }

    /* ---- Pin popover (shown when clicking a marker) ---- */
    .pp-popover {
      position: fixed;
      z-index: 2147483647;
      background: white;
      border-radius: 10px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.15);
      padding: 14px 16px;
      width: 280px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      color: #1f2937;
    }
    .pp-popover-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .pp-popover-creator {
      font-weight: 600;
      font-size: 13px;
    }
    .pp-popover-time {
      font-size: 11px;
      color: #9ca3af;
    }
    .pp-popover-body {
      line-height: 1.5;
      margin-bottom: 10px;
    }
    .pp-popover-close {
      background: none;
      border: none;
      font-size: 16px;
      cursor: pointer;
      color: #9ca3af;
      padding: 0;
      line-height: 1;
    }
    .pp-popover-close:hover { color: #1f2937; }
    .pp-popover-comments {
      border-top: 1px solid #f3f4f6;
      padding-top: 8px;
      margin-top: 4px;
    }
    .pp-popover-comment {
      padding: 6px 0;
      font-size: 12px;
      line-height: 1.4;
    }
    .pp-popover-comment + .pp-popover-comment {
      border-top: 1px solid #f3f4f6;
    }
    .pp-popover-comment strong {
      font-weight: 600;
    }
    .pp-popover-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .pp-badge-open { background: #fef3c7; color: #92400e; }
    .pp-badge-acknowledged { background: #dbeafe; color: #1e40af; }
    .pp-badge-resolved { background: #d1fae5; color: #065f46; }

    /* ---- Pins list panel ---- */
    .pp-list-panel {
      position: fixed;
      bottom: 76px;
      left: 20px;
      z-index: 2147483647;
      background: white;
      border-radius: 10px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.15);
      width: 320px;
      max-height: 420px;
      overflow-y: auto;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      color: #1f2937;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.15s ease, transform 0.15s ease;
      pointer-events: none;
    }
    .pp-list-panel.open {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    .pp-list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
      font-weight: 600;
      font-size: 14px;
      position: sticky;
      top: 0;
      background: white;
      border-radius: 10px 10px 0 0;
    }
    .pp-list-close {
      background: none;
      border: none;
      font-size: 16px;
      cursor: pointer;
      color: #9ca3af;
      padding: 0;
      line-height: 1;
    }
    .pp-list-close:hover { color: #1f2937; }
    .pp-list-item {
      display: block;
      width: 100%;
      padding: 12px 16px;
      border: none;
      border-bottom: 1px solid #f3f4f6;
      background: none;
      cursor: pointer;
      text-align: left;
      font-family: inherit;
      font-size: 13px;
      color: #1f2937;
    }
    .pp-list-item:hover { background: #f9fafb; }
    .pp-list-item:last-child { border-bottom: none; }
    .pp-list-item-meta {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 4px;
    }
    .pp-list-empty {
      padding: 32px 16px;
      text-align: center;
      color: #9ca3af;
    }

    /* ---- Feedback form ---- */
    .pp-form {
      position: fixed;
      z-index: 2147483647;
      background: white;
      border-radius: 10px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.15);
      padding: 16px;
      width: 300px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      color: #1f2937;
    }
    .pp-form-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      font-weight: 600;
      font-size: 14px;
    }
    .pp-form-close {
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: #9ca3af;
      padding: 0;
      line-height: 1;
    }
    .pp-form-close:hover { color: #1f2937; }
    .pp-form textarea {
      width: 100%;
      min-height: 80px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 8px;
      font-family: inherit;
      font-size: 13px;
      resize: vertical;
      box-sizing: border-box;
      outline: none;
    }
    .pp-form textarea:focus { border-color: #6366f1; }
    .pp-form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }
    .pp-btn {
      padding: 6px 14px;
      border-radius: 6px;
      border: 1px solid #d1d5db;
      background: white;
      cursor: pointer;
      font-size: 13px;
      font-family: inherit;
    }
    .pp-btn:hover { background: #f9fafb; }
    .pp-btn-primary {
      background: #6366f1;
      color: white;
      border-color: #6366f1;
    }
    .pp-btn-primary:hover { background: #4f46e5; }
    .pp-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ---- Toast ---- */
    .pp-toast {
      position: fixed;
      bottom: 80px;
      left: 20px;
      z-index: 2147483647;
      background: #1f2937;
      color: white;
      padding: 10px 16px;
      border-radius: 6px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: none;
    }
    .pp-toast.visible { opacity: 1; }

    /* ---- Hint bar (pin mode) ---- */
    .pp-hint {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      background: #1f2937;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      pointer-events: none;
    }
  `;

  // ---- Utility functions ----
  function injectStyles() {
    if (document.querySelector("[data-pinpoint-styles]")) return;
    const style = document.createElement("style");
    style.setAttribute("data-pinpoint-styles", "true");
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "pp-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("visible"));
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 200);
    }, 2500);
  }

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  async function apiRequest(path, options = {}) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || CONFIG.csrfToken;
    const url = CONFIG.apiBase + path;
    const headers = {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
      ...options.headers
    };
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || err.errors?.join(", ") || "Request failed");
    }
    if (response.status === 204) return null;
    return response.json();
  }

  // ---- Screenshot capture ----
  async function captureScreenshot() {
    if (typeof html2canvas !== "undefined") {
      try {
        const canvas = await html2canvas(document.body, {
          logging: false,
          useCORS: true,
          allowTaint: true
        });
        return canvas.toDataURL("image/png").split(",")[1];
      } catch (e) {
        console.warn("[Pinpoint] html2canvas failed, skipping screenshot:", e);
        return null;
      }
    }
    console.info("[Pinpoint] html2canvas not loaded — screenshot skipped.");
    return null;
  }

  // ---- Close all floating UI ----
  function closeAllPanels() {
    closeMenu();
    closeListPanel();
    closePopover();
  }

  // ---- Menu ----
  let menuEl = null;

  function createMenu() {
    if (menuEl) return menuEl;

    menuEl = document.createElement("div");
    menuEl.className = "pp-menu";

    updateMenuContent();
    document.body.appendChild(menuEl);
    return menuEl;
  }

  function updateMenuContent() {
    if (!menuEl) return;
    const pagePinCount = existingPins.filter(
      p => p.page_url === window.location.pathname && p.status !== "resolved"
    ).length;

    menuEl.innerHTML = `
      <button class="pp-menu-item" data-pp-action="drop-pin">
        <span class="pp-menu-icon">\u{1F4CC}</span>
        <span class="pp-menu-label">Drop a pin</span>
      </button>
      <button class="pp-menu-item" data-pp-action="toggle-pins">
        <span class="pp-menu-icon">${pinsVisible ? "\u{1F441}" : "\u{1F648}"}</span>
        <span class="pp-menu-label">${pinsVisible ? "Hide pins" : "Show pins"}</span>
      </button>
      <div class="pp-menu-divider"></div>
      <button class="pp-menu-item" data-pp-action="list-pins">
        <span class="pp-menu-icon">\u{1F4CB}</span>
        <span class="pp-menu-label">Pins on this page</span>
        ${pagePinCount > 0 ? `<span class="pp-menu-badge">${pagePinCount}</span>` : ""}
      </button>
    `;

    // Bind actions
    menuEl.querySelector('[data-pp-action="drop-pin"]').addEventListener("click", () => {
      closeMenu();
      enterPinMode();
    });

    menuEl.querySelector('[data-pp-action="toggle-pins"]').addEventListener("click", () => {
      pinsVisible = !pinsVisible;
      renderPinMarkers(existingPins);
      updateMenuContent();
      closeMenu();
      showToast(pinsVisible ? "Pins visible" : "Pins hidden");
    });

    menuEl.querySelector('[data-pp-action="list-pins"]').addEventListener("click", () => {
      closeMenu();
      toggleListPanel();
    });
  }

  function openMenu() {
    closeListPanel();
    closePopover();
    createMenu();
    updateMenuContent();
    requestAnimationFrame(() => menuEl.classList.add("open"));
    menuOpen = true;
  }

  function closeMenu() {
    if (menuEl) menuEl.classList.remove("open");
    menuOpen = false;
  }

  function toggleMenu() {
    if (menuOpen) closeMenu();
    else openMenu();
  }

  // ---- Pins list panel ----
  let listPanelEl = null;

  function createListPanel() {
    if (listPanelEl) { listPanelEl.remove(); listPanelEl = null; }

    listPanelEl = document.createElement("div");
    listPanelEl.className = "pp-list-panel";

    const pagePins = existingPins.filter(
      p => p.page_url === window.location.pathname && p.status !== "resolved"
    );

    let content = `
      <div class="pp-list-header">
        <span>\u{1F4CB} Pins (${pagePins.length})</span>
        <button class="pp-list-close" data-pp-list-close>&times;</button>
      </div>
    `;

    if (pagePins.length === 0) {
      content += `<div class="pp-list-empty">No pins on this page yet.</div>`;
    } else {
      pagePins.forEach(pin => {
        content += `
          <button class="pp-list-item" data-pp-pin-id="${pin.id}">
            <span class="pp-popover-badge pp-badge-${pin.status}">${pin.status}</span>
            &nbsp;
            <strong>${pin.creator}</strong>: ${escapeHtml(truncate(pin.body || "No comment", 60))}
            <div class="pp-list-item-meta">
              ${timeAgo(pin.created_at)}
              ${pin.comments && pin.comments.length > 0 ? ` \u00B7 ${pin.comments.length} comment${pin.comments.length === 1 ? "" : "s"}` : ""}
            </div>
          </button>
        `;
      });
    }

    listPanelEl.innerHTML = content;
    document.body.appendChild(listPanelEl);

    // Bind close
    listPanelEl.querySelector("[data-pp-list-close]").addEventListener("click", closeListPanel);

    // Bind item clicks — scroll to pin and open its popover
    listPanelEl.querySelectorAll("[data-pp-pin-id]").forEach(item => {
      item.addEventListener("click", () => {
        const pinId = parseInt(item.dataset.ppPinId);
        const pin = existingPins.find(p => p.id === pinId);
        if (!pin) return;
        closeListPanel();

        // Ensure pins are visible
        if (!pinsVisible) {
          pinsVisible = true;
          renderPinMarkers(existingPins);
        }

        const markerX = pin.x_percent / 100 * window.innerWidth;
        const markerY = pin.y_percent / 100 * window.innerHeight;
        showPinPopover(pin, markerX, markerY);
      });
    });

    return listPanelEl;
  }

  function openListPanel() {
    createListPanel();
    requestAnimationFrame(() => listPanelEl.classList.add("open"));
    listPanelOpen = true;
  }

  function closeListPanel() {
    if (listPanelEl) listPanelEl.classList.remove("open");
    listPanelOpen = false;
  }

  function toggleListPanel() {
    if (listPanelOpen) closeListPanel();
    else openListPanel();
  }

  // ---- Pin popover (clicking a marker) ----
  let popoverEl = null;

  function showPinPopover(pin, anchorX, anchorY) {
    closePopover();

    popoverEl = document.createElement("div");
    popoverEl.className = "pp-popover";

    // Position near the pin marker
    let popX = anchorX + 20;
    let popY = anchorY - 20;
    if (popX + 300 > window.innerWidth) popX = anchorX - 300;
    if (popY + 200 > window.innerHeight) popY = window.innerHeight - 220;
    if (popY < 10) popY = 10;

    popoverEl.style.left = popX + "px";
    popoverEl.style.top = popY + "px";

    let commentsHtml = "";
    if (pin.comments && pin.comments.length > 0) {
      commentsHtml = `<div class="pp-popover-comments">`;
      pin.comments.forEach(c => {
        commentsHtml += `
          <div class="pp-popover-comment">
            <strong>${escapeHtml(c.creator)}</strong>
            <span style="color:#9ca3af;"> \u00B7 ${timeAgo(c.created_at)}</span>
            <div>${escapeHtml(c.body)}</div>
          </div>
        `;
      });
      commentsHtml += `</div>`;
    }

    popoverEl.innerHTML = `
      <div class="pp-popover-header">
        <div>
          <span class="pp-popover-creator">${escapeHtml(pin.creator)}</span>
          <span class="pp-popover-badge pp-badge-${pin.status}" style="margin-left: 6px;">${pin.status}</span>
        </div>
        <button class="pp-popover-close" data-pp-popover-close>&times;</button>
      </div>
      <div class="pp-popover-time">${timeAgo(pin.created_at)}</div>
      <div class="pp-popover-body">${escapeHtml(pin.body || "No comment")}</div>
      ${commentsHtml}
    `;

    document.body.appendChild(popoverEl);

    popoverEl.querySelector("[data-pp-popover-close]").addEventListener("click", closePopover);

    // Close on outside click (after a tick to avoid the marker click closing it)
    setTimeout(() => {
      document.addEventListener("click", outsidePopoverHandler);
    }, 0);
  }

  function outsidePopoverHandler(e) {
    if (popoverEl && !popoverEl.contains(e.target) && !e.target.classList.contains("pp-pin-marker")) {
      closePopover();
    }
  }

  function closePopover() {
    if (popoverEl) { popoverEl.remove(); popoverEl = null; }
    document.removeEventListener("click", outsidePopoverHandler);
  }

  // ---- Pin form (after dropping a pin) ----
  function showPinForm(xPercent, yPercent, clickX, clickY) {
    document.querySelector(".pp-form")?.remove();

    const form = document.createElement("div");
    form.className = "pp-form";

    let formX = clickX + 16;
    let formY = clickY - 16;
    if (formX + 320 > window.innerWidth) formX = clickX - 320;
    if (formY + 200 > window.innerHeight) formY = window.innerHeight - 220;
    if (formY < 10) formY = 10;

    form.style.left = formX + "px";
    form.style.top = formY + "px";

    form.innerHTML = `
      <div class="pp-form-header">
        <span>\u{1F4CC} Add feedback</span>
        <button class="pp-form-close" data-pp-close>&times;</button>
      </div>
      <textarea placeholder="What's the issue or suggestion?" data-pp-body autofocus></textarea>
      <div class="pp-form-actions">
        <button class="pp-btn" data-pp-cancel>Cancel</button>
        <button class="pp-btn pp-btn-primary" data-pp-submit>Submit</button>
      </div>
    `;

    document.body.appendChild(form);

    const textarea = form.querySelector("[data-pp-body]");
    const submitBtn = form.querySelector("[data-pp-submit]");
    textarea.focus();

    const close = () => form.remove();
    form.querySelector("[data-pp-close]").addEventListener("click", close);
    form.querySelector("[data-pp-cancel]").addEventListener("click", close);

    submitBtn.addEventListener("click", async () => {
      const body = textarea.value.trim();
      if (!body) return;

      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";

      try {
        const screenshot = await captureScreenshot();

        await apiRequest("/pins", {
          method: "POST",
          body: JSON.stringify({
            page_url: window.location.pathname,
            page_title: document.title,
            x_percent: xPercent,
            y_percent: yPercent,
            viewport_width: window.innerWidth,
            viewport_height: window.innerHeight,
            page_width: document.documentElement.scrollWidth,
            page_height: document.documentElement.scrollHeight,
            body: body,
            screenshot: screenshot
          })
        });

        close();
        showToast("Feedback submitted!");
        loadExistingPins();
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit";
        showToast("Error: " + err.message);
      }
    });

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        submitBtn.click();
      }
    });
  }

  // ---- Pin mode ----
  function enterPinMode() {
    pinModeActive = true;
    if (bubble) bubble.classList.add("active");

    const overlay = document.createElement("div");
    overlay.className = "pp-overlay";
    document.body.appendChild(overlay);

    const hint = document.createElement("div");
    hint.className = "pp-hint";
    hint.textContent = "Click anywhere to drop a pin \u00B7 ESC to cancel";
    document.body.appendChild(hint);

    const cleanup = () => {
      pinModeActive = false;
      if (bubble) bubble.classList.remove("active");
      overlay.remove();
      hint.remove();
      document.removeEventListener("keydown", escHandler);
    };

    const escHandler = (e) => {
      if (e.key === "Escape") cleanup();
    };
    document.addEventListener("keydown", escHandler);

    overlay.addEventListener("click", (e) => {
      const xPercent = (e.clientX / window.innerWidth) * 100;
      const yPercent = (e.clientY / window.innerHeight) * 100;
      cleanup();
      showPinForm(xPercent, yPercent, e.clientX, e.clientY);
    });
  }

  // ---- Render existing pins ----
  function renderPinMarkers(pins) {
    document.querySelectorAll(".pp-pin-marker").forEach(m => m.remove());

    if (!pinsVisible) return;

    pins.forEach(pin => {
      if (pin.page_url !== window.location.pathname) return;
      if (pin.status === "resolved") return;

      const marker = document.createElement("div");
      marker.className = "pp-pin-marker";
      marker.textContent = "\u{1F4CD}";
      marker.title = `${pin.creator}: ${pin.body || "No comment"}`;

      marker.style.left = (pin.x_percent / 100 * window.innerWidth) + "px";
      marker.style.top = (pin.y_percent / 100 * window.innerHeight) + "px";

      // Click to show popover
      marker.addEventListener("click", (e) => {
        e.stopPropagation();
        showPinPopover(pin, e.clientX, e.clientY);
      });

      document.body.appendChild(marker);
    });
  }

  function clearPageState() {
    existingPins = [];
    document.querySelectorAll(".pp-pin-marker, .pp-popover, .pp-form, .pp-overlay, .pp-hint").forEach(el => el.remove());
    closeAllPanels();
    popoverEl = null;
  }

  async function loadExistingPins() {
    const pageUrl = window.location.pathname;

    // Always clear markers first, before any async work
    existingPins = [];
    document.querySelectorAll(".pp-pin-marker").forEach(el => el.remove());
    currentPageUrl = pageUrl;

    console.log("[Pinpoint] Loading pins for:", pageUrl);

    try {
      const pins = await apiRequest("/pins?page_url=" + encodeURIComponent(pageUrl));
      // Double-check we're still on the same page (user may have navigated during fetch)
      if (window.location.pathname !== pageUrl) return;
      console.log("[Pinpoint] Received", pins.length, "pins:", pins.map(p => p.page_url));
      existingPins = pins;
      renderPinMarkers(existingPins);
    } catch (e) {
      console.warn("[Pinpoint] Failed to load pins:", e.message);
    }
  }

  // ---- Helpers ----
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function truncate(str, len) {
    if (!str) return "";
    return str.length > len ? str.slice(0, len) + "\u2026" : str;
  }

  // ---- Keyboard shortcut ----
  function parseShortcut(combo) {
    const parts = combo.toLowerCase().split("+");
    return {
      shift: parts.includes("shift"),
      meta: parts.includes("meta"),
      ctrl: parts.includes("ctrl"),
      alt: parts.includes("alt"),
      key: parts.find(p => !["shift", "meta", "ctrl", "alt"].includes(p))
    };
  }

  function matchesShortcut(event, shortcut) {
    if (shortcut.shift && !event.shiftKey) return false;
    if (shortcut.meta && !event.metaKey) return false;
    if (shortcut.ctrl && !event.ctrlKey) return false;
    if (shortcut.alt && !event.altKey) return false;
    return event.key.toLowerCase() === shortcut.key;
  }

  // ---- Initialize ----
  function ensureBubble() {
    if (document.querySelector(".pp-bubble")) {
      bubble = document.querySelector(".pp-bubble");
      return;
    }

    bubble = document.createElement("button");
    bubble.className = "pp-bubble";
    bubble.innerHTML = "\u{1F4CC}";
    bubble.title = "Pinpoint Feedback (Shift+Cmd+F)";
    document.body.appendChild(bubble);

    bubble.addEventListener("click", (e) => {
      e.stopPropagation();
      if (pinModeActive) return;
      toggleMenu();
    });
  }

  // Close menu/panels when clicking outside
  document.addEventListener("click", (e) => {
    if (menuOpen && menuEl && !menuEl.contains(e.target) && !e.target.classList.contains("pp-bubble")) {
      closeMenu();
    }
    if (listPanelOpen && listPanelEl && !listPanelEl.contains(e.target) && !e.target.classList.contains("pp-bubble")) {
      closeListPanel();
    }
  });

  function init() {
    injectStyles();
    ensureBubble();
    loadExistingPins();
  }

  // Keyboard shortcut (only bind once)
  const shortcut = parseShortcut(CONFIG.triggerKey);
  document.addEventListener("keydown", (e) => {
    if (matchesShortcut(e, shortcut)) {
      e.preventDefault();
      if (pinModeActive) return;
      toggleMenu();
    }
  });

  // Re-render on resize
  window.addEventListener("resize", () => renderPinMarkers(existingPins));

  // Boot on initial load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Clean up before Turbo replaces the page
  document.addEventListener("turbo:before-render", () => {
    clearPageState();
    if (menuEl) { menuEl.remove(); menuEl = null; }
    if (listPanelEl) { listPanelEl.remove(); listPanelEl = null; }
    bubble = null;
    currentPageUrl = null;
  });

  document.addEventListener("turbo:before-visit", () => {
    clearPageState();
  });

  // Re-init on Turbo navigation
  document.addEventListener("turbo:load", () => {
    ensureBubble();
    loadExistingPins();
  });

  // Fallback: poll for URL changes in case Turbo events don't fire
  // (handles edge cases with Turbo Frames, morphing, etc.)
  let lastCheckedUrl = window.location.pathname;
  setInterval(() => {
    if (window.location.pathname !== lastCheckedUrl) {
      lastCheckedUrl = window.location.pathname;
      clearPageState();
      ensureBubble();
      loadExistingPins();
    }
  }, 500);
})();
