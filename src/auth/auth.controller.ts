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
    @Body() body: { userName: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    console.log('BODY====>', body);

    this.logger.log(`Попытка входа: ${body.userName}`);

    const user = await this.authService.validateUser(
      body.userName,
      body.password,
    );

    if (!user) {
      this.logger.warn(`Неуспешная авторизация: ${user}`);
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const { accessToken, refreshToken } = await this.authService.generateTokens(
      user!,
    );
    console.log('======>', accessToken, refreshToken);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: false,
      secure: true,
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 дней
      path: '/',
    });

    res.cookie('access_token', accessToken, {
      httpOnly: false,
      secure: true,
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 24, // 1 день
      path: '/',
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
