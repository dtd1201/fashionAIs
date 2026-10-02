import { IsIn } from 'class-validator';
import type { OrganizationRole } from '@fashion-ais/types';

const ORGANIZATION_ROLES: OrganizationRole[] = ['OWNER', 'ADMIN', 'MEMBER'];

export class ChangeOrganizationMemberRoleDto {
  @IsIn(ORGANIZATION_ROLES, { message: 'INVALID_ORGANIZATION_ROLE' })
  role!: OrganizationRole;
}
