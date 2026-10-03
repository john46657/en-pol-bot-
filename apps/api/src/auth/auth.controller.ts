import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { CurrentActor, CurrentUser, Public } from '../authz/decorators';
import { SESSION_COOKIE } from '../authz/guards';
import { zodBody } from '../common/zod.pipe';
import type { AppRequest, AuthUser } from '../common/request-context';
import type { Actor } from '../audit/audit.service';
import { loadEnv } from '../config/env';

const loginSchema = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(256) });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly env = loadEnv();
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : loadEnv().LOGIN_RATE_LIMIT, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body(zodBody(loginSchema)) body: z.infer<typeof loginSchema>, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(body.username, body.password, { ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.requestId });
    res.cookie(SESSION_COOKIE, r.token, { httpOnly: true, sameSite: 'strict', secure: this.env.COOKIE_SECURE ? this.env.COOKIE_SECURE === 'true' : this.env.NODE_ENV === 'production', expires: r.expiresAt, path: '/' });
    return r.user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser, @CurrentActor() actor: Actor, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(actor, user.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.profile(user.id);
  }
}
