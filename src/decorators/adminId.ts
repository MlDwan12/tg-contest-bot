import { createParamDecorator, ExecutionContext, Logger } from '@nestjs/common';

export const CurrentUserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const userId = request.user?.userId;

    const logger = new Logger('CurrentUserId');
    logger.log(`Получен userId из запроса: ${userId}`);

    return userId;
  },
);
