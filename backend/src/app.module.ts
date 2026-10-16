import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { AdminController } from './store/admin.controller';
import { CatalogController } from './store/catalog.controller';
import { OrdersController } from './store/orders.controller';
import { StoreService } from './store/store.service';
import { HealthController } from './health.controller';
import { MediaController } from './store/media.controller';
import { UploadsController } from './store/uploads.controller';
import { StoreDatabase } from './store/store.database';
import { ImageStorage } from './store/image-storage.service';
import { StoreTransactionInterceptor } from './store/store-transaction.interceptor';
import { WishlistController } from './store/wishlist.controller';
import { PushController } from './store/push.controller';
import { OrderNotifications } from './store/order-notifications.service';

@Module({
  controllers: [HealthController, AuthController, CatalogController, OrdersController, AdminController, MediaController, UploadsController, WishlistController, PushController],
  providers: [StoreDatabase, ImageStorage, StoreService, StoreTransactionInterceptor, AuthService, AuthGuard, OrderNotifications],
})
export class AppModule {}
