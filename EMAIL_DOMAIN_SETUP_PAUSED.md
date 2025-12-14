# Email Domain Setup - PAUSED

## Current Status
- Resend API key configured: `re_NMupWhjN_NrTkVVMNf7NwH3wDrf85i4xB`
- Currently limited to sandbox mode (can only send to verified email addresses)
- Need to verify custom domain to send to any email address

## To Resume Later (When ISP Responds)
1. **Create subdomain** at your DNS provider (e.g., `mail.yourdomain.com` or `notify.yourdomain.com`)
   - Use CNAME record option if required to create subdomain
   - Don't point to A record or webspace unless necessary

2. **Add domain in Resend**:
   - Go to [Resend Domains](https://resend.com/domains)
   - Add your subdomain
   - Resend will provide DNS records:
     - TXT record for SPF: `v=spf1 include:resend.dev ~all`
     - CNAME records for DKIM (usually 2-3 records)
     - CNAME for return-path/bounce tracking

3. **Add DNS records** at your DNS provider:
   - Add all records Resend provides
   - Wait for verification (can take 5 mins to 24 hours)

4. **Update email service** once verified:
   - Edit [apps/api/src/email/email.service.ts](apps/api/src/email/email.service.ts)
   - Replace all instances of:
     ```typescript
     from: 'Renovation Platform <onboarding@resend.dev>'
     ```
   - With:
     ```typescript
     from: 'Renovation Platform <hello@mail.yourdomain.com>'
     ```
   - Restart API server

5. **Test**:
   - Create project and share with professionals
   - Check that emails arrive in any inbox (not just verified addresses)
   - Verify SPF/DKIM pass in email headers

## Notes
- Current setup works but only for testing with your own email
- Once domain verified, can send to any professional's email address
- Free tier: 3,000 emails/month, 100/day limit
- Domain verification doesn't affect your main website or primary email
- Using subdomain is recommended to isolate email sending

## References
- Resend docs: https://resend.com/docs/dashboard/domains/introduction
- Current implementation: [PROJECT_NOTIFICATION_WORKFLOW.md](PROJECT_NOTIFICATION_WORKFLOW.md)
