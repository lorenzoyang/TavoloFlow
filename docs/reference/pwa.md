# Staff and administrator PWAs

The store area `/staff` can be installed on a phone, tablet or desktop. The business entry is
`/staff` on the deployment's public origin, for example `https://app.example.com/staff`. Guest and customer routes do not link a manifest. The staff app sends lock-screen reminders for new online orders. The administrator app sends subscription reminders. Business operations require a network connection.

## Files and installation scope

| File                                                                  | Responsibility                                                        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [Manifest](../../frontend/public/staff.webmanifest)                   | App identity, launch URL, scope and icons                             |
| [Service worker](../../frontend/public/sw.js)                         | Navigation network fallback, offline page, push and notification taps |
| [Push switch](../../frontend/src/features/push/PushSection.tsx)       | Home page lock-screen notification switch for this device             |
| [Push sync](../../frontend/src/features/push/usePushSync.ts)          | Owns shared registration state and foreground reconciliation           |
| [Install hook](../../frontend/src/features/accounts/useInstallApp.ts) | Manifest link, worker registration and Chromium install offer         |
| [Home page](../../frontend/src/features/accounts/AccountPage.tsx)     | Install action or device-specific instructions                        |
| [PWA tests](../../frontend/tests/pwa.test.ts)                         | Manifest, icons, offline page, push and notification-tap handlers     |
| [Push tests](../../frontend/tests/push.test.ts)                       | Support, confirmation, recovery, operation races and registration body     |

StaffLayout inserts the manifest link when mounted and removes it on unmount. The shared `index.html`
must not link a manifest: that would also advertise the staff app from a guest page. Staff sign-in is
inside StaffLayout, so installation is available before login. Platform has its own installable layout and manifest.

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
- **Turning on and confirmation.** Home (首页) shows the switch while online ordering is on and the
  server has a key, including installation guidance on unsupported devices. A tap requests permission
  immediately, subscribes with `userVisibleOnly` and PUTs the device with the interface language.
  Only a successful PUT for the current account, endpoint, key and language shows "on". A failed
  registration retains the browser subscription and shows a retry action; turning off remains available.
- **One controller.** `StaffLayout` provides one push controller through React Context. Automatic
  registration, the home controls, password changes and logout share its state and operation tracker.
  It reconciles at startup, identity/language changes, the account's own password change, foreground
  return, window focus and reconnect. Concurrent events share one operation; obsolete results are
  discarded. There are no retry timers, durable markers or service-worker background registrations.
  A rotated browser subscription is uploaded on the next foreground check; old endpoints retain the
  server's 404/410 and sign-in-expiry cleanup. An older VAPID key is unsubscribed and requires a new tap.
- **Sign-out.** The controller pauses automatic registration and lets an in-flight operation settle.
  It reads the browser endpoint and passes it as `pushEndpoint` to `POST /api/auth/logout`. The server
  removes that restaurant's row before clearing the cookie. If the Service Worker API, staff worker
  registration or PushManager is absent, logout proceeds without an endpoint. Actual registration or
  subscription read failures, or server revocation failures, leave the user signed in with an error
  and manual retry/identity-check actions. A lost response uses the existing GET identity check, never
  an automatic logout retry. The browser keeps its subscription for registration at the next sign-in;
  only "turn off for this device" unsubscribes it, after a best-effort DELETE. Already-dispatched
  notifications may still arrive after sign-out.
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
- `Cache-Control: no-cache` on `/sw.js`, `/platform-sw.js`, `/staff.webmanifest` and
  `/platform.webmanifest`, with JavaScript and manifest MIME types.
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


## Administrator PWA

The administrator layout links `/platform.webmanifest` and registers `/platform-sw.js` in
production builds. The manifest ID, start URL and scope are `/platform`. The worker serves no
cached content and handles push and notification taps. Opening from the app icon or tapping a
notification reaches the restaurant list through the same administrator sign-in and unread
summary.

The administrator opts in per device. Both apps share the VAPID key and transport. Endpoints for
the administrator are `GET /api/platform/push/key` and `PUT|DELETE /api/platform/push/subscription`.
A registration belongs to a platform account and expires with its fixed 30-day login. Logout
revokes that device with its endpoint. A changed credential version, deactivation, expiry or a
push service returning 404/410 invalidates the registration. A new sign-in reconciles an existing
browser subscription in the foreground.

Each push contains the number of restaurants and the device language. It shows one summary
notification and focuses the restaurant list in an open administrator window, or opens one.
The app reads its current notices from the server. The push carries no acknowledgments or
subscription details. The same [subscription workflow](restaurant-subscriptions.md#notices-and-follow-up)
works with the browser’s notification permission blocked.
