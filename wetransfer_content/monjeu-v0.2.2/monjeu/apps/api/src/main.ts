import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Serve static files from public folder
  app.useStaticAssets(join(__dirname, '..', '..', '..', 'public'));
  
  // Enable CORS for frontend
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  
  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));
  
  // Global prefix for API routes
  app.setGlobalPrefix('api');
  
  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           MonJeu API Server - v0.2.0 COMPLETE                 ║
╠═══════════════════════════════════════════════════════════════╣
║  Web Interface: http://localhost:${port}                          ║
║  API Base:      http://localhost:${port}/api                      ║
║                                                               ║
║  SYSTEMES IMPLEMENTES:                                        ║
║    - Production/Consommation ressources                       ║
║    - Construction avec file d'attente                         ║
║    - Recrutement avec tiers et couts reels                    ║
║    - Combat (ratio 1.8, triangle tactique)                    ║
║    - Mouvement, Siege, Raid, Espionnage                       ║
║    - Heros (4 stats, XP, equipement)                          ║
║    - Alliance + Bastion                                       ║
║    - Marche (P2P, Serveur, Routes auto)                       ║
║    - Expeditions (PvE avec loot)                              ║
║                                                               ║
║  60 unites | 18 batiments | 6 factions                        ║
╚═══════════════════════════════════════════════════════════════╝
  `);
}

bootstrap();
