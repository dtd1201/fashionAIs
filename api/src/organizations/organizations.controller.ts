import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import type {
  AuthUser,
  OrganizationDetail,
  OrganizationMemberView,
  OrganizationSummary,
} from '@fashion-ais/types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChangeOrganizationMemberRoleDto } from './dto/change-member-role.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<OrganizationSummary[]> {
    return this.organizations.listForUser(user.id);
  }

  @Get(':organizationId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
  ): Promise<OrganizationDetail> {
    return this.organizations.getForUser(user.id, organizationId);
  }

  @Patch(':organizationId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<OrganizationDetail> {
    return this.organizations.update(user.id, organizationId, dto);
  }

  @Get(':organizationId/members')
  listMembers(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
  ): Promise<OrganizationMemberView[]> {
    return this.organizations.listMembers(user.id, organizationId);
  }

  @Patch(':organizationId/members/:memberId/role')
  changeMemberRole(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @Body() dto: ChangeOrganizationMemberRoleDto,
  ): Promise<OrganizationMemberView> {
    return this.organizations.changeMemberRole(
      user.id,
      organizationId,
      memberId,
      dto.role,
    );
  }

  @Delete(':organizationId/members/:memberId')
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
  ): Promise<{ removed: true }> {
    return this.organizations.removeMember(user.id, organizationId, memberId);
  }
}
