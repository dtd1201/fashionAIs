import { Injectable } from '@nestjs/common';
import { calculateGenerationCreditCost, type CreateGenerationRequest } from '@fashion-ais/types';

@Injectable()
export class GenerationCostService {
  calculate(request: CreateGenerationRequest): number {
    return calculateGenerationCreditCost(request);
  }
}
