# Twilio Quick Setup Checklist

Use this checklist this afternoon when setting up Twilio for the notification system.

## 1. Create Twilio Account (5 mins)

1. Go to https://www.twilio.com/try-twilio
2. Sign up (free trial gives you ~US$15 credit)
3. Verify your email and phone number

## 2. Get Your Credentials (2 mins)

From Twilio Console Dashboard:
- Copy **Account SID** (starts with `AC...`)
- Copy **Auth Token** (click "Show" to reveal)

## 3. Get Phone Number for SMS (3 mins)

1. Go to Phone Numbers → Manage → Buy a number
2. Search for Hong Kong (+852) numbers
3. **Check "SMS" capability** box
4. Purchase number (~US$1-2/month)
5. Copy your phone number (format: `+85212345678`)

## 4. Enable WhatsApp Sandbox (Development) (2 mins)

1. Go to Messaging → Try it out → Send a WhatsApp message
2. You'll see a sandbox number (usually `+14155238886`)
3. **Join the sandbox**: Send the code shown (e.g., `join <word>`) to that WhatsApp number from your phone
4. Copy the sandbox number for dev testing

## 5. Add to .env File (1 min)

In `apps/api/.env`, add these lines:

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+85212345678
TWILIO_WHATSAPP_NUMBER=+14155238886
API_BASE_URL=https://fitouthub.onrender.com
```

## 6. Configure Webhooks (Render/Vercel Deployment) (3 mins)

Because your API is deployed on Render, Twilio webhook callbacks must target Render (not Vercel).

1. Go to Twilio Console → Phone Numbers → Your SMS number
2. Under "Messaging Configuration":
  - **Status Callback URL**: `https://fitouthub.onrender.com/notifications/webhook/twilio`
  - **HTTP Method**: POST
3. Save

For WhatsApp sandbox callbacks:
1. Go to Twilio Console → Messaging → Try it out → WhatsApp Sandbox Settings
2. Set **Status Callback URL** to:
  - `https://fitouthub.onrender.com/notifications/webhook/twilio`
3. Save

## 7. Optional Local Testing with ngrok

For local development, use ngrok to expose your local API:

```bash
# Install ngrok (if not already)
# Windows: choco install ngrok
# Or download from https://ngrok.com/download

# Start your API
cd apps/api
npm run start:dev

# In another terminal, expose port 4000
ngrok http 4000
```

Copy the ngrok URL (e.g., `https://abc123.ngrok.io`), then:

1. Update `.env`: `API_BASE_URL=https://abc123.ngrok.io`
2. Go to Twilio Console → Phone Numbers → Your SMS number
3. Under "Messaging Configuration":
   - **Status Callback URL**: `https://abc123.ngrok.io/notifications/webhook/twilio`
   - **HTTP Method**: POST
4. Save

## 8. Test Notification (2 mins)

```bash
# Start API
cd apps/api
npm run start:dev
```

In Twilio Console or via your app:
- Trigger a site access approval or quote award
- Check your WhatsApp for the message
- Check API logs for delivery status updates
- Check database: `NotificationLog` table for records

## 9. Deployment Notes (Your Current URLs)

- **Frontend (Vercel):** `https://fitouthub-web.vercel.app/`
- **API + Webhook target (Render):** `https://fitouthub.onrender.com`
- **Do not use Vercel URL for Twilio callback** unless webhook route is explicitly proxied there.

## 10. Production Setup (Later)

For production (when ready):
- Apply for WhatsApp Business API (takes 1-2 weeks)
- Update webhooks with production API URL
- Add spending alerts in Twilio Console (Billing → Alerts)
- Set budget limit to avoid surprises

## Quick Test Command (Optional)

If you want to test manually without triggering real events:

```typescript
// In projects.service.ts or via API endpoint
await this.notificationService.send({
  userId: 'test_user_id',
  phoneNumber: '+85298765432', // Your test number
  eventType: 'test',
  message: 'Test notification from Fitout Hub! 🎉',
});
```

## Troubleshooting

**Message not sending?**
- Check Twilio Console → Monitor → Logs → Errors
- Verify phone number includes country code (+852...)
- Check API logs for errors
- Ensure you joined WhatsApp sandbox

**Webhook not working?**
- If deployed: verify callback is exactly `https://fitouthub.onrender.com/notifications/webhook/twilio`
- If local: verify ngrok is running and URL is correct
- Check API logs for incoming webhook requests

**Local development notes:**
- ngrok URL changes each restart (free tier)
- Update `.env` and Twilio webhook URL when ngrok restarts
- For stable local testing, consider ngrok paid plan or use production URL

## Cost Tracking

After setup, monitor daily spend:
- Twilio Console → Billing → Current Balance
- Expected: ~HK$0.06 per WhatsApp, ~HK$0.05 per SMS
- Budget alert recommended: HK$100/week initially
