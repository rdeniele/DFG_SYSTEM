# Android app (Trusted Web Activity)

The Android app is the website wrapped in a thin Android shell (a **Trusted Web Activity**,
built with Google's **Bubblewrap**). It opens full-screen with no address bar, uses Chrome
under the hood, and updates itself whenever you deploy the website. You only rebuild the APK
if you change the app icon, name, or colors.

**No Play Store yet.** Members download the APK from the gym website
(`https://<your-domain>/downloads/daryl-fitness-gym.apk`), linked by the
"Download the app" button on the landing page. Play Store steps are at the end, for later.

---

## 0. Before you start

- The website is **deployed on Vercel with HTTPS** (see README.md), and these work in a browser:
  - `https://<your-domain>/manifest.webmanifest`
  - `https://<your-domain>/icons/icon-512.png`
  - `https://<your-domain>/.well-known/assetlinks.json`
- In Chrome DevTools → **Lighthouse**, the site passes the installability checks
  (or Chrome shows "Install app" in its menu).
- On your PC: **Node.js 18+**. Bubblewrap downloads the Java JDK and Android SDK for you
  the first time (say **Yes** when it asks).

Pick your package name now and never change it: this guide uses **`com.darylfitnessgym.app`**.
It must match `public/.well-known/assetlinks.json`.

---

## 1. Install Bubblewrap

```bash
npm install -g @bubblewrap/cli
```

## 2. Create the Android project

Make a folder **outside** this website project (so it isn't deployed or committed by accident):

```bash
mkdir dfg-android
cd dfg-android
bubblewrap init --manifest https://<your-domain>/manifest.webmanifest
```

Answer the questions (most defaults come from the manifest):

| Question | Answer |
|---|---|
| Domain | `<your-domain>` (no `https://`) |
| Application name | `Daryl Fitness Gym` |
| Short name (launcher) | `DFG` |
| Application ID / package | `com.darylfitnessgym.app` |
| Start URL | `/login?source=app` |
| Display mode | `standalone` |
| Status bar / theme color | `#dc2626` |
| Splash background | `#ffffff` |
| Icon / maskable icon | keep the URLs it suggests (`/icons/icon-512.png`, `/icons/maskable-512.png`) |
| Notifications / location delegation | **No** |
| Signing key | **Create a new one**. Keystore `./android.keystore`, alias `android` |
| Passwords | Choose strong ones and **write them down** |

> ⚠️ **Back up `android.keystore` and its passwords** (e.g. a USB drive + a password manager).
> Every future update must be signed with the **same key**. If you lose it, members must
> uninstall the old app and install a new one, and you must update `assetlinks.json`.
> Never put the keystore in the website folder, Git, or a public place.

## 3. Build the APK

```bash
bubblewrap build
```

You get:

- `app-release-signed.apk`: **this is the file members install** (sideload).
- `app-release-bundle.aab`: only for the Play Store later. Keep it, but you don't need it now.

## 4. Put your key's fingerprint in `assetlinks.json`

This proves to Android that the app and the website belong together. Without it the app still
works, but shows a **browser address bar at the top**.

Get the SHA-256 fingerprint:

```bash
keytool -list -v -keystore android.keystore -alias android
```

Copy the line that starts with `SHA256:` (looks like `AB:CD:12:...`, 32 pairs).
(Bubblewrap can also do it: `bubblewrap fingerprint generateAssetLinks` writes a ready
`assetlinks.json` you can copy.)

In **this website project**, edit `public/.well-known/assetlinks.json` and replace the
placeholder:

```json
"sha256_cert_fingerprints": [
  "AB:CD:12:...:YOUR:FINGERPRINT"
]
```

## 5. Put the APK on the website

1. Copy `app-release-signed.apk` into this project as
   **`public/downloads/daryl-fitness-gym.apk`** (exact name).
2. Check `.env` / Vercel has `NEXT_PUBLIC_ANDROID_APP_URL=/downloads/daryl-fitness-gym.apk`
   (that's the default in `.env.example`).
3. Commit and deploy (`git push`, Vercel deploys automatically).
4. Check in a browser:
   - `https://<your-domain>/.well-known/assetlinks.json` shows your fingerprint
   - `https://<your-domain>/downloads/daryl-fitness-gym.apk` starts a download

Optional check with Google's tool:
`https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://<your-domain>&relation=delegate_permission/common.handle_all_urls`
should list `com.darylfitnessgym.app` with your fingerprint.

## 6. Install on a phone (what members do)

1. Open `https://<your-domain>` in **Chrome** on the Android phone
   (not inside Messenger/Facebook; use ⋯ → *Open in Chrome*).
2. Tap **Download the app**, then **Open** when the download finishes.
3. If asked, tap **Settings** → turn on **Allow from this source** → go back.
4. Tap **Install**.
5. If **Google Play Protect** warns that the app is unknown: tap **More details** →
   **Install anyway**. (This happens for any app not from the Play Store. It goes away once
   you publish on the Play Store.)
6. Open **DFG** from the home screen. There should be **no address bar**. If you see one,
   step 4 (fingerprint) isn't right or isn't deployed yet. Uninstall, fix, and reopen.

Front desk tip: install it once on your own phone first, then help members at the counter.

## 7. Updating the app later

Most changes need **no new APK**: deploy the website and the app shows the new version.

Rebuild only if you change the **name, icon, colors, or start URL**:

1. In `dfg-android/twa-manifest.json`, increase `appVersionCode` by 1 (e.g. `1` → `2`)
   and set `appVersionName` (e.g. `"1.1"`).
2. Run:
   ```bash
   bubblewrap update
   bubblewrap build
   ```
3. Replace `public/downloads/daryl-fitness-gym.apk` and deploy.
4. Members download and install it over the old one (same key = no uninstall needed).

---

## Later: publishing on the Google Play Store

When you have a Google Play developer account (one-time US$25):

1. Play Console → **Create app** → upload **`app-release-bundle.aab`**.
2. Play uses **Play App Signing**: it re-signs the app with *Google's* key. Go to
   **Setup → App signing** and copy the **App signing key certificate SHA-256**.
3. **Add** it to `assetlinks.json` (keep your own fingerprint too, so sideloaded copies keep working):
   ```json
   "sha256_cert_fingerprints": [
     "YOUR:OWN:UPLOAD:KEY:FINGERPRINT",
     "GOOGLE:PLAY:APP:SIGNING:KEY:FINGERPRINT"
   ]
   ```
   Deploy the website.
4. Fill in the store listing, privacy policy URL, content rating, and data safety form, then
   submit for review.
5. Change `NEXT_PUBLIC_ANDROID_APP_URL` in Vercel to the Play Store link
   (`https://play.google.com/store/apps/details?id=com.darylfitnessgym.app`) and redeploy.
   You can then delete the APK from `public/downloads/`.

> Members who installed the sideloaded APK can't update it from the Play Store (the
> signatures differ). Ask them to uninstall it and install from the Play Store.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Address bar shows at the top | Fingerprint in `assetlinks.json` doesn't match the key that signed the APK, or not deployed yet. Check step 4 and the Google tool URL. Then clear Chrome's data or reinstall the app. |
| "App not installed" | An older copy signed with a different key is installed. Uninstall it first. |
| Download does nothing | They're inside Messenger/Facebook. Open the page in Chrome. |
| `bubblewrap init` can't read the manifest | Make sure the site is deployed and `https://<your-domain>/manifest.webmanifest` opens in a browser. |
| Java / SDK errors | Run `bubblewrap doctor`, or delete `~/.bubblewrap/config.json` and let it download the JDK and SDK again. |
