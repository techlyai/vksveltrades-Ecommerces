import { Body, Controller, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { LoginDto } from '../store/dto';
import { AuthGuard, signAdmin } from './auth.guard';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Header('Cache-Control', 'no-store')
  async login(@Body() dto: LoginDto) {
    const { username, version } = await this.auth.login(dto?.username, dto?.password);
    return { accessToken: signAdmin(username, version), user: { name: username, role: 'admin' } };
  }

  @Post('password')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  changePassword(@Body() dto: { currentPassword?: unknown; newPassword?: unknown; confirmPassword?: unknown }) {
    return this.auth.changePassword(dto);
  }
}
