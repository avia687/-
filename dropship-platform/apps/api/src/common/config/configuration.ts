export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  databaseUrl: string;
  redisUrl: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: number;
    refreshTtl: number;
  };
  encryptionKey: string;
  anthropic: {
    apiKey: string;
    model: string;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.API_PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '2592000', 10),
  },
  encryptionKey: process.env.ENCRYPTION_KEY ?? '0'.repeat(64),
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    // Default model id is application configuration for the Anthropic API call.
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8',
  },
});
