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

      // Return HTML that stores JWT and redirects
      // Note: We escape JSON strings for safe embedding in JavaScript
      const professionalJson = JSON.stringify({
        id: professional.id,
        email: professional.email,
        fullName: professional.fullName,
        businessName: professional.businessName,
        professionType: professional.professionType,
        status: professional.status,
      }).replace(/'/g, "\\'");

      return `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Logging in...</title>
          </head>
          <body>
            <script>
              // Store JWT token with correct key for professional auth
              localStorage.setItem('professionalAccessToken', '${jwtToken}');
              localStorage.setItem('professional', '${professionalJson}');
              localStorage.setItem('isProfessional', 'true');
              
              // Redirect to professional projects list page
              window.location.href = '${webBaseUrl}/professional-projects';
            </script>
            <p>Logging you in and preparing your project... If this page doesn't redirect automatically, please <a href="${webBaseUrl}/">click here</a>.</p>
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
