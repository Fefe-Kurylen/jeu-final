import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TickProcessor } from './workers/tick.processor.optimized';
import { PrismaService } from '../../api/src/common/prisma/prisma.service';

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
  providers: [
    PrismaService,
    TickProcessor,
  ],
})
export class WorkersModule {}
