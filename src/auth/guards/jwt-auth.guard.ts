import { Injectable, Logger, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AuthService } from "../auth.service";
import { ModuleRef } from '@nestjs/core';


@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private authService: AuthService;

  constructor(private readonly moduleRef: ModuleRef) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    if (!this.authService) {
      this.authService = this.moduleRef.get(AuthService, { strict: false });
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    this.logger.debug(
      `Попытка доступа: ${request.method} ${request.url} | IP=${request.ip}`,
    );
    this.logger.warn(`[REQ] =======>  ${request.cookies}`);
    this.logger.warn(`[Access] =======>  ${request.cookies?.['access_token']}`);
    this.logger.warn(`[refresh_token] =======>  ${request.cookies?.['refresh_token']}`);
    try {
      // стандартная JWT-проверка
      return (await super.canActivate(context)) as boolean;
    } catch {
      this.logger.warn(`Access токен невалиден или истёк, пробуем refresh`);

      const refreshToken = request.cookies?.['refresh_token'];
      if (!refreshToken) throw new UnauthorizedException('Нет refresh токена');

      // обновляем токены
      const tokens = await this.authService.refreshTokens(refreshToken);
      if (!tokens) throw new UnauthorizedException('Невалидный refresh токен');

      // выставляем новые куки
      response.cookie('access_token', tokens.accessToken, {
        httpOnly: true,
        sameSite: 'strict',
        secure: false, // true если https
        maxAge: 1000 * 60 * 5,
      });
      response.cookie('refresh_token', tokens.refreshToken, {
        httpOnly: true,
        sameSite: 'strict',
        secure: false,
        maxAge: 1000 * 60 * 60 * 24 * 7,
      });

      // верифицируем новый access-токен и кладём пользователя в request
      const payload = await this.authService.verifyAccessToken(
        tokens.accessToken,
      );

      request.user = {
        userId: payload.sub,
        userName: payload.userName,
        role: payload.role,
      };

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
