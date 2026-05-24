# Changelog

## 0.1.0 — 2026-05-23

Initial release. Vanilla-JS feedback widget — no framework, no build step,
no backend.

### Features
- Floating trigger button in a configurable corner (`top-left`, `top-right`,
  `bottom-left`, `bottom-right`); end-users can re-position from the panel.
- One-click pin mode: opening the panel **is** entering pin mode. No
  separate "drop a pin" button — once the panel is open, clicking
  anywhere on the page drops a pin. Click the trigger again (or the
  panel's X) to close the panel and exit pin mode. Crosshair cursor +
  page tint signal the active state.
- 400&times;200 screenshot of the area around each click, captured via
  [html2canvas](https://html2canvas.hertzen.com/) — lazy-loaded from a CDN
  the first time pin mode is entered. Graceful degradation if blocked.
- Inline composer popover for the pin's comment, with `Cmd/Ctrl + Enter`
  to save.
- Numbered teardrop markers persist on the page at recorded coordinates.
  Click a marker to view its details (timestamp, thumbnail, body, delete).
- Settings panel from the trigger: drop a pin, switch corner, list pins,
  export to JSON, clear all.
- Storage: `sessionStorage` (default), `localStorage`, or in-memory.
- Optional global keyboard shortcut via `keyboardTrigger` option.
- Hooks: `onPinAdd`, `onPinDelete`, `onPinClick`.
- Methods: `enable`, `disable`, `toggle`, `setPosition`, `getPins`,
  `deletePin`, `clear`, `exportJSON`, `exportFile`, `importJSON`,
  `destroy`.

### Package
- Name: `@goboldlyforward/pinpoint` (scoped, `publishConfig.access: public`).
- License: MIT.
- Files: `pinpoint.js`, `pinpoint.css`, `README.md`, `LICENSE`, `CHANGELOG.md`.

### Notes
- This is a clean-room rewrite. An earlier scaffold targeted a Rails engine
  with html2canvas + ActiveStorage + a dashboard; it was abandoned before
  reaching a release. The Rails scaffold is preserved at
  [`archive/rails-engine/`](archive/rails-engine/) for reference and is not
  part of the published package.
