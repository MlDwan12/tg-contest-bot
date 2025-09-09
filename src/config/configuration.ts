import { registerAs } from '@nestjs/config';

const getEnv = (key: string, defaultValue: string = ''): string => {
  return process.env[key] || defaultValue;
};

const getNumberEnv = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
};

export default registerAs('app', () => ({
  environment: getEnv('NODE_ENV', 'development'),
  port: getNumberEnv('PORT', 3000),
  isProduction: getEnv('NODE_ENV') === 'production',
}));

export const databaseConfig = registerAs('database', () => ({
  host: getEnv('DATABASE_HOST', 'localhost'),
  port: getNumberEnv('DATABASE_PORT', 5432),
  username: getEnv('DATABASE_USER'),
  password: getEnv('DATABASE_PASSWORD'),
  name: getEnv('DATABASE_NAME'),
  synchronize: getEnv('NODE_ENV') !== 'production',
}));
