import { Controller, Delete, Get, Headers, Param, Put, UnauthorizedException, Header } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { StoreDatabase } from './store.database';

// Customer accounts do not exist yet. This opaque capability belongs to a single
// browser, not an admin JWT. Only its hash is retained in PostgreSQL.
export function wishlistOwner(authorization?: string) {
  const match = /^Wishlist ([a-f0-9]{64})$/.exec(authorization || '');
  if (!match) throw new UnauthorizedException('A valid wishlist key is required');
  return createHash('sha256').update(match[1]).digest('hex');
}

@Controller('wishlist')
export class WishlistController {
  constructor(private readonly database: StoreDatabase) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  get(@Headers('authorization') authorization?: string) {
    return this.database.wishlist(wishlistOwner(authorization));
  }

  @Put(':id')
  add(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return this.database.changeWishlist(wishlistOwner(authorization), id, true);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return this.database.changeWishlist(wishlistOwner(authorization), id, false);
  }
}
