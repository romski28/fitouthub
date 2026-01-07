import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn(
        '⚠️  RESEND_API_KEY not configured - email sending disabled',
      );
      return;
    }
    this.resend = new Resend(apiKey);
  }

  /**
   * Send project invitation email to a professional
   * Includes accept/decline action buttons with secure tokens
   */
  async sendProjectInvitation(params: {
    to: string;
    professionalName: string;
    projectName: string;
    projectDescription: string;
    location: string;
    acceptToken: string;
    declineToken: string;
    authToken: string;
    projectId: string;
    baseUrl: string;
  }): Promise<void> {
    if (!this.resend) {
      console.log('📧 [MOCK] Would send project invitation to:', params.to);
      return;
    }

    const acceptUrl = `${params.baseUrl}/api/projects/respond?token=${params.acceptToken}&action=accept`;
    const declineUrl = `${params.baseUrl}/api/projects/respond?token=${params.declineToken}&action=decline`;
    const magicAuthUrl = `${params.baseUrl}/api/auth/magic-link?token=${params.authToken}`;

    try {
      await this.resend.emails.send({
        from: 'Fitout Hub <noreply@mail.romski.me.uk>',
        to: params.to,
        subject: `New Project Opportunity: ${params.projectName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4f46e5;">New Project Invitation</h2>
            
            <p>Hi ${params.professionalName},</p>
            
            <p>You've been invited to quote on a new renovation project:</p>
            
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #1f2937;">${params.projectName}</h3>
              <p style="color: #6b7280; margin: 10px 0;"><strong>Location:</strong> ${params.location}</p>
              <p style="color: #6b7280; margin: 10px 0;"><strong>Description:</strong></p>
              <p style="color: #374151;">${params.projectDescription}</p>
            </div>
            
            <p style="font-weight: 600; color: #dc2626;">⏰ Please respond within 2 hours to maintain your rating.</p>
            
            <div style="margin: 30px 0; text-align: center;">
              <a href="${magicAuthUrl}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 0 5px; font-weight: 600;">
                👁️ View Project & Quote
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; text-align: center;">or</p>
            
            <div style="margin: 20px 0; text-align: center;">
              <a href="${acceptUrl}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 0 10px; font-weight: 600;">
                ✅ Accept
              </a>
              <a href="${declineUrl}" style="display: inline-block; background-color: #6b7280; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 0 10px; font-weight: 600;">
                ❌ Decline
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #9ca3af; font-size: 12px;">
              This invitation is valid for 2 hours. If you accept, you'll have 24 hours to submit your quote.
            </p>
          </div>
        `,
      });

      console.log('✅ Project invitation sent to:', params.to);
    } catch (error) {
      console.error('❌ Failed to send project invitation:', error);
      throw error;
    }
  }

  /**
   * Send confirmation email when professional accepts a project
   */
  async sendProjectAccepted(params: {
    to: string;
    professionalName: string;
    projectName: string;
    projectId: string;
    professionalId: string;
    baseUrl: string;
  }): Promise<void> {
    if (!this.resend) {
      console.log(
        '📧 [MOCK] Would send acceptance confirmation to:',
        params.to,
      );
      return;
    }

    const projectUrl = `${params.baseUrl}/professional-projects/${params.projectId}?pro=${params.professionalId}`;

    try {
      await this.resend.emails.send({
        from: 'Fitout Hub <noreply@mail.romski.me.uk>',
        to: params.to,
        subject: `Project Accepted: ${params.projectName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #10b981;">✅ Project Accepted</h2>
            
            <p>Hi ${params.professionalName},</p>
            
            <p>You've successfully accepted the project: <strong>${params.projectName}</strong></p>
            
            <p>You now have <strong style="color: #dc2626;">24 hours</strong> to submit your quote.</p>
            
            <div style="margin: 30px 0; text-align: center;">
              <a href="${projectUrl}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                📝 View Project & Submit Quote
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #9ca3af; font-size: 12px;">
              Late submissions may affect your platform rating. Please submit your detailed quote before the deadline.
            </p>
          </div>
        `,
      });

      console.log('✅ Acceptance confirmation sent to:', params.to);
    } catch (error) {
      console.error('❌ Failed to send acceptance confirmation:', error);
      throw error;
    }
  }

  /**
   * Notify client when a professional submits a quote
   */
  async sendQuoteSubmitted(params: {
    to: string;
    clientName: string;
    professionalName: string;
    projectName: string;
    quoteAmount: number;
    projectId: string;
    baseUrl: string;
  }): Promise<void> {
    if (!this.resend) {
      console.log('📧 [MOCK] Would send quote notification to:', params.to);
      return;
    }

    const projectUrl = `${params.baseUrl}/projects/${params.projectId}`;

    try {
      await this.resend.emails.send({
        from: 'Fitout Hub <noreply@mail.romski.me.uk>',
        to: params.to,
        subject: `New Quote Received: ${params.projectName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4f46e5;">💰 New Quote Received</h2>
            
            <p>Hi ${params.clientName},</p>
            
            <p><strong>${params.professionalName}</strong> has submitted a quote for your project: <strong>${params.projectName}</strong></p>
            
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <p style="color: #6b7280; margin: 5px 0; font-size: 14px;">Quote Amount</p>
              <p style="color: #1f2937; font-size: 32px; font-weight: 700; margin: 10px 0;">
                HK$${params.quoteAmount.toLocaleString()}
              </p>
            </div>
            
            <div style="margin: 30px 0; text-align: center;">
              <a href="${projectUrl}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                📊 View Quote & Respond
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #9ca3af; font-size: 12px;">
              Review all submitted quotes and award the project to your preferred professional.
            </p>
          </div>
        `,
      });

      console.log('✅ Quote notification sent to:', params.to);
    } catch (error) {
      console.error('❌ Failed to send quote notification:', error);
      throw error;
    }
  }

  /**
   * Send reminder email for pending response (2hr deadline approaching)
   */
  async sendResponseReminder(params: {
    to: string;
    professionalName: string;
    projectName: string;
    acceptToken: string;
    declineToken: string;
    baseUrl: string;
    minutesRemaining: number;
  }): Promise<void> {
    if (!this.resend) {
      console.log('📧 [MOCK] Would send response reminder to:', params.to);
      return;
    }

    const acceptUrl = `${params.baseUrl}/api/projects/respond?token=${params.acceptToken}&action=accept`;
    const declineUrl = `${params.baseUrl}/api/projects/respond?token=${params.declineToken}&action=decline`;

    try {
      await this.resend.emails.send({
        from: 'Fitout Hub <noreply@mail.romski.me.uk>',
        to: params.to,
        subject: `⏰ Reminder: Project Response Due Soon - ${params.projectName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #dc2626;">⏰ Response Deadline Approaching</h2>
            
            <p>Hi ${params.professionalName},</p>
            
            <p>You have <strong style="color: #dc2626;">${params.minutesRemaining} minutes remaining</strong> to respond to the project invitation:</p>
            
            <p style="font-size: 18px; font-weight: 600; color: #1f2937; margin: 20px 0;">
              ${params.projectName}
            </p>
            
            <p style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; color: #991b1b; margin: 20px 0;">
              ⚠️ <strong>No response will negatively impact your platform rating</strong>
            </p>
            
            <div style="margin: 30px 0; text-align: center;">
              <a href="${acceptUrl}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 0 10px; font-weight: 600;">
                ✅ Accept Now
              </a>
              <a href="${declineUrl}" style="display: inline-block; background-color: #6b7280; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 0 10px; font-weight: 600;">
                ❌ Decline
              </a>
            </div>
          </div>
        `,
      });

      console.log('✅ Response reminder sent to:', params.to);
    } catch (error) {
      console.error('❌ Failed to send response reminder:', error);
      throw error;
    }
  }

  /**
   * Send reminder email for pending quote submission (24hr deadline approaching)
   */
  async sendQuoteReminder(params: {
    to: string;
    professionalName: string;
    projectName: string;
    projectId: string;
    baseUrl: string;
    hoursRemaining: number;
  }): Promise<void> {
    if (!this.resend) {
      console.log('📧 [MOCK] Would send quote reminder to:', params.to);
      return;
    }

    const projectUrl = `${params.baseUrl}/projects/${params.projectId}`;

    try {
      await this.resend.emails.send({
        from: 'Fitout Hub <noreply@mail.romski.me.uk>',
        to: params.to,
        subject: `⏰ Reminder: Quote Submission Due Soon - ${params.projectName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #dc2626;">⏰ Quote Deadline Approaching</h2>
            
            <p>Hi ${params.professionalName},</p>
            
            <p>You have <strong style="color: #dc2626;">${params.hoursRemaining} hours remaining</strong> to submit your quote for:</p>
            
            <p style="font-size: 18px; font-weight: 600; color: #1f2937; margin: 20px 0;">
              ${params.projectName}
            </p>
            
            <p style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; color: #991b1b; margin: 20px 0;">
              ⚠️ <strong>Late submissions may affect your platform rating</strong>
            </p>
            
            <div style="margin: 30px 0; text-align: center;">
              <a href="${projectUrl}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                📝 Submit Quote Now
              </a>
            </div>
          </div>
        `,
      });

      console.log('✅ Quote reminder sent to:', params.to);
    } catch (error) {
      console.error('❌ Failed to send quote reminder:', error);
      throw error;
    }
  }

  /**
   * Send notification to winning professional when quote is awarded
   */
  async sendWinnerNotification(params: {
    to: string;
    professionalName: string;
    projectName: string;
    quoteAmount: string;
    nextStepsMessage: string;
  }): Promise<void> {
    if (!this.resend) {
      console.log('📧 [MOCK] Would send winner notification to:', params.to);
      return;
    }

    try {
      await this.resend.emails.send({
        from: 'Fitout Hub <noreply@mail.romski.me.uk>',
        to: params.to,
        subject: `🎉 Congratulations: Your Quote Was Accepted - ${params.projectName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #10b981;">🎉 Congratulations!</h2>
            
            <p>Hi ${params.professionalName},</p>
            
            <p>Great news! Your quote has been <strong>accepted</strong> for the following project:</p>
            
            <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 6px;">
              <h3 style="margin-top: 0; color: #047857;">${params.projectName}</h3>
              <p style="color: #065f46; margin: 10px 0;"><strong>Quote Amount:</strong> ${params.quoteAmount}</p>
            </div>
            
            <p>${params.nextStepsMessage}</p>
            
            <div style="background-color: #f0f9ff; border: 1px solid #bfdbfe; padding: 15px; margin: 20px 0; border-radius: 6px;">
              <p style="color: #1e40af; margin: 0;"><strong>💡 Tip:</strong> Keep all communications on the platform for transparency, professional record-keeping, and to maintain the project management trail.</p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #9ca3af; font-size: 12px;">
              This is an important notification. Please keep this email for your records.
            </p>
          </div>
        `,
      });

      console.log('✅ Winner notification sent to:', params.to);
    } catch (error) {
      console.error('❌ Failed to send winner notification:', error);
      throw error;
    }
  }

  /**
   * Send notification to non-selected professionals thanking them
   */
  async sendLoserNotification(params: {
    to: string;
    professionalName: string;
    projectName: string;
    winnerName: string;
    thankYouMessage: string;
  }): Promise<void> {
    if (!this.resend) {
      console.log('📧 [MOCK] Would send loser notification to:', params.to);
      return;
    }

    try {
      await this.resend.emails.send({
        from: 'Fitout Hub <noreply@mail.romski.me.uk>',
        to: params.to,
        subject: `Project Update: "${params.projectName}" - Selection Made`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #6b7280;">Project Update</h2>
            
            <p>Hi ${params.professionalName},</p>
            
            <p>We wanted to keep you updated on the project you quoted on:</p>
            
            <div style="background-color: #f3f4f6; padding: 15px; margin: 20px 0; border-radius: 6px;">
              <h3 style="margin-top: 0; color: #374151;">"${params.projectName}"</h3>
            </div>
            
            <p>The client has selected <strong>${params.winnerName}</strong> to move forward with this project.</p>
            
            <p>${params.thankYouMessage}</p>
            
            <p>We encourage professionals to keep trying—every quote is an opportunity to build your reputation on Fitout Hub!</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #9ca3af; font-size: 12px;">
              Keep an eye on your dashboard for other project opportunities that match your expertise.
            </p>
          </div>
        `,
      });

      console.log('✅ Loser notification sent to:', params.to);
    } catch (error) {
      console.error('❌ Failed to send loser notification:', error);
      throw error;
    }
  }

  /**
   * Send notification when client shares contact details with professional
   */
  async sendContactShared(params: {
    to: string;
    professionalName: string;
    clientName: string;
    clientPhone: string;
    projectName: string;
  }): Promise<void> {
    if (!this.resend) {
      console.log(
        '📧 [MOCK] Would send contact sharing notification to:',
        params.to,
      );
      return;
    }

    try {
      await this.resend.emails.send({
        from: 'Fitout Hub <noreply@mail.romski.me.uk>',
        to: params.to,
        subject: `Contact Details Shared: ${params.projectName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4f46e5;">📞 Client Contact Shared</h2>
            
            <p>Hi ${params.professionalName},</p>
            
            <p>The client has chosen to share their contact details with you for the project: <strong>"${params.projectName}"</strong></p>
            
            <div style="background-color: #f0f9ff; border: 1px solid #bfdbfe; padding: 15px; margin: 20px 0; border-radius: 6px;">
              <h3 style="margin-top: 0; color: #1e40af;">Client Contact Information</h3>
              <p style="color: #1e3a8a; margin: 10px 0;"><strong>Name:</strong> ${params.clientName}</p>
              <p style="color: #1e3a8a; margin: 10px 0;"><strong>Phone:</strong> ${params.clientPhone}</p>
            </div>
            
            <p>You can now reach out directly to coordinate project details.</p>
            
            <div style="background-color: #fef3c7; border: 1px solid #fbbf24; padding: 15px; margin: 20px 0; border-radius: 6px;">
              <p style="color: #92400e; margin: 0;"><strong>⚠️ Privacy Notice:</strong> Please respect the client's privacy and use this information only for project-related communications. We recommend keeping all communications on the platform when possible for transparency and professional record-keeping.</p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #9ca3af; font-size: 12px;">
              This information is confidential. Do not share with third parties without the client's consent.
            </p>
          </div>
        `,
      });

      console.log('✅ Contact sharing notification sent to:', params.to);
    } catch (error) {
      console.error('❌ Failed to send contact sharing notification:', error);
      throw error;
    }
  }

  /**
   * Send notification when client requests a better offer
   */
  async sendCounterRequest(params: {
    to: string;
    professionalName: string;
    projectName: string;
    currentQuote: string;
  }): Promise<void> {
    if (!this.resend) {
      console.log(
        '📧 [MOCK] Would send counter-request notification to:',
        params.to,
      );
      return;
    }

    try {
      await this.resend.emails.send({
        from: 'Fitout Hub <noreply@mail.romski.me.uk>',
        to: params.to,
        subject: `💰 Client Requests Better Offer: ${params.projectName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #f59e0b;">💰 Better Offer Requested</h2>
            
            <p>Hi ${params.professionalName},</p>
            
            <p>The client has reviewed your quote for <strong>"${params.projectName}"</strong> and would like to see if you can provide a better offer.</p>
            
            <div style="background-color: #fef3c7; border: 1px solid #fbbf24; padding: 15px; margin: 20px 0; border-radius: 6px;">
              <p style="color: #92400e; margin: 0;"><strong>Your Current Quote:</strong> $${params.currentQuote}</p>
            </div>
            
            <p>This is an opportunity to adjust your quote and potentially win the project. Please:</p>
            <ul style="color: #374151;">
              <li>Review your pricing structure</li>
              <li>Consider any flexibility in your quote</li>
              <li>Submit an updated quote if possible</li>
            </ul>
            
            <div style="margin: 30px 0; text-align: center;">
              <a href="${process.env.WEB_BASE_URL || 'https://fitouthub-web.vercel.app'}/professional-projects" style="display: inline-block; background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                📝 Update Your Quote
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 13px; margin-top: 20px;">
              <strong>Note:</strong> You're not obligated to lower your quote. If your current pricing is fair, you can stand by it or provide additional context on why your quote represents good value.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #9ca3af; font-size: 12px;">
              This is an opportunity, not a requirement. Submit your best offer when you're ready.
            </p>
          </div>
        `,
      });

      console.log('✅ Counter-request notification sent to:', params.to);
    } catch (error) {
      console.error('❌ Failed to send counter-request notification:', error);
      throw error;
    }
  }

  /**
   * Notify FOH when a client requests assistance scoping a project
   */
  async sendAssistRequestNotification(params: {
    to: string;
    projectName: string;
    projectId: string;
    clientName: string;
    notes?: string;
    webBaseUrl: string;
  }): Promise<void> {
    if (!this.resend) {
      console.log(
        '📧 [MOCK] Would send assist request notification to:',
        params.to,
        params,
      );
      return;
    }

    const projectUrl = `${params.webBaseUrl.replace(/\/$/, '')}/projects/${params.projectId}`;
    const notesSection = params.notes
      ? `<p style="color: #374151; white-space: pre-wrap;">${params.notes}</p>`
      : '<p style="color: #9ca3af;">No additional notes provided.</p>';

    try {
      await this.resend.emails.send({
        from: 'Fitout Hub <noreply@mail.romski.me.uk>',
        to: params.to,
        subject: `🤝 Assist Requested: ${params.projectName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #111827; margin: 0 0 12px 0;">Client needs assistance scoping a project</h2>
            <p style="color: #374151; margin: 0 0 16px 0;">Client: <strong>${params.clientName}</strong></p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
              <p style="color: #6b7280; margin: 0 0 6px 0; font-size: 14px;">Project</p>
              <p style="color: #111827; margin: 0; font-weight: 600;">${params.projectName}</p>
            </div>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px;">
              <p style="color: #6b7280; margin: 0 0 6px 0; font-size: 14px;">Notes</p>
              ${notesSection}
            </div>
            <div style="margin: 24px 0 0 0; text-align: left;">
              <a href="${projectUrl}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-weight: 600;">View Project</a>
            </div>
          </div>
        `,
      });

      console.log('✅ Assist request notification sent to:', params.to);
    } catch (error) {
      console.error('❌ Failed to send assist request notification:', error);
      throw error;
    }
  }

  /**
   * Send notification that funds are secure and project can start
   */
  async sendFundsSecureNotification(params: {
    to: string;
    role: 'client' | 'professional';
    projectName: string;
    projectUrl: string;
  }): Promise<void> {
    if (!this.resend) {
      console.log('📧 [MOCK] Would send funds secure notification to:', params.to);
      return;
    }

    const subjectPrefix = params.role === 'professional' ? '✅ Escrow Confirmed' : '✅ Funds Secured';
    try {
      await this.resend.emails.send({
        from: 'Fitout Hub <noreply@mail.romski.me.uk>',
        to: params.to,
        subject: `${subjectPrefix}: ${params.projectName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #10b981;">✅ Funds Secured</h2>
            <p>Project funds are secure and the project can be started at any time.</p>
            <div style="margin: 24px 0; text-align: center;">
              <a href="${params.projectUrl}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
                View Project
              </a>
            </div>
            <p style="color: #6b7280; font-size: 12px;">This notification was sent by Fitout Hub.</p>
          </div>
        `,
      });

      console.log('✅ Funds secure notification sent to:', params.to);
    } catch (error) {
      console.error('❌ Failed to send funds secure notification:', error);
      throw error;
    }
  }

  /**
   * Send escrow notification to professional when project is awarded
   */
  async sendEscrowNotification(params: {
    to: string;
    professionalName: string;
    projectName: string;
    invoiceAmount: string;
    projectUrl: string;
  }): Promise<void> {
    if (!this.resend) {
      console.log('📧 [MOCK] Would send escrow notification to:', params.to);
      return;
    }

    try {
      await this.resend.emails.send({
        from: 'Fitout Hub <noreply@mail.romski.me.uk>',
        to: params.to,
        subject: `💰 Escrow Details: ${params.projectName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4f46e5;">💰 Payment & Escrow Information</h2>
            
            <p>Hi ${params.professionalName},</p>
            
            <p>Congratulations on winning the project! Here's how the payment process works:</p>
            
            <div style="background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 6px;">
              <h3 style="margin-top: 0; color: #1e40af;">Project: ${params.projectName}</h3>
              <p style="color: #1e3a8a; margin: 10px 0;"><strong>Invoice Amount:</strong> ${params.invoiceAmount}</p>
            </div>
            
            <div style="background-color: #fef3c7; border: 1px solid #fbbf24; padding: 15px; margin: 20px 0; border-radius: 6px;">
              <h4 style="color: #92400e; margin-top: 0;">💡 How Escrow Works</h4>
              <ol style="color: #78350f; margin: 10px 0; padding-left: 20px;">
                <li style="margin-bottom: 10px;">The client will pay the full invoice amount into Fitout Hub's escrow account</li>
                <li style="margin-bottom: 10px;">Your funds are securely held until project milestones are met</li>
                <li style="margin-bottom: 10px;">You can request advance payment for tools, materials, and upfront costs</li>
                <li>Final payment is released upon project completion and client approval</li>
              </ol>
            </div>
            
            <div style="background-color: #f0fdf4; border: 1px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 6px;">
              <h4 style="color: #065f46; margin-top: 0;">📋 Next Steps</h4>
              <p style="color: #047857; margin: 10px 0;">
                If you need advance payment for materials, tools, or other upfront costs before starting the project, 
                you can submit a request through the platform. You can request either:
              </p>
              <ul style="color: #047857; margin: 10px 0; padding-left: 20px;">
                <li><strong>Fixed Amount:</strong> Specify the dollar amount needed</li>
                <li><strong>Percentage:</strong> Request a percentage of the total invoice amount</li>
              </ul>
            </div>
            
            <div style="margin: 30px 0; text-align: center;">
              <a href="${params.projectUrl}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                📝 Submit Advance Payment Request
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #6b7280; font-size: 14px;">
              <strong>Important:</strong> Your funds are protected by Fitout Hub's escrow service. 
              Payment will only be released according to the agreed project milestones.
            </p>
          </div>
        `,
      });

      console.log('✅ Escrow notification sent to:', params.to);
    } catch (error) {
      console.error('❌ Failed to send escrow notification:', error);
      throw error;
    }
  }

  /**
   * Send notification to client when professional requests advance payment
   */
  async sendAdvancePaymentRequestNotification(params: {
    to: string;
    clientName: string;
    professionalName: string;
    projectName: string;
    requestType: string;
    requestAmount: string;
    requestPercentage?: number;
    invoiceAmount: string;
    projectUrl: string;
  }): Promise<void> {
    if (!this.resend) {
      console.log('📧 [MOCK] Would send advance payment request to:', params.to);
      return;
    }

    const requestDetails = params.requestType === 'percentage'
      ? `${params.requestPercentage}% of invoice (${params.requestAmount})`
      : params.requestAmount;

    try {
      await this.resend.emails.send({
        from: 'Fitout Hub <noreply@mail.romski.me.uk>',
        to: params.to,
        subject: `💰 Advance Payment Request: ${params.projectName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4f46e5;">💰 Advance Payment Request</h2>
            
            <p>Hi ${params.clientName},</p>
            
            <p>Your professional <strong>${params.professionalName}</strong> has requested advance payment for upfront costs on your project:</p>
            
            <div style="background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 6px;">
              <h3 style="margin-top: 0; color: #1e40af;">${params.projectName}</h3>
              <p style="color: #1e3a8a; margin: 10px 0;"><strong>Total Invoice:</strong> ${params.invoiceAmount}</p>
              <p style="color: #1e3a8a; margin: 10px 0;"><strong>Advance Requested:</strong> ${requestDetails}</p>
            </div>
            
            <div style="background-color: #fef3c7; border: 1px solid #fbbf24; padding: 15px; margin: 20px 0; border-radius: 6px;">
              <h4 style="color: #92400e; margin-top: 0;">ℹ️ What is Advance Payment?</h4>
              <p style="color: #78350f; margin: 10px 0;">
                Advance payment helps professionals cover upfront costs like materials, tools, or equipment 
                needed before starting your project. This is common practice in the construction industry.
              </p>
            </div>
            
            <div style="background-color: #f0fdf4; border: 1px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 6px;">
              <p style="color: #047857; margin: 0;">
                <strong>✓ Protected by Escrow:</strong> All funds are held securely by Fitout Hub until project milestones are met.
              </p>
            </div>
            
            <div style="margin: 30px 0; text-align: center;">
              <a href="${params.projectUrl}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                📋 Review Request
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #6b7280; font-size: 14px;">
              Fitout Hub will review this request and contact you to discuss the next steps.
            </p>
          </div>
        `,
      });

      console.log('✅ Advance payment request notification sent to:', params.to);
    } catch (error) {
      console.error('❌ Failed to send advance payment request notification:', error);
      throw error;
    }
  }

  /**
   * Notify professionals when a project is withdrawn from bidding
   */
  async sendProjectWithdrawnNotification(params: {
    to: string;
    professionalName: string;
    projectName: string;
  }): Promise<void> {
    if (!this.resend) {
      console.log('📧 [MOCK] Would send project withdrawn notice to:', params.to);
      return;
    }

    try {
      await this.resend.emails.send({
        from: 'Fitout Hub <noreply@mail.romski.me.uk>',
        to: params.to,
        subject: `Project Update: ${params.projectName} has been withdrawn`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #111827; margin: 0 0 12px 0;">Project withdrawn</h2>
            <p style="color: #374151;">Hi ${params.professionalName},</p>
            <p style="color: #374151; line-height: 1.5;">
              The client has withdrawn <strong>${params.projectName}</strong> from bidding for now. Thank you for your participation.
            </p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; margin: 18px 0;">
              <p style="color: #6b7280; margin: 0; font-size: 14px;">No action is required on your side. If the client reopens the project, we'll notify you.</p>
            </div>
            <p style="color: #6b7280; font-size: 12px;">This is an automated notification from Fitout Hub.</p>
          </div>
        `,
      });

      console.log('✅ Project withdrawn notice sent to:', params.to);
    } catch (error) {
      console.error('❌ Failed to send project withdrawn notice:', error);
      throw error;
    }
  }
}