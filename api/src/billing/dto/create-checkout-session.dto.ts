import { IsString, IsUUID } from 'class-validator';
import type { BillingSelectionId } from '@fashion-ais/types';

export class CreateCheckoutSessionDto {
  @IsString()
  selectionId!: BillingSelectionId;

  @IsUUID()
  operationId!: string;
}
