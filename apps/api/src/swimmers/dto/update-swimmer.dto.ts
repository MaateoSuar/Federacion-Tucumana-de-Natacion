import { PartialType } from '@nestjs/swagger';
import { CreateSwimmerDto } from './create-swimmer.dto';

export class UpdateSwimmerDto extends PartialType(CreateSwimmerDto) {}
