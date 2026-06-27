import { Global, Module } from '@nestjs/common';
import { ResultsGateway } from './results.gateway';

@Global()
@Module({
  providers: [ResultsGateway],
  exports: [ResultsGateway],
})
export class ResultsGatewayModule {}
