import {
  Controller,
  Post,
  Body,
  Res,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ChannelController } from 'src/channel/channel.controller';
import { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  private readonly logger = new Logger(ChannelController.name);

  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    this.logger.log(`Попытка входа: ${body.email}`);

    const user = await this.authService.validateUser(body.email, body.password);

    if (!user) {
      this.logger.warn(`Неуспешная авторизация: ${user}`);
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const { accessToken, refreshToken } = await this.authService.generateTokens(
      user!,
    );
    console.log('======>', accessToken, refreshToken);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 дней
    });

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 24, // 1 день
    });

    this.logger.log(`Успешный вход: ${user.userName}`);

    return { message: 'Login successful' };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    this.logger.log('Пользователь вышел из системы');
    return { message: 'Logout successful' };
  }
}
