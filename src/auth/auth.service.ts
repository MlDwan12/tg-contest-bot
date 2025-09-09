import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminService } from 'src/admin/admin.service';
import * as bcrypt from 'bcrypt';
import { Admin } from 'src/admin/entities/admin.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly _adminService: AdminService,
  ) {}

  async validateUser(userName: string, password: string) {
    this.logger.debug(`Попытка авторизации: ${userName}`);

    const user = await this._adminService.findOne({ userName });

    if (!user) {
      this.logger.warn(`Пользователь с userName=${userName} не найден`);
      return null;
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (isValid) {
      this.logger.log(`Успешная аутентификация: ${userName} (id=${user.id})`);
      return user;
    } else {
      this.logger.warn(`Неверный пароль для пользователя ${userName}`);
      return null;
    }
  }

  async generateTokens(user: Admin) {
    this.logger.debug(`Генерация токенов для user=${user}`);
    this.logger.debug(`Генерация токенов для userId=${user.id}`);

    const payload = { sub: user.id, userName: user.userName, role: 'admin' };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: '15m',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    this.logger.log(`Токены сгенерированы для userId=${user.id}`);

    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string) {
    this.logger.debug('Попытка обновления токенов');

    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      this.logger.debug(`Refresh-токен валиден. userId=${payload.sub}`);

      const user = await this._adminService.findOne({ id: payload.sub });
      if (!user) {
        this.logger.warn(`Пользователь с id=${payload.sub} не найден`);
        throw new UnauthorizedException();
      }

      this.logger.log(`Успешное обновление токенов для userId=${user.id}`);
      return this.generateTokens(user);
    } catch (e) {
      this.logger.error(`Ошибка при обновлении токенов: ${e.message}`);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
