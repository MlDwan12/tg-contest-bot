import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    const jwtSecret = configService.get<string>('JWT_ACCESS_SECRET');

    if (!jwtSecret) throw new Error('JWT_SECRET is not defined');

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req) => req?.cookies?.['access_token'],
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.sub,
      userName: payload.useName,
      role: payload.role,
    };
  }
}
