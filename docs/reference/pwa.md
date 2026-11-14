# Staff PWA

The store area `/staff` can be installed on a phone, tablet or desktop. The business entry is
`/staff` on the deployment's public origin, for example `https://app.example.com/staff`. Guest `/q/*`
and Platform `/platform` do not link the staff manifest. The only push notifications are lock-screen
reminders of new online orders; there are no offline business operations.

## Files and installation scope

| File                                                                  | Responsibility                                                        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [Manifest](../../frontend/public/staff.webmanifest)                   | App identity, launch URL, scope and icons                             |
| [Service worker](../../frontend/public/sw.js)                         | Navigation network fallback, offline page, push and notification taps |
| [Push switch](../../frontend/src/features/push/PushSection.tsx)       | Home page lock-screen notification switch for this device             |
| [Push sync](../../frontend/src/features/push/usePushSync.ts)          | Registers a kept browser subscription again at each sign-in           |
| [Install hook](../../frontend/src/features/accounts/useInstallApp.ts) | Manifest link, worker registration and Chromium install offer         |
| [Home page](../../frontend/src/features/accounts/AccountPage.tsx)     | Install action or device-specific instructions                        |
| [PWA tests](../../frontend/tests/pwa.test.ts)                         | Manifest, icons, offline page, push and notification-tap handlers     |
| [Push tests](../../frontend/tests/push.test.ts)                       | Support detection, switch state, server key and registration body     |

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

## Lock-screen push

New online orders reach staff devices as system notifications even when the device is locked or the app
is in the background. They are reminders only: nothing depends on delivery, and the page's own polling
and ringing are unchanged. Server contracts, the VAPID key and the sending rules are in
[online ordering](online-ordering.md#lock-screen-push).

- **Support.** Push needs a secure context, the registered staff worker (production builds only, so
  development shows "not supported"), `PushManager` and `Notification`. iPhone and iPad (iOS 16.4+)
  expose push only to the app opened from the Home Screen, so Safari shows "add to the Home Screen
  first"; Android Chrome and desktop Chrome, Edge and Firefox work in the browser too.
- **Turning on.** Home (首页) shows the switch while online ordering is on and the server has a key. The
  tap requests the notification permission (Safari grants the prompt only to a gesture), subscribes with
  `userVisibleOnly` and the server's public key, and PUTs the subscription with the interface language.
  Any failure unsubscribes the browser again, so "on" always means registered. A blocked permission is
  explained instead of a button.
- **Sign-in and sign-out.** Signing out DELETEs this device's row before the logout request (best
  effort, at most 5 seconds) but keeps the browser subscription. Whenever a store account is signed in
  with online ordering, the permission granted and a subscription made with the current server key,
  `StaffLayout` PUTs it again: after any sign-in on the device, after a language change, and after the
  account's own password change. A subscription made with an older server key is unsubscribed and the
  switch shows "off". Only "turn off for this device" removes the browser subscription, after a
  best-effort DELETE.
- **Notifications.** `sw.js` turns `{ number, language }` into "新线上订单 #12", "Nuovo ordine online
  #12" or "New online order #12" with a short body, tag `online-order-{number}` (one notification and
  one system sound per order; `renotify` for a repeated number) and the app icon. A malformed payload
  still shows a generic notification, because browsers require one per push and Safari revokes
  subscriptions that show none. A tap focuses an open `/staff` window and navigates it to
  `/staff/online`, or opens a new window there. Opening the online orders page, or returning to it,
  closes this device's online-order notifications.
- **Lock screen.** The system shows one notification and plays its own sound once; it never rings
  continuously. Do-not-disturb, focus modes and battery savers may delay or silence it.

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
Locking the device or backgrounding the app pauses foreground polling and ringing; only the online
order push above reaches a locked device.

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
needed for the exported icons. Use the [self-hosting guide](../en/self-hosting.md) for deployment.

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
execution with saved/browser languages, blocked storage and reconnect behavior, and the push and
notification-tap handlers with stubbed worker APIs. These Node tests do not verify operating-system
installation, audio permissions or real push delivery.

Push needs a real push service, which automated browsers do not provide; backend integration tests
capture and decrypt what would be sent. To see a real notification locally, set `WebPush:PrivateKey`
(`openssl rand -hex 32`) and `WebPush:Subject` (for example `mailto:you@example.com`) as user secrets,
run the API with the `http` profile and `npm run build && npm run preview`, open
`http://localhost:4173/staff` in desktop Chrome or in Android Chrome through USB port forwarding, sign in
and turn notifications on from Home. Lock the phone or background the browser, submit an online order
from another device, and check the notification, its sound and that a tap opens the online orders page.
Test iPhone and iPad on an HTTPS deployment, from the app added to the Home Screen.
