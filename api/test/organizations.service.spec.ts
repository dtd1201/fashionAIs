/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Prisma } from '@prisma/client';
import { OrganizationAccessService } from '../src/organizations/organization-access.service';
import { OrganizationsService } from '../src/organizations/organizations.service';

type Role = 'OWNER' | 'ADMIN' | 'MEMBER';

interface TestMember {
  id: string;
  userId: string;
  organizationId: string;
  role: Role;
  createdAt: Date;
  user: { email: string; displayName: string | null };
}

const organization = {
  id: 'organization-id',
  name: 'Studio',
  slug: 'studio',
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
};

const member = (id: string, role: Role): TestMember => ({
  id,
  userId: `${id}-user`,
  organizationId: organization.id,
  role,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  user: { email: `${id}@example.com`, displayName: id },
});

function createHarness(initialMembers: TestMember[]) {
  let members = initialMembers.map((value) => ({
    ...value,
    user: { ...value.user },
  }));
  let transactionQueue = Promise.resolve();
  const update = jest.fn(
    ({ where, data }: { where: { id: string }; data: { role: Role } }) => {
      const target = members.find((value) => value.id === where.id);
      if (!target) throw new Error('missing');
      target.role = data.role;
      return { ...target, user: { ...target.user } };
    },
  );
  const remove = jest.fn(({ where }: { where: { id: string } }) => {
    members = members.filter((value) => value.id !== where.id);
  });
  const organizationMember = {
    findUnique: jest.fn(
      ({
        where,
      }: {
        where: {
          userId_organizationId: { userId: string; organizationId: string };
        };
      }) => {
        const key = where.userId_organizationId;
        return (
          members.find(
            (value) =>
              value.userId === key.userId &&
              value.organizationId === key.organizationId,
          ) ?? null
        );
      },
    ),
    findFirst: jest.fn(
      ({ where }: { where: { id: string; organizationId: string } }) =>
        members.find(
          (value) =>
            value.id === where.id &&
            value.organizationId === where.organizationId,
        ) ?? null,
    ),
    findMany: jest.fn(
      ({ where }: { where: { userId?: string; organizationId?: string } }) => {
        if (where.userId) {
          return members
            .filter((value) => value.userId === where.userId)
            .map((value) => ({ role: value.role, organization }));
        }
        return members.filter(
          (value) => value.organizationId === where.organizationId,
        );
      },
    ),
    count: jest.fn(
      ({
        where,
      }: {
        where: { organizationId: string; role: Role; id: { not: string } };
      }) =>
        members.filter(
          (value) =>
            value.organizationId === where.organizationId &&
            value.role === where.role &&
            value.id !== where.id.not,
        ).length,
    ),
    update,
    delete: remove,
  };
  const transactionClient = { organizationMember };
  const prisma = {
    organizationMember,
    organization: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        where.id === organization.id ? organization : null,
      ),
      update: jest.fn(({ data }: { data: { name: string } }) => ({
        ...organization,
        name: data.name,
        updatedAt: new Date('2026-10-01T01:00:00.000Z'),
      })),
    },
    $transaction: jest.fn(
      <T>(
        callback: (client: typeof transactionClient) => Promise<T>,
        options: unknown,
      ): Promise<T> => {
        const run = transactionQueue.then(async () => {
          const snapshot = members.map((value) => ({
            ...value,
            user: { ...value.user },
          }));
          try {
            return await callback(transactionClient);
          } catch (error) {
            members = snapshot;
            throw error;
          }
        });
        transactionQueue = run.then(
          () => undefined,
          () => undefined,
        );
        void options;
        return run;
      },
    ),
  };
  const access = new OrganizationAccessService(prisma as never);
  const service = new OrganizationsService(prisma as never, access);
  return { service, prisma, update, remove, members: () => members };
}

function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  return expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({ code }),
  });
}

describe('OrganizationsService queries', () => {
  it('lists only the user memberships and returns the organization role', async () => {
    const owner = member('owner', 'OWNER');
    const outsider = {
      ...member('outsider', 'MEMBER'),
      organizationId: 'other-organization',
    };
    const { service } = createHarness([owner, outsider]);
    await expect(service.listForUser(owner.userId)).resolves.toEqual([
      expect.objectContaining({ id: organization.id, role: 'OWNER' }),
    ]);
  });

  it('allows a member to view details and hides the organization from outsiders', async () => {
    const viewer = member('viewer', 'MEMBER');
    const { service } = createHarness([viewer]);
    await expect(
      service.getForUser(viewer.userId, organization.id),
    ).resolves.toEqual(
      expect.objectContaining({ id: organization.id, role: 'MEMBER' }),
    );
    await expectCode(
      service.getForUser('outsider', organization.id),
      'ORGANIZATION_NOT_FOUND',
    );
  });

  it.each(['OWNER', 'ADMIN'] as const)(
    '%s can update the organization name',
    async (role) => {
      const actor = member('actor', role);
      const { service } = createHarness([actor]);
      await expect(
        service.update(actor.userId, organization.id, { name: 'New Studio' }),
      ).resolves.toEqual(expect.objectContaining({ name: 'New Studio', role }));
    },
  );

  it('rejects MEMBER updates and returns 404 for outsider updates', async () => {
    const actor = member('actor', 'MEMBER');
    const { service } = createHarness([actor]);
    await expectCode(
      service.update(actor.userId, organization.id, { name: 'No' }),
      'ORGANIZATION_ACCESS_DENIED',
    );
    await expectCode(
      service.update('outsider', organization.id, { name: 'No' }),
      'ORGANIZATION_NOT_FOUND',
    );
  });

  it.each(['OWNER', 'ADMIN', 'MEMBER'] as const)(
    '%s can list safe member fields',
    async (role) => {
      const actor = member('actor', role);
      const { service } = createHarness([actor, member('other', 'MEMBER')]);
      const result = await service.listMembers(actor.userId, organization.id);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ email: 'other@example.com' }),
        ]),
      );
      expect(result[0]).not.toHaveProperty('passwordHash');
    },
  );

  it('returns 404 when an outsider lists members', async () => {
    const { service } = createHarness([member('owner', 'OWNER')]);
    await expectCode(
      service.listMembers('outsider', organization.id),
      'ORGANIZATION_NOT_FOUND',
    );
  });
});

describe('OrganizationsService role management', () => {
  it.each([
    ['MEMBER', 'ADMIN'],
    ['MEMBER', 'OWNER'],
    ['ADMIN', 'MEMBER'],
  ] as const)('OWNER changes %s to %s', async (from, to) => {
    const actor = member('owner', 'OWNER');
    const target = member('target', from);
    const { service } = createHarness([actor, target]);
    await expect(
      service.changeMemberRole(actor.userId, organization.id, target.id, to),
    ).resolves.toEqual(expect.objectContaining({ role: to }));
  });

  it('OWNER can demote another OWNER when one remains', async () => {
    const actor = member('owner-one', 'OWNER');
    const target = member('owner-two', 'OWNER');
    const { service } = createHarness([actor, target]);
    await expect(
      service.changeMemberRole(
        actor.userId,
        organization.id,
        target.id,
        'MEMBER',
      ),
    ).resolves.toEqual(expect.objectContaining({ role: 'MEMBER' }));
  });

  it('prevents a sole OWNER from demoting themselves or being demoted', async () => {
    const owner = member('owner', 'OWNER');
    const admin = member('admin', 'ADMIN');
    const first = createHarness([owner]);
    await expectCode(
      first.service.changeMemberRole(
        owner.userId,
        organization.id,
        owner.id,
        'ADMIN',
      ),
      'ORGANIZATION_REQUIRES_OWNER',
    );
    const second = createHarness([owner, admin]);
    await expectCode(
      second.service.changeMemberRole(
        admin.userId,
        organization.id,
        owner.id,
        'MEMBER',
      ),
      'MEMBER_ROLE_CHANGE_FORBIDDEN',
    );
    expect(
      second.members().filter((value) => value.role === 'OWNER'),
    ).toHaveLength(1);
  });

  it.each([
    ['MEMBER', 'ADMIN'],
    ['ADMIN', 'MEMBER'],
  ] as const)('ADMIN changes another %s to %s', async (from, to) => {
    const actor = member('admin', 'ADMIN');
    const target = member('target', from);
    const { service } = createHarness([
      member('owner', 'OWNER'),
      actor,
      target,
    ]);
    await expect(
      service.changeMemberRole(actor.userId, organization.id, target.id, to),
    ).resolves.toEqual(expect.objectContaining({ role: to }));
  });

  it.each([
    ['target', 'MEMBER', 'OWNER'],
    ['owner', 'OWNER', 'MEMBER'],
    ['admin', 'ADMIN', 'MEMBER'],
  ] as const)(
    'ADMIN cannot perform forbidden role change on %s',
    async (targetId, targetRole, nextRole) => {
      const owner = member('owner', 'OWNER');
      const actor = member('admin', 'ADMIN');
      const target =
        targetId === 'admin'
          ? actor
          : targetId === 'owner'
            ? owner
            : member(targetId, targetRole);
      const { service } = createHarness([
        owner,
        actor,
        ...(target === owner || target === actor ? [] : [target]),
      ]);
      await expectCode(
        service.changeMemberRole(
          actor.userId,
          organization.id,
          target.id,
          nextRole,
        ),
        'MEMBER_ROLE_CHANGE_FORBIDDEN',
      );
    },
  );

  it('MEMBER cannot change roles', async () => {
    const actor = member('actor', 'MEMBER');
    const target = member('target', 'MEMBER');
    const { service } = createHarness([
      member('owner', 'OWNER'),
      actor,
      target,
    ]);
    await expectCode(
      service.changeMemberRole(
        actor.userId,
        organization.id,
        target.id,
        'ADMIN',
      ),
      'MEMBER_ROLE_CHANGE_FORBIDDEN',
    );
  });

  it('returns MEMBER_NOT_FOUND and treats an allowed no-op as success without updating', async () => {
    const actor = member('owner', 'OWNER');
    const target = member('target', 'MEMBER');
    const { service, update } = createHarness([actor, target]);
    await expectCode(
      service.changeMemberRole(
        actor.userId,
        organization.id,
        'missing',
        'MEMBER',
      ),
      'MEMBER_NOT_FOUND',
    );
    await expect(
      service.changeMemberRole(
        actor.userId,
        organization.id,
        target.id,
        'MEMBER',
      ),
    ).resolves.toEqual(expect.objectContaining({ role: 'MEMBER' }));
    expect(update).not.toHaveBeenCalled();
  });
});

describe('OrganizationsService member removal and owner safety', () => {
  it.each(['MEMBER', 'ADMIN'] as const)('OWNER removes %s', async (role) => {
    const actor = member('owner', 'OWNER');
    const target = member('target', role);
    const { service, members } = createHarness([actor, target]);
    await expect(
      service.removeMember(actor.userId, organization.id, target.id),
    ).resolves.toEqual({ removed: true });
    expect(members().some((value) => value.id === target.id)).toBe(false);
  });

  it('OWNER removes another OWNER only when another OWNER remains', async () => {
    const actor = member('owner-one', 'OWNER');
    const target = member('owner-two', 'OWNER');
    const { service, members } = createHarness([actor, target]);
    await service.removeMember(actor.userId, organization.id, target.id);
    expect(members().filter((value) => value.role === 'OWNER')).toHaveLength(1);
  });

  it('prevents removing the sole OWNER, including self-removal', async () => {
    const owner = member('owner', 'OWNER');
    const { service, remove } = createHarness([owner]);
    await expectCode(
      service.removeMember(owner.userId, organization.id, owner.id),
      'ORGANIZATION_REQUIRES_OWNER',
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it.each(['MEMBER', 'ADMIN'] as const)(
    'ADMIN removes another %s',
    async (role) => {
      const actor = member('admin', 'ADMIN');
      const target = member('target', role);
      const { service } = createHarness([
        member('owner', 'OWNER'),
        actor,
        target,
      ]);
      await expect(
        service.removeMember(actor.userId, organization.id, target.id),
      ).resolves.toEqual({ removed: true });
    },
  );

  it.each([
    ['owner', 'OWNER'],
    ['admin', 'ADMIN'],
  ] as const)('ADMIN cannot remove %s', async (targetId, role) => {
    const owner = member('owner', 'OWNER');
    const actor = member('admin', 'ADMIN');
    const target = targetId === 'owner' ? owner : actor;
    const { service } = createHarness([owner, actor]);
    expect(target.role).toBe(role);
    await expectCode(
      service.removeMember(actor.userId, organization.id, target.id),
      'MEMBER_REMOVAL_FORBIDDEN',
    );
  });

  it('MEMBER cannot remove members and missing members return MEMBER_NOT_FOUND', async () => {
    const actor = member('actor', 'MEMBER');
    const target = member('target', 'MEMBER');
    const { service } = createHarness([
      member('owner', 'OWNER'),
      actor,
      target,
    ]);
    await expectCode(
      service.removeMember(actor.userId, organization.id, target.id),
      'MEMBER_REMOVAL_FORBIDDEN',
    );
    await expectCode(
      service.removeMember(actor.userId, organization.id, 'missing'),
      'MEMBER_NOT_FOUND',
    );
  });

  it('rolls back a failed owner-sensitive transaction', async () => {
    const owner = member('owner', 'OWNER');
    const { service, members } = createHarness([owner]);
    await expectCode(
      service.changeMemberRole(
        owner.userId,
        organization.id,
        owner.id,
        'MEMBER',
      ),
      'ORGANIZATION_REQUIRES_OWNER',
    );
    expect(members().find((value) => value.id === owner.id)?.role).toBe(
      'OWNER',
    );
  });

  it('preserves an OWNER when concurrent operations target both of two owners', async () => {
    const first = member('owner-one', 'OWNER');
    const second = member('owner-two', 'OWNER');
    const { service, members, prisma } = createHarness([first, second]);
    const results = await Promise.allSettled([
      service.changeMemberRole(
        first.userId,
        organization.id,
        first.id,
        'MEMBER',
      ),
      service.removeMember(second.userId, organization.id, second.id),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(members().filter((value) => value.role === 'OWNER')).toHaveLength(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
  });
});
