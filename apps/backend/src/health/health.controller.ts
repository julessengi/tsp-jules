import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  live(): { status: string; mode: string; timestamp: string } {
    return {
      status: 'ok',
      mode: 'SIMULATION',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready(): Promise<Record<string, unknown>> {
    try {
      await Promise.all([
        this.prisma.$queryRaw`SELECT 1`,
        this.redis.ping(),
      ]);
      return {
        status: 'ready',
        services: { api: 'ok', postgres: 'ok', redis: 'ok' },
        mode: 'SIMULATION',
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        services: { api: 'ok', postgres: 'unknown', redis: 'unknown' },
      });
    }
  }
}