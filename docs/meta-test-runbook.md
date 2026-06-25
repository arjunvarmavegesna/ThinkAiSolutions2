# Meta test-mode runbook (local, pre-approval)

Exercise the full direct-Meta flow — send template → delivery/read status → inbound reply →
inbox → wallet debit — against **Meta's TEST number**, using only credentials you have before
business verification + App Review:

- `META_APP_ID`, `META_APP_SECRET` (fresh Meta app)
- the test number's **temporary access token** (rotates ~24h), its `phone_number_id`, and the `waba_id`
- `META_WEBHOOK_VERIFY_TOKEN` (any random string you pick)

You do **not** need `META_SYSTEM_USER_TOKEN` or `META_CONFIG_ID` (those are live-only). The
server runs in `META_MODE=test`: Embedded Signup shows an "available after approval" state, and
you connect the test number by hand via the admin **manual connect** (provider = metaCloud).

---

## 1. Create the Meta app + test number
1. developers.facebook.com → **Create app** → type **Business** → add the **WhatsApp** product.
2. **App settings → Basic**: copy the **App ID** and **App Secret**.
3. **WhatsApp → API Setup**: note the **test phone number**, its **Phone number ID**, the
   **WhatsApp Business Account ID**, and the **temporary access token** (24h).
4. On the same page, under **To**, add **your own phone number** as a verified recipient
   (test numbers can only message verified recipients) and complete the OTP.

## 2. Configure the server (`server/.env`)
```
NODE_ENV=development
META_MODE=test
META_APP_ID=<app id>
META_APP_SECRET=<app secret>
META_TEST_ACCESS_TOKEN=<temporary access token>
META_WEBHOOK_VERIFY_TOKEN=<random string, e.g. `openssl rand -hex 16`>
# plus your existing FIREBASE_*, RAZORPAY_* (test keys), SECRETS_ENCRYPTION_KEY
# leave META_SYSTEM_USER_TOKEN and META_CONFIG_ID blank
```

## 3. Run + tunnel
```
npm run dev                 # shared + server (:8080) + client (:5173)
ngrok http 8080            # in another terminal -> https://<id>.ngrok-free.app
```

## 4. Register the webhook with Meta
In the Meta app → **WhatsApp → Configuration → Webhook → Edit**:
- **Callback URL:** `https://<id>.ngrok-free.app/api/webhooks/meta`
- **Verify token:** the exact `META_WEBHOOK_VERIFY_TOKEN` from your `.env`
- Click **Verify and save** (this hits our `GET /api/webhooks/meta` → echoes `hub.challenge`).
- **Subscribe** to the **`messages`** field.

## 5. Seed an admin, tenant, wallet, and connect the test number
1. `npm run bootstrap:admin` (or set `BOOTSTRAP_ADMIN_EMAIL`) → creates the reseller_admin.
2. Log in to the console (http://localhost:5173) as that admin.
3. **New tenant** → fill billing → create. (Self-serve signup also works, but for test the admin
   path is simplest.)
4. On the tenant page → **Pricing** → set per-category rates (so sends are billable).
5. **Wallet** → recharge using Razorpay **test** mode (or top up the balance) so there's a
   non-zero balance to debit.
6. Tenant page → **WhatsApp number** → the "Connect WhatsApp" button shows *available after
   approval* (expected in test mode). Open **Manual connect (metaCloud test number / legacy
   BSP)** → provider **Meta Cloud API (direct)** → enter the **display name**, the test number
   in **E.164**, the **WABA id**, and the **phone_number_id** (no apikey) → **Connect**. It
   health-checks the number with the temp token and marks the WABA connected.
7. (Optional) **Sync templates** to pull the test number's templates (e.g. `hello_world`).

## 6. Send + receive + bill
1. Inbox → **Send template** → pick `hello_world` (en_US) → recipient = **your verified number**.
2. Watch: the message appears outbound, status advances **sent → delivered → read** (status
   webhooks), and the **wallet balance drops** by the category rate (debit-before-send).
3. Reply from your phone → the inbound message hits `POST /api/webhooks/meta` (HMAC-verified with
   the App Secret), routes by `phone_number_id`, and lands in the **inbox** conversation; the 24h
   service window opens so you can free-text reply.

## Notes
- The temp token expires ~24h: refresh it on the API Setup page, update `META_TEST_ACCESS_TOKEN`,
  and restart the server (and re-run manual connect's health check is optional).
- When approved, flip `META_MODE=live` and set `META_SYSTEM_USER_TOKEN` + `META_CONFIG_ID`;
  Embedded Signup then activates and self-serve tenants can onboard their own numbers.
