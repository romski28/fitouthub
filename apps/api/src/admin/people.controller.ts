import { Controller, Get, Param, NotFoundException, UseGuards, InternalServerErrorException, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(AdminPeopleController.name);
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findAll() {
    try {
      return await this.queryPeople();
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      this.logger.error('admin/people query failed', message);
      throw new InternalServerErrorException(message);
    }
  }

  @Get(':personaId')
  async findOne(@Param('personaId') personaId: string) {
    try {
      return await this.queryPerson(personaId);
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      this.logger.error('admin/people detail failed', message);
      throw new InternalServerErrorException(message);
    }
  }

  private async queryPerson(personaId: string) {
    const persona = await this.prisma.persona.findUnique({
      where: { id: personaId },
      select: {
        id: true,
        identityId: true,
        type: true,
        userId: true,
        professionalId: true,
        createdAt: true,
      },
    });
    if (!persona) throw new NotFoundException('Person not found');

    // Fetch related records separately (tolerates orphans / missing columns)
    const [identity, user, professional] = await Promise.all([
      persona.identityId
        ? this.prisma.identity.findUnique({
            where: { id: persona.identityId },
            select: { email: true, emailVerified: true },
          })
        : Promise.resolve(null),
      persona.userId
        ? this.prisma.user.findUnique({
            where: { id: persona.userId },
            select: {
              id: true,
              email: true,
              firstName: true,
              surname: true,
              nickname: true,
              chineseName: true,
              role: true,
              mobile: true,
              createdAt: true,
              updatedAt: true,
            },
          })
        : Promise.resolve(null),
      persona.professionalId
        ? this.prisma.professional.findUnique({
            where: { id: persona.professionalId },
            select: {
              id: true,
              email: true,
              fullName: true,
              businessName: true,
              professionType: true,
              status: true,
              phone: true,
              rating: true,
              primaryTrade: true,
              tradesOffered: true,
              createdAt: true,
            },
          })
        : Promise.resolve(null),
    ]);

    return {
      personaId: persona.id,
      identityId: persona.identityId,
      type: persona.type,
      email: identity?.email ?? user?.email ?? professional?.email ?? null,
      emailVerified: identity?.emailVerified ?? false,
      createdAt: persona.createdAt,
      user,
      professional,
    };
  }

  private async queryPeople() {
    const personas = await this.prisma.persona.findMany({
      select: {
        id: true,
        identityId: true,
        type: true,
        userId: true,
        professionalId: true,
        createdAt: true,
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

    // Fetch emails separately (LEFT JOIN semantics) because the `identity`
    // relation is required in the schema and throws on orphaned personas whose
    // identityId no longer resolves to an Identity row.
    const identityIds = [...new Set(personas.map((p) => p.identityId))];
    const identities = await this.prisma.identity.findMany({
      where: { id: { in: identityIds } },
      select: { id: true, email: true },
    });
    const emailById = new Map(identities.map((i) => [i.id, i.email]));

    return personas.map((p) => {
      const name =
        p.professional?.fullName ||
        p.professional?.businessName ||
        [p.user?.firstName, p.user?.surname].filter(Boolean).join(' ') ||
        p.user?.nickname ||
        emailById.get(p.identityId) ||
        'Unknown';

      return {
        personaId: p.id,
        identityId: p.identityId,
        type: p.type,
        email: emailById.get(p.identityId) ?? null,
        name,
        role: p.user?.role ?? null,
        mobile: p.user?.mobile ?? p.professional?.phone ?? null,
        professionType: p.professional?.professionType ?? null,
        status: p.professional?.status ?? null,
        userId: p.userId,
        professionalId: p.professionalId,
        createdAt: p.createdAt,
      };
    });
  }
}
