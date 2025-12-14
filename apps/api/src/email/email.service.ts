import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn('⚠️  RESEND_API_KEY not configured - email sending disabled');
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
    baseUrl: string;
  }): Promise<void> {
    if (!this.resend) {
      console.log('📧 [MOCK] Would send project invitation to:', params.to);
      return;
    }

    const acceptUrl = `${params.baseUrl}/api/projects/respond?token=${params.acceptToken}&action=accept`;
    const declineUrl = `${params.baseUrl}/api/projects/respond?token=${params.declineToken}&action=decline`;

    try {
      await this.resend.emails.send({
        from: 'Renovation Platform <onboarding@resend.dev>', // TODO: Replace with your verified domain
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
              <a href="${acceptUrl}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 0 10px; font-weight: 600;">
                ✅ Accept & View Details
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
    baseUrl: string;
  }): Promise<void> {
    if (!this.resend) {
      console.log('📧 [MOCK] Would send acceptance confirmation to:', params.to);
      return;
    }

    const projectUrl = `${params.baseUrl}/projects/${params.projectId}`;

    try {
      await this.resend.emails.send({
        from: 'Renovation Platform <onboarding@resend.dev>',
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

    const projectUrl = `${params.baseUrl}/projects?clientId=${params.to}`;

    try {
      await this.resend.emails.send({
        from: 'Renovation Platform <onboarding@resend.dev>',
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
                📊 View All Quotes
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
        from: 'Renovation Platform <onboarding@resend.dev>',
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
        from: 'Renovation Platform <onboarding@resend.dev>',
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
}
