import { NestFactory } from '@nestjs/core';
import { WorkersModule } from './workers.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkersModule);
  
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           MonJeu Workers - Tick Processor v0.2.0              ║
╠═══════════════════════════════════════════════════════════════╣
║  Tick interval: 30 seconds                                    ║
║                                                               ║
║  Active ticks:                                                ║
║    - Resource Production                                      ║
║    - Upkeep (food consumption)                                ║
║    - Construction completion                                  ║
║    - Recruitment completion                                   ║
║    - Army movement                                            ║
║    - Siege damage                                             ║
║    - Healing                                                  ║
║    - Resource node regeneration                               ║
║    - Expedition resolution                                    ║
║    - Bastion construction                                     ║
║    - Trade routes                                             ║
║                                                               ║
║  Workers started successfully!                                ║
╚═══════════════════════════════════════════════════════════════╝
  `);
}

bootstrap();
