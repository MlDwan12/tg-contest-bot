import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // База данных
  DATABASE_HOST: Joi.string().default('localhost'),
  DATABASE_PORT: Joi.number().default(5432),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().default(''),
  DATABASE_NAME: Joi.string().required(),

  // Приложение
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),

  // Дополнительные переменные (если нужны)
  // API_KEY: Joi.string().optional(),
  BOT_TOKEN: Joi.string().required(),
});
