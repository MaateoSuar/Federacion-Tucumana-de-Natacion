import { Module } from '@nestjs/common';
import { FormatDetector } from './format-detector';
import { Normalizer } from './normalizer';

@Module({
  providers: [FormatDetector, Normalizer],
  exports: [FormatDetector, Normalizer],
})
export class IngestModule {}
