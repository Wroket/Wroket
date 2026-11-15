# Wroket Chrome clipper

MV3 extension — see [`docs/chrome-extension.md`](../../docs/chrome-extension.md).

```bash
npm ci
npm run build
# Chrome → Extensions → Load unpacked → select `dist/`
```

Local API smoke (optional): in the service worker console,

```js
chrome.storage.local.set({ apiBase: "http://localhost:3001", webBase: "http://localhost:3000" })
```

Then temporarily add `http://localhost:3001/*` to `host_permissions` in `public/manifest.json` and rebuild.
