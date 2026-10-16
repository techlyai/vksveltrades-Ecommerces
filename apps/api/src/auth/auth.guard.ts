import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AuthService } from './auth.service';

const secret = () => {
  if (!process.env.AUTH_SECRET) throw new ServiceUnavailableException('Admin authentication is not configured');
  return process.env.AUTH_SECRET;
};
export function signAdmin(username:string, version = '0') {
  const payload = Buffer.from(JSON.stringify({sub:username,role:'admin',version,exp:Date.now()+8*60*60*1000})).toString('base64url');
  const signature = createHmac('sha256',secret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const header = String(context.switchToHttp().getRequest().headers.authorization || '');
    const token = header.replace(/^Bearer\s+/i,''); const [payload, signature, extra] = token.split('.');
    if(!/^Bearer\s+/i.test(header) || !payload || !signature || extra !== undefined) throw new UnauthorizedException();
    const expected = createHmac('sha256',secret()).update(payload).digest('base64url');
    if(signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) throw new UnauthorizedException();
    let data: { sub?: unknown; version?: unknown; role?: unknown; exp?: unknown };
    try {
      data=JSON.parse(Buffer.from(payload,'base64url').toString());
      if(!data || typeof data.exp !== 'number' || !Number.isFinite(data.exp) || data.exp<=Date.now() || data.role!=='admin') throw 0;
    }
    catch { throw new UnauthorizedException(); }
    if (!await this.auth.sessionIsCurrent(data.sub, data.version ?? '0')) throw new UnauthorizedException('Your session has expired. Sign in again.');
    return true;
  }
}
