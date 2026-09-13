import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma.service';

/**
 * AdminPeopleController — single source of truth for finding every person on
 * the platform, regardless of persona. Built on the Persona + Identity layer,
 * because not every persona has a User row (e.g. professionals live only on
 * Professional + Identity). Each row carries the persona type and the linked
 * profile IDs so the admin UI can drill into the right CRUD surface.
 */
@Controller('admin/people')
@UseGuards(AuthGuard('jwt'))
export class AdminPeopleController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findAll() {
    const personas = await this.prisma.persona.findMany({
      include: {
        identity: { select: { email: true } },
        user: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            nickname: true,
            role: true,
            mobile: true,
            createdAt: true,
          },
        },
        professional: {
          select: {
            id: true,
            fullName: true,
            businessName: true,
            professionType: true,
            status: true,
            phone: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return personas.map((p) => {
      const name =
        p.professional?.fullName ||
        p.professional?.businessName ||
        [p.user?.firstName, p.user?.surname].filter(Boolean).join(' ') ||
        p.user?.nickname ||
        p.identity?.email ||
        'Unknown';

      return {
        personaId: p.id,
        identityId: p.identityId,
        type: p.type,
        email: p.identity?.email ?? null,
        name,
        role: p.user?.role ?? null,
        mobile: p.user?.mobile ?? p.professional?.phone ?? null,
        professionType: p.professional?.professionType ?? null,
        status: p.professional?.status ?? null,
        userId: p.userId,
        professionalId: p.professionalId,
        landlordId: p.landlordId,
        propertyManagerId: p.propertyManagerId,
        estateAgentId: p.estateAgentId,
        projectDelegateId: p.projectDelegateId,
        createdAt: p.createdAt,
      };
    });
  }
}
