import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { CurrentPlayer } from '../../common/auth/current-player.decorator';

@Controller('army')
@UseGuards(JwtAuthGuard)
export class ArmyController {
  constructor(private prisma: PrismaService) {}

  @Get('list')
  async list(@CurrentPlayer() u:{playerId:string}) {
    return this.prisma.army.findMany({ where:{ ownerId:u.playerId }, include:{ units:true } });
  }

  @Post('move')
  async move(@CurrentPlayer() u:{playerId:string}, @Body() dto:{armyId:string; x:number; y:number}) {
    return this.issueOrder(u.playerId, dto.armyId, 'MOVE', dto.x, dto.y, {});
  }

  @Post('attack')
  async attack(@CurrentPlayer() u:{playerId:string}, @Body() dto:{armyId:string; x:number; y:number}) {
    return this.issueOrder(u.playerId, dto.armyId, 'ATTACK', dto.x, dto.y, {});
  }

  @Post('raid')
  async raid(@CurrentPlayer() u:{playerId:string}, @Body() dto:{armyId:string; x:number; y:number}) {
    return this.issueOrder(u.playerId, dto.armyId, 'RAID', dto.x, dto.y, {});
  }

  @Post('spy')
  async spy(@CurrentPlayer() u:{playerId:string}, @Body() dto:{armyId:string; x:number; y:number; targetType:'CITY'|'RESOURCE'}) {
    return this.issueOrder(u.playerId, dto.armyId, 'SPY', dto.x, dto.y, { targetType: dto.targetType });
  }

  private async issueOrder(playerId:string, armyId:string, type:any, x:number, y:number, payload:any) {
    const army = await this.prisma.army.findUnique({ where:{ id:armyId } });
    if (!army || army.ownerId !== playerId) throw new Error('forbidden');
    if (army.status === 'MOVING' || army.status === 'SIEGING') throw new Error('army busy');

    const dx = Math.abs(army.x - x);
    const dy = Math.abs(army.y - y);
    const dist = dx + dy;
    const secondsPerTile = 50; // alpha
    const travelSec = Math.max(10, dist * secondsPerTile);

    const arrivalAt = new Date(Date.now() + travelSec*1000);

    return this.prisma.army.update({
      where:{ id:armyId },
      data:{ status:'MOVING', targetX:x, targetY:y, arrivalAt, orderType:type, orderPayload: payload }
    });
  }
}
