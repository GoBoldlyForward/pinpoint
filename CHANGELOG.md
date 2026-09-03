# Changelog

## 0.2.0 — 2026-09-01

### Added
- **Page notes.** Feedback about a whole screen no longer has to be pinned to
  an arbitrary point on it. With the panel open, the new **Page note** zone
  accepts an image by paste (`Cmd/Ctrl + V`), by drag-and-drop, or by file
  picker, then opens the usual composer for a comment. Notes carry `kind:
  'note'`, `null` coordinates, and no page marker; pins gain `kind: 'pin'`.
  Anything already stored without a `kind` is read as a pin.
- Note images are re-encoded before they are stored: capped at `noteMaxEdge`
  on the long edge and written as JPEG at `noteQuality`, then shrunk further
  if needed to fit `noteMaxBytes`. A retina screenshot is routinely several
  megabytes, which most backends receiving `onPinAdd` will reject.
- New options: `notes`, `noteMaxEdge`, `noteQuality`, `noteMaxBytes`.

### Fixed
- The panel's pin list went stale after saving: `_savePin` re-rendered the
  page markers but never the panel, so a pin dropped with the panel open did
  not appear in the list (nor did the count change) until the panel was
  closed and reopened.

## 0.1.1 — 2026-07-10

### Fixed
- The widget vanished after any Turbo Drive navigation until a hard reload:
  Turbo swaps the whole `<body>`, discarding the widget's DOM, while the
  embed guard kept the script from re-initializing. The widget now tears
  itself down on `turbo:before-cache` (keeping cached snapshots clean) and
  remounts on `turbo:load`, rendering the markers that belong to the new page.
- Markers rendered on every page of the site: `_renderAllPins` ignored each
  pin's `pageUrl`, so a pin dropped on one page floated at meaningless
  coordinates on every other same-origin page that session. Markers now
  render only on the page (origin + pathname, ignoring query and hash)
  where the pin was dropped. The panel still lists the whole session;
  opening a pin from another page navigates to that page.
- Marker numbers rendered tilted. The teardrop shape comes from rotating
  `.pinpoint-marker` by -45&deg;, and `.pinpoint-marker > *` counter-rotates
  its children upright — but the digit was set as a bare text node, which
  the child selector never matches. The number is now wrapped in a
  `<span class="pinpoint-marker__num">`, so digits sit upright.
- Pins dropped in the lower half of the viewport could push the composer's
  Save/Cancel buttons below the fold: the dialog was positioned before its
  data:-URI thumbnail decoded, so the measured height came up ~200px short
  and the flip-above-the-pin logic never triggered. The thumbnail `<img>`
  now carries width/height attributes so the dialog lays out at its final
  size immediately, and the dialog re-positions on image load in case the
  decoded size still differs.

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
