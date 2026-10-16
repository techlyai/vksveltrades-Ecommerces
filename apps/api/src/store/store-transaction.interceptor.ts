import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor, ServiceUnavailableException } from '@nestjs/common';
import { catchError, defer, lastValueFrom, throwError } from 'rxjs';
import { StoreDatabase } from './store.database';

@Injectable()
export class StoreTransactionInterceptor implements NestInterceptor {
  constructor(private readonly database: StoreDatabase) {}
  intercept(_context: ExecutionContext, next: CallHandler) {
    _context.switchToHttp().getResponse().setHeader('Cache-Control', 'private, no-store');
    // Only catalog/business controllers use this; image uploads never hold DB locks.
    return defer(() => this.database.run(() => lastValueFrom(next.handle()))).pipe(
      catchError((error) => throwError(() => error instanceof HttpException ? error :
        new ServiceUnavailableException('Shop data is unavailable; please try again'))),
    );
  }
}
