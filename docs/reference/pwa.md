# Staff PWA

The store area `/staff` can be installed on a phone, tablet or desktop. The business entry is
`/staff` on the deployment's public origin, for example `https://app.example.com/staff`. Guest `/q/*`
and Platform `/platform` do not link the staff manifest. This implementation has no push notifications
or offline business operations.

## Files and installation scope

| File                                                                  | Responsibility                                                        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [Manifest](../../frontend/public/staff.webmanifest)                   | App identity, launch URL, scope and icons                             |
| [Service worker](../../frontend/public/sw.js)                         | Navigation network fallback and built-in offline page                 |
| [Install hook](../../frontend/src/features/accounts/useInstallApp.ts) | Manifest link, worker registration and Chromium install offer         |
| [Home page](../../frontend/src/features/accounts/AccountPage.tsx)     | Install action or device-specific instructions                        |
| [PWA tests](../../frontend/tests/pwa.test.ts)                         | Manifest scope, icon dimensions and absence of a global manifest link |

StaffLayout inserts the manifest link when mounted and removes it on unmount. The shared `index.html`
must not link a manifest: that would also advertise the staff app from a guest page. Staff sign-in is
inside StaffLayout, so installation is available before login. Platform has its own website layout.

Manifest `id`, `start_url` and `scope` are `/staff`, without a trailing slash. The router removes trailing
slashes; `/staff/` would exclude the actual Home URL `/staff` from prefix scope. The worker registration
also uses `/staff`. An installed app relaunches at Home, not automatically at Kitchen or Pass.

Origin and manifest ID identify the installed app. A localhost installation is separate from a
production one. Manifest/worker URLs use business-origin paths; no other host's scope or parent-domain
cookie is needed.

## Service worker behavior

- Only navigation requests call `respondWith`: use navigation preload when available, otherwise fetch
  from the network. A rejected network request returns the built-in offline HTML.
- API, scripts, styles, photos and other subresources are left to the browser. There is no Cache
  Storage, cached menu/page/assets or offline write queue. Ordinary browser HTTP caching still applies.
- The offline page reloads on the online event. While visible and reportedly online but still unable
  to reach the server, it retries every 10 seconds, useful for a tablet starting before Wi-Fi is ready.
- A new worker uses `skipWaiting` and `clients.claim`; it does not retain a cached application version.
- Registration runs only in production builds where serviceWorker is available in a secure context
  (HTTPS or localhost), not during Vite development.

The standalone offline page supports Chinese, Italian and English, following the regular staff-page
rule: a valid saved device preference, then the first supported primary language in
`navigator.languages`, then English. Blocked storage still permits browser-language fallback. The
page sets its HTML language and all three text labels together, without importing app assets or
fetching translations. The manifest retains its fixed Chinese installation metadata separately.

## Browser installation and audio

Chrome's [install-promotion criteria](https://web.dev/articles/install-criteria) require secure serving,
a suitable manifest, an app not already installed, and engagement heuristics. A service worker is not
listed as a requirement for `beforeinstallprompt`; this app keeps it for the useful offline screen.
Browsers may also offer manual installation independently of promotion eligibility.

| Browser/device      | Installation entry                                         | Audio considerations                                                        |
| ------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| Android Chrome      | Home install offer when available, or browser install menu | Installed/home-screen apps can qualify for autoplay permission              |
| Desktop Chrome/Edge | Home offer or browser install control                      | Check actual audio state; policies and device settings still apply          |
| iPhone/iPad Safari  | Share menu, Add to Home Screen                             | Plan for a page tap to unlock audio; verify the installed app on the device |

The install offer is saved from `beforeinstallprompt`; each captured invitation calls `prompt()` only
once. Until available, or after dismissal, Home shows manual steps. Home hides the installation section
in standalone mode. Store login is still fixed 30 days; installation does not extend credentials.
Cookie/storage sharing differs between browsers and installed apps, so a fresh installation may need
its own login.

Chrome documents an installed-app exception in its
[autoplay policy](https://developer.chrome.com/blog/autoplay). The application still observes
AudioContext state and offers tap-to-enable guidance rather than assuming sound worked. Kitchen plays
two rising tones; Pass plays three high beeps. First load/resume establishes a silent arrival baseline.
Locking the device or backgrounding the app pauses foreground polling; installation is not background
notification delivery.

For a counter tablet, enable keep-screen-on and set system volume. Wake lock needs browser support,
a secure context and a visible page; the operating system may release it. Use iPad Guided Access or
Android screen pinning if staff want to restrict navigation. See [Kitchen and Pass](kitchen-pass.md).

## Deployment and icons

Production [Caddy configuration](../../deploy/Caddyfile) and release scripts provide:

- HTTPS on the business origin; ordinary LAN HTTP is not suitable for testing full PWA capabilities.
- `Cache-Control: no-cache` on `/sw.js` and `/staff.webmanifest`, with JavaScript/manifest MIME types.
- SPA fallback for business routes, including direct `/staff/*`, `/platform/*` and `/q/*` navigation.
- Immutable caching for hashed assets. The shared asset pool keeps the hashed files of every release
  (nothing prunes it), allowing long-open tabs to load their original lazy chunks.
  New frontend code takes effect after reload/reopen; a service worker does not update a running React
  page's code in place.

| Icon                                       | Size     | Source/use                                                                   |
| ------------------------------------------ | -------- | ---------------------------------------------------------------------------- |
| `icons/icon-192.png`, `icons/icon-512.png` | 192, 512 | `favicon.svg`; normal app icons                                              |
| `icons/icon-maskable-512.png`              | 512      | `icons/maskable.svg`; artwork inside the central 40%-radius safe area        |
| `apple-touch-icon.png`                     | 180      | Opaque full-square maskable artwork for iOS; OS applies its own corner shape |

Icon paths are relative to `frontend/public/`. Update both SVG sources and their corresponding PNGs
when replacing artwork; keep manifest sizes synchronized. No runtime image-rendering dependency is
needed for the exported icons. Use the [Italian self-hosting guide](../it/self-hosting.md) for deployment.

## Verification entry points

Development does not register the worker. With the API running, build/preview locally when testing PWA:

```bash
cd frontend
npm run build
npm run preview
```

Preview uses `http://localhost:4173` with the API proxy inherited from Vite configuration. Check browser
Application tools: one manifest link on staff pages, worker scope `/staff`, expected icons and no Cache
Storage. In a fresh browser profile opening only `/q/{token}`, confirm there is no manifest/worker
registration. A fresh guest navigation is outside worker scope. Also verify offline reload and online
recovery, standalone Home without the install section, and each install invitation used only once.

Android USB port forwarding can expose computer port 4173 as phone localhost for secure-context tests.
Use HTTPS for iPhone/iPad device checks. Verify actual sound, safe areas, navigation, sheets and external
menu links on real installed apps; desktop mobile emulation cannot establish those results.
Run the [PWA tests](../../frontend/tests/pwa.test.ts) for static invariants and actual offline-script
execution with saved/browser languages, blocked storage and reconnect behavior. These Node tests do
not verify operating-system installation or audio permissions.
