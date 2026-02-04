import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentPlayer } from '../../common/auth/current-player.decorator';

@Controller('city')
@UseGuards(JwtAuthGuard)
export class CityController {
  constructor(private prisma: PrismaService) {}

  @Get(':id')
  async getCity(@CurrentPlayer() u:{playerId:string}, @Param('id') id: string) {
    const city = await this.prisma.city.findUnique({ where: { id }, include: { buildings:true, buildQueue:true, wounded:true } });
    if (!city || city.ownerId !== u.playerId) throw new Error('forbidden');
    return city;
  }

  @Post(':id/build/start')
  async buildStart(@CurrentPlayer() u:{playerId:string}, @Param('id') id: string, @Body() dto:{slot:number; buildingKey:string}) {
    const city = await this.prisma.city.findUnique({ where: { id }, include: { buildings:true } });
    if (!city || city.ownerId !== u.playerId) throw new Error('forbidden');

    const main = city.buildings.find(b=>b.key==='MAIN_BUILDING')?.level ?? 1;
    const existing = city.buildings.find(b=>b.key===dto.buildingKey)?.level ?? 0;
    if (existing + 1 > main) throw new Error('cannot exceed main building level');

    const running = await this.prisma.buildQueueItem.count({ where: { cityId:id, slot:dto.slot, status:'RUNNING' } });
    if (running>0) throw new Error('slot busy');

    const durationSec = 60 * (existing + 1); // alpha
    const endsAt = new Date(Date.now() + durationSec*1000);

    return this.prisma.buildQueueItem.create({
      data: { cityId:id, slot:dto.slot, buildingKey:dto.buildingKey, targetLevel: existing+1, startedAt:new Date(), endsAt },
    });
  }

  @Post(':id/recruit')
  async recruit(@CurrentPlayer() u:{playerId:string}, @Param('id') id: string, @Body() dto:{unitKey:string; count:number; buildingKey:string}) {
    const city = await this.prisma.city.findUnique({ where:{id} });
    if (!city || city.ownerId !== u.playerId) throw new Error('forbidden');

    const cost = { wood: 10*dto.count, stone: 5*dto.count, iron: 15*dto.count, food: 10*dto.count };
    if (city.wood < cost.wood || city.stone < cost.stone || city.iron < cost.iron || city.food < cost.food) throw new Error('not enough resources');

    const army = await this.prisma.army.findFirst({ where:{ ownerId:u.playerId, cityId:id } });
    if (!army) throw new Error('no army in city');

    await this.prisma.city.update({
      where:{id},
      data:{ wood: city.wood-cost.wood, stone: city.stone-cost.stone, iron: city.iron-cost.iron, food: city.food-cost.food },
    });

    await this.prisma.armyUnit.upsert({
      where:{ armyId_unitKey:{ armyId:army.id, unitKey:dto.unitKey } },
      update:{ count:{ increment: dto.count } },
      create:{ armyId:army.id, unitKey:dto.unitKey, tier:'base', count:dto.count },
    });

    return { ok:true };
  }
}
