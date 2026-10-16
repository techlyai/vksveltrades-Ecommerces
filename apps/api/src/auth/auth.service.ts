import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { StoreDatabase, type AdminCredential } from '../store/store.database';
import { hashPassword, matchesBootstrapPassword, verifyPassword } from './password';

@Injectable()
export class AuthService {
  constructor(private readonly database: StoreDatabase) {}

  get username() { return process.env.ADMIN_USERNAME || 'admin'; }

  private async matches(password: unknown, credential: AdminCredential | null) {
    if (typeof password !== 'string' || !password.length || password.length > 1024) return false;
    if (credential) return verifyPassword(password, credential.passwordHash);
    const bootstrap = process.env.ADMIN_PASSWORD;
    if (!bootstrap) throw new ServiceUnavailableException('Admin login is not configured');
    return matchesBootstrapPassword(password, bootstrap);
  }

  async login(username: unknown, password: unknown) {
    const credential = await this.database.adminCredential();
    if (typeof username !== 'string' || username.toUpperCase() !== this.username.toUpperCase() || !await this.matches(password, credential)) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return { username: this.username, version: credential?.version ?? '0' };
  }

  async sessionIsCurrent(username: unknown, version: unknown) {
    if (username !== this.username) return false;
    const credential = await this.database.adminCredential();
    return version === (credential?.version ?? '0');
  }

  async changePassword(dto: { currentPassword?: unknown; newPassword?: unknown; confirmPassword?: unknown } | null) {
    if (!dto || typeof dto.newPassword !== 'string' || dto.newPassword.length < 12 || dto.newPassword.length > 128 || !dto.newPassword.trim()) {
      throw new BadRequestException('Use a new password between 12 and 128 characters');
    }
    if (dto.newPassword !== dto.confirmPassword) throw new BadRequestException('New passwords do not match');
    const credential = await this.database.adminCredential();
    if (!await this.matches(dto.currentPassword, credential)) throw new BadRequestException('Current password is incorrect');
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException('Choose a different new password');
    const changed = await this.database.replaceAdminCredential(credential?.version ?? null, {
      passwordHash: await hashPassword(dto.newPassword), version: randomUUID(),
    });
    if (!changed) throw new ConflictException('The password has already changed. Sign in again with the latest password.');
    return { message: 'Password changed. Sign in with your new password.' };
  }
}
