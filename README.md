# pinpoint

Drop-in feedback widget for any web page. A floating trigger button lets your users click anywhere on the page, capture a 200&times;200 thumbnail of the area, and attach a comment. Pins persist in `sessionStorage` by default — no backend required.

## Demo

[goboldlyforward.github.io/pinpoint](https://goboldlyforward.github.io/pinpoint/) — open the trigger, click **Drop a pin**, then click anywhere on the page.

## What it does

- A round trigger button floats in a corner of your page (configurable: any of the four corners).
- Click it to open a tiny settings panel: drop a pin, change position, list/export/clear pins.
- Click **Drop a pin** → the cursor turns into a crosshair → click anywhere on the page to mark a spot.
- A 200&times;200 screenshot of the surrounding area is captured (via [html2canvas](https://html2canvas.hertzen.com/), lazy-loaded from a CDN on first use).
- A composer popover opens at the pin location for a comment.
- Pins render as numbered teardrop markers on the page. Click a marker to read or delete it.
- Everything persists in `sessionStorage` (configurable to `localStorage` or in-memory).

No framework, no build step, no backend. Drop in the CSS + JS and you're done.

## Install

```bash
npm install @goboldlyforward/pinpoint
```

Or grab the files directly:

```html
<link rel="stylesheet" href="path/to/pinpoint.css">
<script src="path/to/pinpoint.js"></script>
```

## Usage

```html
<script>
  const pinpoint = new Pinpoint({
    position: 'bottom-left',
    storage:  'session',
    screenshot: true,
    keyboardTrigger: 'shift+meta+f',
  });
</script>
```

That's all the integration. The widget mounts itself when the DOM is ready.

## Options

```js
new Pinpoint({
  position:        'bottom-left',  // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  storage:         'session',      // 'session' | 'local' | 'memory'
  storageKey:      'pinpoint:pins',
  screenshot:      true,
  screenshotSize:  200,            // px; min 50
  html2canvasUrl:  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
  keyboardTrigger: null,           // e.g. 'shift+meta+f'
  autoStart:       true,
  showMarkers:     true,
  onPinAdd:    (pin) => {},
  onPinDelete: (pin) => {},
  onPinClick:  (pin) => {},
});
```

## Methods

```js
pinpoint.enable();          // enter pin mode
pinpoint.disable();         // leave pin mode
pinpoint.toggle();
pinpoint.setPosition('top-right');
pinpoint.getPins();         // returns shallow copies
pinpoint.deletePin(id);
pinpoint.clear();
pinpoint.exportJSON();      // returns JSON string
pinpoint.exportFile();      // downloads pinpoint-pins.json
pinpoint.importJSON(data);
pinpoint.destroy();
```

## Pin shape

```js
{
  id:         'pin-l9wq4z-x4f2k1',
  x:          452,                       // px from document left
  y:          1280,                      // px from document top
  xPercent:   0.31,                      // x as fraction of document width
  yPercent:   0.78,                      // y as fraction of document height
  viewport:   { width: 1440, height: 900 },
  document:   { width: 1440, height: 1640 },
  body:       'Misaligned button',
  thumbnail:  'data:image/png;base64,…', // 200x200 PNG, or null
  pageUrl:    'https://example.com/page',
  pageTitle:  'Example',
  createdAt:  '2026-05-23T14:02:11.000Z',
}
```

## Shipping pins to a backend

Pinpoint is local-only by default. To send pins somewhere, wire up `onPinAdd`:

```js
new Pinpoint({
  onPinAdd: async (pin) => {
    await fetch('/api/pins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pin),
    });
  },
});
```

The pin is already in storage by the time the hook fires, so a failed POST won't lose the pin — the user can retry from the panel's **Export** button.

## Keyboard

- `Esc` — cancel pin mode / close the composer / close the panel
- `Cmd/Ctrl + Enter` — save the current comment
- `keyboardTrigger` option — global hotkey to toggle pin mode (e.g. `'shift+meta+f'`)

## Screenshots

Pinpoint lazy-loads [html2canvas](https://html2canvas.hertzen.com/) from jsDelivr the first time a pin is dropped. If the CDN is blocked, or if `screenshot: false` is set, pins save without a thumbnail. The screenshot ignores the Pinpoint widget itself so it doesn't appear in the capture.

## Requirements

HTML, CSS, and ~10KB of JavaScript. No framework, no build step. Uses pointer/keyboard events, `sessionStorage`/`localStorage`, and a lazy-loaded copy of html2canvas.

## License

MIT — see [LICENSE](LICENSE).
