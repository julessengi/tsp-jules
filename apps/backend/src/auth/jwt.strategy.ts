import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      issuer: config.get<string>('JWT_ISSUER', 'tsp-jules'),
      audience: config.get<string>('JWT_AUDIENCE', 'tsp-jules-api'),
    });
  }

  async validate(payload: JwtPayload): Promise<{ id: string; email: string; name: string; role: UserRole }> {
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Invalid access token.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!user || !user.isActive || user.email !== payload.email || user.role !== payload.role) {
      throw new UnauthorizedException('User is unavailable or token claims are no longer valid.');
    }

    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}