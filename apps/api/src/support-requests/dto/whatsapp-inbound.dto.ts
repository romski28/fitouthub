export class WhatsAppInboundDto {
  /** Sender's WhatsApp number, e.g. whatsapp:+447911123456 */
  From: string;
  /** Our Twilio WhatsApp number */
  To: string;
  /** Message text */
  Body: string;
  /** Twilio Message SID */
  MessageSid: string;
  /** WhatsApp display name of the sender */
  ProfileName?: string;
  /** Number of media attachments */
  NumMedia?: string;
}
