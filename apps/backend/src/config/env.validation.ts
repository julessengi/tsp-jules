type Environment = Record<string, unknown>;

export function validateEnvironment(config: Environment): Environment {
  const required = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'];
  for (const key of required) {
    if (typeof config[key] !== 'string' || !String(config[key]).trim()) {
      throw new Error('Missing required environment variable: ' + key);
    }
  }

  if (String(config.JWT_SECRET).length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters.');
  }

  const databaseUrl = new URL(String(config.DATABASE_URL));
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL.');
  }

  const redisUrl = new URL(String(config.REDIS_URL));
  if (!['redis:', 'rediss:'].includes(redisUrl.protocol)) {
    throw new Error('REDIS_URL must use redis:// or rediss://.');
  }

  const port = Number(config.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port.');
  }

  return {
    ...config,
    NODE_ENV: config.NODE_ENV ?? 'development',
    PORT: port,
    JWT_ACCESS_TTL: config.JWT_ACCESS_TTL ?? '15m',
    JWT_ISSUER: config.JWT_ISSUER ?? 'tsp-jules',
    JWT_AUDIENCE: config.JWT_AUDIENCE ?? 'tsp-jules-api',
    REFRESH_TOKEN_TTL_DAYS: Number(config.REFRESH_TOKEN_TTL_DAYS ?? 30),
    ALLOW_PUBLIC_REGISTRATION: config.ALLOW_PUBLIC_REGISTRATION ?? 'false',
    LOG_LEVEL: config.LOG_LEVEL ?? 'info',
  };
}