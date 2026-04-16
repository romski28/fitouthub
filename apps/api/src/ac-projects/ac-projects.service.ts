import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

type ActorContext = {
  actorId?: string;
  isProfessional: boolean;
  role: string;
};

@Injectable()
export class AcProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForActor(actor: ActorContext, linkedProjectId?: string) {
    this.ensureActor(actor);

    const linkedProjectFilter = linkedProjectId?.trim();

    // If professional is filtering by linkedProjectId, verify they own that project
    // and then return all plans linked to it (allowing cross-actor access).
    // Otherwise, use standard actor-based filtering.
    let whereClause: any = this.buildActorWhere(actor);

    if (linkedProjectFilter) {
      // For professionals querying by linkedProjectId, check ownership of the project
      if (actor.isProfessional) {
        const project = await (this.prisma as any).project.findFirst({
          where: {
            id: linkedProjectFilter,
            professionals: {
              some: {
                professionalId: actor.actorId,
              },
            },
          },
          select: { id: true },
        });

        // If professional doesn't own the project, forbid access
        if (!project) {
          throw new ForbiddenException(
            'You do not have access to this project',
          );
        }

        // Professional owns the project; query all plans linked to it (not filtered by actor)
        whereClause = { linkedProjectId: linkedProjectFilter };
      } else {
        // For clients, still apply actor filter
        whereClause = {
          ...this.buildActorWhere(actor),
          linkedProjectId: linkedProjectFilter,
        };
      }
    }

    const rows = await (this.prisma as any).acProject.findMany({
      where: whereClause,
      include: {
        rooms: {
          orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map((row: any) => this.serializeProject(row));
  }

  async getOne(id: string, actor: ActorContext) {
    this.ensureActor(actor);
    const row = await (this.prisma as any).acProject.findFirst({
      where: {
        id,
        ...this.buildActorWhere(actor),
      },
      include: {
        rooms: {
          orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
        },
      },
    });

    if (!row) {
      throw new NotFoundException('AC project not found');
    }

    return this.serializeProject(row);
  }

  async create(body: any, actor: ActorContext) {
    this.ensureActor(actor);
    const payload = this.normalizePayload(body);

    const created = await this.prisma.$transaction(async (tx) => {
      const project = await (tx as any).acProject.create({
        data: {
          title: payload.title,
          notes: payload.notes,
          calculationMethod: payload.calculationMethod,
          combineRooms: payload.combineRooms,
          totalBtu: payload.totalBtu,
          recommendedSystem: payload.recommendedSystem,
          compressorSuggestion: payload.compressorSuggestion,
          shoppingList: payload.shoppingList,
          linkedProjectId: payload.linkedProjectId,
          userId: actor.isProfessional ? null : actor.actorId,
          professionalId: actor.isProfessional ? actor.actorId : null,
        },
      });

      if (payload.rooms.length > 0) {
        await (tx as any).acRoom.createMany({
          data: payload.rooms.map((room) => ({
            acProjectId: project.id,
            ...room,
          })),
        });
      }

      return (tx as any).acProject.findUnique({
        where: { id: project.id },
        include: {
          rooms: { orderBy: [{ createdAt: 'asc' }, { name: 'asc' }] },
        },
      });
    });

    return this.serializeProject(created);
  }

  async update(id: string, body: any, actor: ActorContext) {
    this.ensureActor(actor);
    const existing = await (this.prisma as any).acProject.findFirst({
      where: {
        id,
        ...this.buildActorWhere(actor),
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('AC project not found');
    }

    const payload = this.normalizePayload(body);

    const updated = await this.prisma.$transaction(async (tx) => {
      await (tx as any).acRoom.deleteMany({ where: { acProjectId: id } });

      await (tx as any).acProject.update({
        where: { id },
        data: {
          title: payload.title,
          notes: payload.notes,
          calculationMethod: payload.calculationMethod,
          combineRooms: payload.combineRooms,
          totalBtu: payload.totalBtu,
          recommendedSystem: payload.recommendedSystem,
          compressorSuggestion: payload.compressorSuggestion,
          shoppingList: payload.shoppingList,
          linkedProjectId: payload.linkedProjectId,
        },
      });

      if (payload.rooms.length > 0) {
        await (tx as any).acRoom.createMany({
          data: payload.rooms.map((room) => ({
            acProjectId: id,
            ...room,
          })),
        });
      }

      return (tx as any).acProject.findUnique({
        where: { id },
        include: {
          rooms: { orderBy: [{ createdAt: 'asc' }, { name: 'asc' }] },
        },
      });
    });

    return this.serializeProject(updated);
  }

  async remove(id: string, actor: ActorContext) {
    this.ensureActor(actor);

    const existing = await (this.prisma as any).acProject.findFirst({
      where: {
        id,
        ...this.buildActorWhere(actor),
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('AC project not found');
    }

    await (this.prisma as any).acProject.delete({ where: { id } });
    return { success: true };
  }

  private ensureActor(actor: ActorContext) {
    if (!actor.actorId) {
      throw new ForbiddenException('Authenticated actor required');
    }
  }

  private buildActorWhere(actor: ActorContext) {
    return actor.isProfessional
      ? { professionalId: actor.actorId }
      : { userId: actor.actorId };
  }

  private normalizePayload(body: any) {
    const title = String(body?.title || '').trim();
    if (!title) {
      throw new BadRequestException('Title is required');
    }

    const rooms = Array.isArray(body?.rooms) ? body.rooms : [];
    if (rooms.length === 0) {
      throw new BadRequestException('At least one room is required');
    }

    return {
      title,
      notes: this.asNullableString(body?.notes),
      calculationMethod:
        body?.calculationMethod === 'volume' ? 'volume' : 'area',
      combineRooms: Boolean(body?.combineRooms),
      totalBtu: this.asNullableInt(body?.totalBtu),
      recommendedSystem: this.asNullableString(body?.recommendedSystem),
      compressorSuggestion: this.asNullableString(body?.compressorSuggestion),
      shoppingList: Array.isArray(body?.shoppingList) ? body.shoppingList : [],
      linkedProjectId: this.asNullableString(body?.linkedProjectId),
      rooms: rooms.map((room: any) => ({
        name: String(room?.name || 'Room').trim() || 'Room',
        lengthMeters: this.asDecimal(
          room?.lengthMeters,
          'Room length is required',
        ),
        widthMeters: this.asDecimal(
          room?.widthMeters,
          'Room width is required',
        ),
        heightMeters: this.asDecimal(
          room?.heightMeters,
          'Room height is required',
        ),
        heatProfile: ['cool', 'warm', 'hot'].includes(
          String(room?.heatProfile || '').toLowerCase(),
        )
          ? String(room.heatProfile).toLowerCase()
          : 'warm',
        occupants: Math.max(1, Number(room?.occupants) || 1),
        floor: this.asNullableInt(room?.floor),
        westFacing: Boolean(room?.westFacing),
        largeWindows: Boolean(room?.largeWindows),
        calculatedArea: this.asNullableDecimal(room?.calculatedArea),
        calculatedVolume: this.asNullableDecimal(room?.calculatedVolume),
        calculatedBtu: this.asNullableInt(room?.calculatedBtu),
        suggestedUnitSize: this.asNullableInt(room?.suggestedUnitSize),
        recommendedAcType: this.asNullableString(room?.recommendedAcType),
        notes: Array.isArray(room?.notes) ? room.notes : [],
      })),
    };
  }

  private asNullableString(value: unknown) {
    if (value == null) return null;
    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : null;
  }

  private asNullableInt(value: unknown) {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }

  private asDecimal(value: unknown, errorMessage: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException(errorMessage);
    }
    return parsed;
  }

  private asNullableDecimal(value: unknown) {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private serializeProject(row: any) {
    return {
      ...row,
      rooms: Array.isArray(row?.rooms)
        ? row.rooms.map((room: any) => ({
            ...room,
            lengthMeters: this.toNumber(room.lengthMeters),
            widthMeters: this.toNumber(room.widthMeters),
            heightMeters: this.toNumber(room.heightMeters),
            calculatedArea: this.toNumber(room.calculatedArea),
            calculatedVolume: this.toNumber(room.calculatedVolume),
          }))
        : [],
    };
  }

  private toNumber(value: any) {
    if (value == null) return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
}
