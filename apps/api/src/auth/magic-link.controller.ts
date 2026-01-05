import { Controller, Get, Query, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ProjectsService } from '../projects/projects.service';

@Controller('auth')
export class MagicLinkController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly jwtService: JwtService,
  ) {}

  @Get('magic-link')
  async magicLink(@Query('token') token: string) {
    const webBaseUrl =
      process.env.WEB_BASE_URL ||
      process.env.FRONTEND_BASE_URL ||
      process.env.APP_WEB_URL ||
      'https://fitouthub-web.vercel.app';

    if (!token) {
      return this.renderErrorPage(
        'Invalid link',
        'No token provided.',
        webBaseUrl,
      );
    }

    try {
      const { professional, projectId, professionalId } =
        await this.projectsService.validateMagicAuthToken(token);

      // Auto-accept the project as part of the magic link flow
      // First, get the accept token to use for acceptance
      const emailToken = await this.projectsService.getAcceptTokenForMagicLink(
        token,
      );

      if (emailToken) {
        // Accept the project
        try {
          await this.projectsService.respondToInvitation(
            emailToken.token,
            'accept',
          );
        } catch (acceptErr) {
          console.warn('[MagicLinkController] Failed to auto-accept project:', {
            error: acceptErr?.message,
          });
          // Continue anyway - they can still accept manually
        }
      }

      // Generate JWT token for the professional
      const jwtToken = this.jwtService.sign(
        {
          id: professional.id,
          email: professional.email,
          isProfessional: true,
        },
        { expiresIn: '30d' },
      );

      // We cannot write to localStorage from the API domain; send data to the web app to persist.
      const professionalPayload = {
        id: professional.id,
        email: professional.email,
        fullName: professional.fullName,
        businessName: professional.businessName,
        professionType: professional.professionType,
        status: professional.status,
      };

      // Encode professional JSON for a safe query param
      const professionalB64 = Buffer.from(
        JSON.stringify(professionalPayload),
        'utf8',
      ).toString('base64url');

      const redirectUrl = `${webBaseUrl}/professional-magic?token=${jwtToken}&professional=${professionalB64}&projectId=${projectId || ''}`;

      // Simple HTML that immediately redirects to the web app bridge page
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta http-equiv="refresh" content="0;url=${redirectUrl}" />
            <script>window.location.href='${redirectUrl.replace(/'/g, "\\'")}'</script>
          </head>
          <body>
            <p>Redirecting to your project...</p>
            <p>If you are not redirected, <a href="${redirectUrl}">click here</a>.</p>
          </body>
        </html>
      `;
    } catch (error) {
      return this.renderErrorPage(
        'Link invalid or expired',
        error?.message || 'Failed to authenticate',
        webBaseUrl,
      );
    }
  }

  private renderErrorPage(
    title: string,
    message: string,
    webBaseUrl: string,
  ) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f3f4f6; }
            .card { background: white; border-radius: 12px; padding: 40px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            h1 { color: #6b7280; margin: 0 0 15px 0; }
            p { color: #6b7280; line-height: 1.6; }
            a { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; }
            a:hover { background: #4338ca; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>${title}</h1>
            <p>${message}</p>
            <a href="${webBaseUrl}/">Return to Dashboard</a>
          </div>
        </body>
      </html>
    `;
  }
}
