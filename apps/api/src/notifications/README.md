# Notification System

This module provides WhatsApp, SMS, and WeChat notification capabilities for the renovation platform.

## Features

- **Multi-channel support**: WhatsApp (primary), SMS (fallback), WeChat, Email
- **Delivery tracking**: Real-time status updates via webhooks (sent, delivered, read)
- **User preferences**: Customizable notification channels per user
- **Automatic fallback**: Falls back to SMS if WhatsApp fails
- **Notification history**: Full audit trail of all notifications sent

## Architecture

```
NotificationService (abstraction)
  ├─ TwilioProvider (WhatsApp + SMS)
  └─ [Future: WeChatProvider]

Database Models:
  ├─ NotificationPreference (user channel preferences)
  └─ NotificationLog (delivery tracking & history)
```

## Setup

### 1. Create Twilio Account

1. Sign up at [Twilio.com](https://www.twilio.com/try-twilio)
2. Get your **Account SID** and **Auth Token** from the console
3. Purchase a phone number for SMS
4. Enable WhatsApp Sandbox (for development) or get WhatsApp Business API approval (for production)

### 2. Environment Variables

Add these to your `.env` file:

```bash
# Twilio Credentials
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+85212345678      # Your Twilio SMS phone number
TWILIO_WHATSAPP_NUMBER=+14155238886   # Twilio WhatsApp sandbox number (dev) or your approved number (prod)

# API Base URL (for webhooks)
API_BASE_URL=https://your-api-domain.com  # or http://localhost:4000 for dev
```

### 3. Run Database Migration

```bash
cd apps/api
npx prisma migrate deploy
# or for dev:
npx prisma migrate dev
```

### 4. Configure Webhook URL in Twilio

1. Go to Twilio Console → Phone Numbers → Manage → Active Numbers
2. Click your SMS phone number
3. Under "Messaging Configuration", set:
   - **Status Callback URL**: `https://your-api-domain.com/notifications/webhook/twilio`
   - **HTTP Method**: POST

4. For WhatsApp:
   - Go to Twilio Console → Messaging → Try it out → WhatsApp
   - Set **Status Callback URL**: `https://your-api-domain.com/notifications/webhook/twilio`

## Usage

### Sending Notifications

```typescript
import { NotificationService } from './notifications/notification.service';

// Inject in constructor
constructor(private notificationService: NotificationService) {}

// Send notification
await this.notificationService.send({
  userId: 'user_id_here',
  phoneNumber: '+85298765432',
  eventType: 'quote_awarded',
  message: 'Your quote has been awarded!',
  channel: NotificationChannel.WHATSAPP, // optional, uses user preference if not specified
});
```

### Managing User Preferences

```typescript
// Get or create default preferences
const prefs = await this.notificationService.getOrCreatePreferences(userId);

// Update preferences
await this.notificationService.updatePreferences(userId, {
  primaryChannel: NotificationChannel.WHATSAPP,
  fallbackChannel: NotificationChannel.SMS,
  enableWhatsApp: true,
  enableSMS: true,
});
```

### Viewing Notification History

```typescript
const history = await this.notificationService.getHistory(userId, 50);
```

## Development Mode

When Twilio credentials are not configured, the system operates in **development mode**:
- Notifications are logged to console instead of sent
- No actual messages are delivered
- Useful for testing without incurring costs

## Delivery Status Tracking

The system tracks message status through Twilio webhooks:

1. **pending**: Message queued
2. **sent**: Message sent from Twilio
3. **delivered**: Message delivered to recipient's device
4. **read**: Message read by recipient (WhatsApp only)
5. **failed**: Delivery failed
6. **undeliverable**: Number invalid or blocked

Status updates are automatically recorded in the `NotificationLog` table with timestamps.

## Cost Estimation

Based on Hong Kong usage (3000 messages/month):

| Channel | Provider | Cost per Message | Monthly Cost (3000 msgs) |
|---------|----------|------------------|--------------------------|
| SMS | Twilio | ~$0.0065 | ~$19.50 |
| WhatsApp | Twilio | ~$0.008 | ~$24.00 |

**Recommended**: WhatsApp primary with SMS fallback (~$24/month + minimal SMS for failures)

## Event Types

Current notification triggers:
- `site_access_approved`: Site access request approved
- `quote_awarded`: Quote awarded to professional
- `site_visit_scheduled`: Visit scheduled with professional
- [More to be added]

## Testing WhatsApp (Sandbox)

1. Go to Twilio Console → Messaging → Try it out → WhatsApp
2. Join the sandbox by sending the code to the WhatsApp number
3. Test sending messages using the sandbox number

## Production Checklist

- [ ] Twilio account verified and credits added
- [ ] WhatsApp Business API approved (or using sandbox for testing)
- [ ] Phone numbers purchased and configured
- [ ] Webhook URLs configured with HTTPS
- [ ] Environment variables set in production
- [ ] Database migrations applied
- [ ] User consent/opt-in collected for notifications
- [ ] Rate limiting configured (if needed)

## Troubleshooting

### Messages not sending
- Check Twilio credentials in `.env`
- Verify phone numbers include country code (e.g., +852...)
- Check Twilio account balance
- Review logs for error messages

### Webhook not updating status
- Ensure `API_BASE_URL` is set correctly
- Verify webhook URL is configured in Twilio console
- Check that webhook endpoint is publicly accessible (not localhost)
- Review notification logs in database

### User not receiving WhatsApp
- Verify user has joined WhatsApp sandbox (dev) or number is approved (prod)
- Check if user's mobile number is saved in database
- Verify notification preferences allow WhatsApp
- Check fallback to SMS occurred

## Future Enhancements

- [ ] WeChat Official Account integration
- [ ] Email notifications (already in EmailService, could integrate here)
- [ ] SMS templates for common messages
- [ ] Rate limiting per user
- [ ] Batch notification sending
- [ ] Notification scheduling
- [ ] Rich media support (images, buttons)
- [ ] A/B testing for message content
