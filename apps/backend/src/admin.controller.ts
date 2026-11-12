import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { CurrentUser, AuthenticatedUser } from './common/decorators/current-user.decorator';
import { Roles } from './common/decorators/roles.decorator';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { CreateUserDto } from './auth/dto/create-user.dto';
import { PrismaService } from './prisma/prisma.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('users')
  @Roles(UserRole.ADMIN)
  users(@Query('take') take?: string) {
    const parsed = Number(take ?? 50);
    const limit = Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 100) : 50;

    return this.prisma.user.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  async createUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateUserDto,
  ) {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            name: dto.name.trim(),
            passwordHash,
            role: dto.role ?? UserRole.VIEWER,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'admin.user.created',
            target: 'User',
            targetId: created.id,
            metadata: { role: created.role },
          },
        });

        return created;
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email already exists.');
      }
      throw error;
    }
  }

  @Get('audit')
  @Roles(UserRole.ADMIN)
  audit(@Query('take') take?: string) {
    const parsed = Number(take ?? 20);
    const limit = Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 100) : 20;

    return this.prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        actorId: true,
        action: true,
        target: true,
        targetId: true,
        metadata: true,
        ipAddress: true,
        createdAt: true,
      },
    });
  }
}
