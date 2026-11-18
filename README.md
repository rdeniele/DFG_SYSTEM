# Daryl Fitness Gym: Membership System

Replaces the paper sign-in sheet and the whiteboard. Members register and check their
membership on their phone. The front desk sets and renews end dates, logs walk-ins, and
sees a daily summary. Payment stays cash at the front desk; the app never handles money.

- **Members:** register (name, phone, 6-digit PIN, optional photo) → see PENDING → after
  paying at the desk, see ACTIVE / EXPIRING SOON / EXPIRED with the end date.
- **Front desk (admin):** member list with search and filters, renew (Weekly / Half-month /
  Monthly / set a date), edit, reset PIN, turn off, walk-ins, summary.
- **Phones:** installable web app (Android + iPhone), plus an Android APK downloaded from the site
  (see [ANDROID.md](ANDROID.md)).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth,
Storage, Row Level Security) · Vercel. Dates use **Asia/Manila**; money is **PHP (₱)**.

---

## 1. Run it on your computer

Needs **Node.js 20+**.

```bash
npm install
cp .env.example .env.local     # then fill it in (step 2)
npm run dev                    # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / run it |
| `npm run db:migrate` | Applies database migrations to Supabase (needs `DATABASE_URL`) |
| `npm run db:status` | Shows which migrations are applied |
| `npm run seed` | Sample members, walk-ins, and an admin (**test projects only**) |
| `npm run check:rls` | Checks the security rules on your Supabase project with the public key |
| `npm run test:db` | Tests the SQL migration offline (in-memory Postgres, no Supabase needed) |
| `npm run icons` | Rebuilds all app icons from `public/DFG_logo.png` |

## 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com). Pick the **Southeast Asia (Singapore)**
   region (closest to the Philippines).
2. **Create the database (one command, with Prisma):**
   - Supabase → **Connect** (top bar) → **Session pooler** → copy the connection string.
   - Put it in `.env.local` as `DATABASE_URL=...`, replacing `[YOUR-PASSWORD]` with your database
     password (Project Settings → Database → reset it if you don't know it).
   - Run:

     ```bash
     npm run db:migrate
     ```

   This applies everything in `prisma/migrations/`: tables, the `member_status` view, security
   rules, triggers, and the `avatars` photo bucket. Run `npm run db:status` to see what's applied.
   (Alternative without a password: paste `prisma/migrations/20261118000000_init/migration.sql`
   into Dashboard → SQL Editor → Run.)

   > Prisma is only the migration runner. The app itself uses Supabase's client so Row Level
   > Security protects the data; there's no Prisma Client. To change the database later, add a new
   > folder `prisma/migrations/<timestamp>_<name>/migration.sql` and run `npm run db:migrate`.
3. **Email confirmation: no change needed.** Members log in with phone + PIN using a hidden
   `09XXXXXXXXX@members.gym.local` address that can't receive mail, so the app creates accounts
   on the server as already confirmed (`app/api/register`). "Confirm email" can stay ON or OFF.
   Keep the **Email** provider itself **enabled**.
4. **Password rules:** Authentication → **Sign In / Providers** → Email: minimum password length
   must be **6** (the default) and leave "password requirements" at **no required characters**,
   since PINs are 6 digits.
5. **Rate limits:** many members may register on the gym's Wi-Fi (one IP address) at once.
   If people see "Too many tries", raise the sign-up / sign-in limits under
   Authentication → **Rate Limits**.
6. **URL settings:** Authentication → **URL Configuration** → Site URL = your Vercel URL
   (e.g. `https://darylfitnessgym.vercel.app`).
7. **Keys:** Project Settings → **API Keys**. Copy into `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...        # "anon" / publishable key: safe for the browser
   SUPABASE_SERVICE_ROLE_KEY=...            # "service_role" / secret key: server only, never share
   NEXT_PUBLIC_ANDROID_APP_URL=/downloads/daryl-fitness-gym.apk
   ```

   The service role key is used only by the **Reset PIN** button (server-side, after checking
   the caller is an admin) and by `npm run seed`. Never put it in a `NEXT_PUBLIC_` variable.

### Try it with sample data (test project only)

```bash
npm run seed        # prints the test logins
npm run check:rls   # should say: All security checks passed
```

Admin: `09990000000` / PIN `123456`. Members: `09170000001` … `09170000015` / PIN `111111`.
Covers every status (pending, active, expiring in 0–3 days, expired), history, and walk-ins.

> Don't seed the real gym database. Use a separate Supabase project for testing, or delete
> the sample accounts afterwards (Authentication → Users).

## 3. Make the first admin

There's no admin sign-up screen on purpose.

1. The owner/front-desk person **registers in the app** like a member (their own phone number).
2. In Supabase → **SQL Editor**, run (with their number):

   ```sql
   update public.profiles set role = 'admin' where phone = '09XXXXXXXXX';
   ```

3. They log out and log in again. They now land on the **Front desk** screen.

To remove admin access later: `update public.profiles set role = 'member' where phone = '09XXXXXXXXX';`
(An admin can't remove their own admin role from inside the app.)

## 4. Set prices and branding

- **Plans and prices:** `lib/plans.ts`

  ```ts
  export const PLANS = {
    weekly:     { label: "Weekly",     days: 7,  price: 0 },
    half_month: { label: "Half-month", days: 15, price: 0 },
    monthly:    { label: "Monthly",    days: 30, price: 0 },
  } as const;
  export const WALK_IN_PRICE = 0;
  export const EXPIRING_SOON_DAYS = 3;
  ```

  Prices fill in the amount box automatically (staff can still change it). If you change
  `EXPIRING_SOON_DAYS`, also change the `3` in the `member_status` view (add a new migration that recreates the view).
- **Name and colors:** `lib/theme.ts` (gym name, short name, tagline, colors) and the matching
  `--brand`, `--brand-dark`, `--ink` variables at the top of `app/globals.css`. Current branding
  follows the DFG logo: red `#d40111`, black `#111111`, white.
- **Logo / app icons:** the source is `public/DFG_logo.png` (white circle on black). After replacing it,
  run `npm run icons` to rebuild every app icon and the small in-app logo (`public/icons/logo-256.png`).
  If the new logo isn't the same circle shape, adjust `CIRCLE` in `scripts/make-icons.ts`.
  Then bump `VERSION` in `public/sw.js` so installed apps pick up the new icons.

## 5. Deploy to Vercel

1. Push this project to GitHub (private repo is fine).
2. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo. Framework: Next.js
   (auto-detected). No build settings to change.
3. **Environment Variables:** add the four from `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `NEXT_PUBLIC_ANDROID_APP_URL`) → **Deploy**.
4. Put the Vercel URL in Supabase → Authentication → URL Configuration → Site URL.
5. Optional: add your own domain in Vercel → Project → **Domains**.
6. Open the site on a phone:
   - **Android (Chrome):** menu ⋮ → **Install app** (or use the APK, below).
   - **iPhone (Safari):** Share → **Add to Home Screen**.
7. Build the Android APK and put it on the site: follow **[ANDROID.md](ANDROID.md)**.

After changing `NEXT_PUBLIC_*` variables in Vercel, **redeploy** (they're baked in at build time).

## How it works

### Membership rules
- Every renewal adds a **new row** in `memberships` (that's also the payment history). Nothing is overwritten.
- **Renewal:** if the member is still active (or expiring), the new days are added **after** their
  current end date, so they don't lose days. If expired or pending, it starts **today**.
- `end_date` is **inclusive** (they can still train on that day). A Monthly plan = 30 days of use:
  bought on Nov 18 → good until Dec 17.
- **Set date manually** is for copying dates from the old whiteboard and for corrections.
  The newest saved entry always wins.
- **Status** is never stored; it's calculated from the latest entry's end date vs today in Manila:
  no membership → **PENDING**, end date passed → **EXPIRED**, 3 days or fewer left → **EXPIRING SOON**,
  otherwise **ACTIVE**. Same rule in `lib/status.ts` (`getMemberStatus()`) and the `member_status` SQL view.

### Security (Row Level Security)
- Members can only read their **own** profile and history, and can only change their own
  name and photo, **not** their role, phone, or active status (a database trigger blocks it).
- Only admins can add or change memberships and walk-ins, and see other members.
- Photos: anyone can view an avatar by its link; members can only upload into their own folder.
- Sign-up always creates a **member**; nobody can sign up as an admin.
- Run `npm run check:rls` after any database change to confirm.

### Offline
- The app's screens are saved on the phone by a service worker (`public/sw.js`).
- A member's last loaded status is kept on the phone and shown with **"Last updated …"** when
  there's no internet. The status still switches to EXPIRED on the right day, even offline.
- Logging out clears the saved status.

### Project layout

```
app/
  page.tsx, Landing.tsx   landing page (Android download / iPhone Add to Home Screen / desktop)
  login/  register/       phone + PIN auth
  me/                     member status
  admin/                  member list + profile (split view on tablet/PC), walk-ins
  admin/summary/          today / this month / counts
  api/admin/reset-pin/    server route for Reset PIN (admin only)
  manifest.ts, offline/   PWA manifest and offline page
lib/
  supabase/               browser, server, proxy (session refresh + route guard), admin clients
  plans.ts  status.ts  phone.ts  dates.ts  theme.ts
proxy.ts                  Next.js 16's name for middleware.ts: protects /me and /admin
prisma/migrations/        database schema, view, triggers, RLS, storage (plain SQL, applied by Prisma)
scripts/                  seed, check-rls, test-db, make-icons
public/
  sw.js  icons/  downloads/  .well-known/assetlinks.json
```

## Common questions

**A member forgot their PIN.** Front desk → open the member → **Reset PIN** → type a new 6-digit
PIN → tell the member. (Needs `SUPABASE_SERVICE_ROLE_KEY` set in Vercel.)

**A member changed their phone number.** Front desk → open the member → **Edit** → new number.
Their login changes to the new number automatically.

**Someone left the gym.** Open them → **Turn off member**. They can't log in, and they move to
"Turned off" at the bottom of the list. Turn them back on any time; their history is kept.

**Wrong renewal saved.** Use **Set date** with the correct end date. The newest entry wins, and
the history keeps both for the record.

**"Wrong phone number or PIN" but it's correct.** Check they registered with that number
(search it in the admin list). If not found, they need to register.
