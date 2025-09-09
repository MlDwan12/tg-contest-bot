import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    console.log('РЕКВЕСТ====>', request);

    console.log('КУКИ====>', request.cookies);

    this.logger.debug(
      `Попытка доступа: ${request.method} ${request.url} | IP=${request.ip}`,
    );

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err) {
      this.logger.error(`Ошибка авторизации: ${err.message}`, err.stack);
    }
    if (!user) {
      this.logger.warn(`Попытка неавторизованного доступа: ${info?.message}`);
    } else {
      this.logger.log(
        `Авторизован пользователь id=${user.id}, role=${user.role}`,
      );
    }

    return super.handleRequest(err, user, info, context);
  }
}
