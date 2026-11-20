import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
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

  /** Tabla de marcas básicas de una pileta, por edad (para vistas sin categoría oficial). */
  @Get('standards')
  getStandardsTable(@Query('poolLength') poolLength?: string) {
    if (poolLength !== 'P25' && poolLength !== 'P50') {
      throw new BadRequestException('poolLength debe ser P25 o P50.');
    }
    return this.service.queryStandardsTable(poolLength);
  }

  @Get('club')
  getClubRanking(@Query() query: ClubRankingQueryDto) {
    return this.service.queryClubRanking(query);
  }
}
