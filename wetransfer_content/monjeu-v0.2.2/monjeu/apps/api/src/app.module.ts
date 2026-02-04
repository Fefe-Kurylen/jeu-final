import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

// Services
import { PrismaService } from './common/prisma/prisma.service';

// Controllers
import { AuthController } from './modules/auth/auth.controller';
import { PlayerController } from './modules/player/player.controller';
import { CityController } from './modules/city/city.controller';
import { ArmyController } from './modules/army/army.controller';
import { MapController } from './modules/map/map.controller';
import { ReportsController } from './modules/reports/reports.controller';
import { AllianceController } from './modules/alliance/alliance.controller';
import { BastionController } from './modules/bastion/bastion.controller';
import { MarketController } from './modules/market/market.controller';
import { ExpeditionController } from './modules/expedition/expedition.controller';
import { QuestController } from './modules/quests/quests.controller';
import { MessagesController } from './modules/messages/messages.controller';
import { InventoryController } from './modules/inventory/inventory.controller';

// Redis configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

@Module({
  imports: [
    BullModule.forRoot({
      redis: REDIS_URL,
    }),
    BullModule.registerQueue({
      name: 'game',
    }),
  ],
  controllers: [
    AuthController,
    PlayerController,
    CityController,
    ArmyController,
    MapController,
    ReportsController,
    AllianceController,
    BastionController,
    MarketController,
    ExpeditionController,
    QuestController,
    MessagesController,
    InventoryController,
  ],
  providers: [
    PrismaService,
  ],
})
export class AppModule {}

export default AppModule;
