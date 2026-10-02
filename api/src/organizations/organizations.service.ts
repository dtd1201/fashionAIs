import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type OrganizationRole } from '@prisma/client';
import type {
  OrganizationDetail,
  OrganizationMemberView,
  OrganizationSummary,
} from '@fashion-ais/types';
import { PrismaService } from '../database/prisma.service';
import type { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationAccessService } from './organization-access.service';

const SERIALIZABLE_RETRIES = 3;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrganizationAccessService,
  ) {}

  async listForUser(userId: string): Promise<OrganizationSummary[]> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    return memberships.map(({ organization, role }) =>
      this.toOrganization(organization, role),
    );
  }

  async getForUser(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationDetail> {
    const membership = await this.access.requireMembership(
      userId,
      organizationId,
    );
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!organization) throw this.organizationNotFound();
    return this.toOrganization(organization, membership.role);
  }

  async update(
    userId: string,
    organizationId: string,
    dto: UpdateOrganizationDto,
  ): Promise<OrganizationDetail> {
    const membership = await this.access.requireMembership(
      userId,
      organizationId,
    );
    if (membership.role === 'MEMBER') throw this.organizationAccessDenied();
    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { name: dto.name },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return this.toOrganization(organization, membership.role);
  }

  async listMembers(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMemberView[]> {
    await this.access.requireMembership(userId, organizationId);
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        userId: true,
        role: true,
        createdAt: true,
        user: { select: { email: true, displayName: true } },
      },
    });
    return members.map((member) => this.toMember(member));
  }

  async changeMemberRole(
    actorUserId: string,
    organizationId: string,
    memberId: string,
    nextRole: OrganizationRole,
  ): Promise<OrganizationMemberView> {
    return this.serializable(async (transaction) => {
      const actor = await this.access.requireMembership(
        actorUserId,
        organizationId,
        transaction,
      );
      const target = await transaction.organizationMember.findFirst({
        where: { id: memberId, organizationId },
        select: {
          id: true,
          userId: true,
          role: true,
          createdAt: true,
          user: { select: { email: true, displayName: true } },
        },
      });
      if (!target) throw this.memberNotFound();

      this.assertRoleChangeAllowed(
        actor.role,
        actor.id === target.id,
        target.role,
        nextRole,
      );
      if (target.role === nextRole) return this.toMember(target);
      if (target.role === 'OWNER' && nextRole !== 'OWNER') {
        await this.requireAnotherOwner(transaction, organizationId, target.id);
      }

      const updated = await transaction.organizationMember.update({
        where: { id: target.id },
        data: { role: nextRole },
        select: {
          id: true,
          userId: true,
          role: true,
          createdAt: true,
          user: { select: { email: true, displayName: true } },
        },
      });
      return this.toMember(updated);
    });
  }

  async removeMember(
    actorUserId: string,
    organizationId: string,
    memberId: string,
  ): Promise<{ removed: true }> {
    return this.serializable(async (transaction) => {
      const actor = await this.access.requireMembership(
        actorUserId,
        organizationId,
        transaction,
      );
      const target = await transaction.organizationMember.findFirst({
        where: { id: memberId, organizationId },
        select: { id: true, role: true },
      });
      if (!target) throw this.memberNotFound();

      this.assertRemovalAllowed(
        actor.role,
        actor.id === target.id,
        target.role,
      );
      if (target.role === 'OWNER') {
        await this.requireAnotherOwner(transaction, organizationId, target.id);
      }
      await transaction.organizationMember.delete({ where: { id: target.id } });
      return { removed: true };
    });
  }

  private assertRoleChangeAllowed(
    actorRole: OrganizationRole,
    isSelf: boolean,
    targetRole: OrganizationRole,
    nextRole: OrganizationRole,
  ): void {
    if (actorRole === 'OWNER') return;
    if (
      actorRole === 'ADMIN' &&
      !isSelf &&
      targetRole !== 'OWNER' &&
      nextRole !== 'OWNER'
    ) {
      return;
    }
    throw new ForbiddenException({
      code: 'MEMBER_ROLE_CHANGE_FORBIDDEN',
      message: 'You cannot change this member role',
    });
  }

  private assertRemovalAllowed(
    actorRole: OrganizationRole,
    isSelf: boolean,
    targetRole: OrganizationRole,
  ): void {
    if (actorRole === 'OWNER') return;
    if (actorRole === 'ADMIN' && !isSelf && targetRole !== 'OWNER') return;
    throw new ForbiddenException({
      code: 'MEMBER_REMOVAL_FORBIDDEN',
      message: 'You cannot remove this member',
    });
  }

  private async requireAnotherOwner(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    excludedMemberId: string,
  ): Promise<void> {
    const remainingOwners = await transaction.organizationMember.count({
      where: { organizationId, role: 'OWNER', id: { not: excludedMemberId } },
    });
    if (remainingOwners === 0) {
      throw new ConflictException({
        code: 'ORGANIZATION_REQUIRES_OWNER',
        message: 'Organization must retain at least one owner',
      });
    }
  }

  private async serializable<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (this.isTransactionConflict(error) && attempt < SERIALIZABLE_RETRIES)
          continue;
        if (this.isTransactionConflict(error)) {
          throw new ConflictException({
            code: 'ORGANIZATION_CONCURRENT_MODIFICATION',
            message:
              'Organization membership changed concurrently; retry the request',
          });
        }
        throw error;
      }
    }
    throw new Error('Unreachable transaction state');
  }

  private isTransactionConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }

  private toOrganization(
    organization: {
      id: string;
      name: string;
      slug: string;
      createdAt: Date;
      updatedAt: Date;
    },
    role: OrganizationRole,
  ): OrganizationSummary {
    return {
      ...organization,
      role,
      createdAt: organization.createdAt.toISOString(),
      updatedAt: organization.updatedAt.toISOString(),
    };
  }

  private toMember(member: {
    id: string;
    userId: string;
    role: OrganizationRole;
    createdAt: Date;
    user: { email: string; displayName: string | null };
  }): OrganizationMemberView {
    return {
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      displayName: member.user.displayName,
      role: member.role,
      createdAt: member.createdAt.toISOString(),
    };
  }

  private organizationNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'ORGANIZATION_NOT_FOUND',
      message: 'Organization not found',
    });
  }

  private organizationAccessDenied(): ForbiddenException {
    return new ForbiddenException({
      code: 'ORGANIZATION_ACCESS_DENIED',
      message: 'Organization access denied',
    });
  }

  private memberNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'MEMBER_NOT_FOUND',
      message: 'Member not found',
    });
  }
}
