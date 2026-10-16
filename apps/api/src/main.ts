import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(origin => origin.trim()).filter(Boolean)
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];
  app.enableCors({ origin: allowedOrigins });
  await app.listen(Number(process.env.PORT) || 4000);
}

void bootstrap();
