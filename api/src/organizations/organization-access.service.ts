import { Injectable, NotFoundException } from '@nestjs/common';
import type { OrganizationRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface OrganizationMembership {
  id: string;
  userId: string;
  organizationId: string;
  role: OrganizationRole;
}

type MembershipClient = Pick<PrismaService, 'organizationMember'>;

@Injectable()
export class OrganizationAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireMembership(
    userId: string,
    organizationId: string,
    client: MembershipClient = this.prisma,
  ): Promise<OrganizationMembership> {
    const membership = await client.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { id: true, userId: true, organizationId: true, role: true },
    });
    if (!membership) {
      throw new NotFoundException({
        code: 'ORGANIZATION_NOT_FOUND',
        message: 'Organization not found',
      });
    }
    return membership;
  }
}
