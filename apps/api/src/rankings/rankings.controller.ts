import { Controller, Get, Query } from '@nestjs/common';
import { RankingsService } from './rankings.service';
import { EventRankingQueryDto } from './dto/event-ranking-query.dto';
import { ClubRankingQueryDto } from './dto/club-ranking-query.dto';

@Controller('rankings')
export class RankingsController {
  constructor(private readonly service: RankingsService) {}

  @Get('event')
  getEventRanking(@Query() query: EventRankingQueryDto) {
    return this.service.queryEventRanking(query);
  }

  /** Marcas básicas (sets) que aplican al mismo filtro del ranking por prueba. */
  @Get('event/standards')
  getEventStandards(@Query() query: EventRankingQueryDto) {
    return this.service.queryEventStandards(query);
  }

  @Get('club')
  getClubRanking(@Query() query: ClubRankingQueryDto) {
    return this.service.queryClubRanking(query);
  }
}
