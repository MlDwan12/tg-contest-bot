import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    this.logger.debug(
      `Попытка доступа: ${request.method} ${request.url} | IP=${request.ip}`,
    );

    try {
      return (await super.canActivate(context)) as boolean;
    } catch (err) {
      this.logger.warn(`Access токен невалиден или истёк, пробуем refresh`);
      const refreshToken = request.cookies?.['refresh_token'];
      if (!refreshToken) throw new UnauthorizedException('Нет refresh токена');

      // Вызываем сервис для валидации refresh токена
      const user = await request.authService.validateRefreshToken(refreshToken);
      if (!user) throw new UnauthorizedException('Невалидный refresh токен');

      // Генерируем новый access token и кладём в куку
      const tokens = await request.authService.generateTokens(user);
      request.res.cookie('access_token', tokens.accessToken, {
        httpOnly: true,
      });
      request.res.cookie('refresh_token', tokens.refreshToken, {
        httpOnly: true,
      });

      request.user = user;
      return true;
    }
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException(info?.message);
    }
    return user;
  }
}
