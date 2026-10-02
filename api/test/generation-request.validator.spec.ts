/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-type-assertion */
import { GenerationRequestValidator } from '../src/generations/generation-request.validator';

const userId = '22222222-2222-4222-8222-222222222222';
const organizationId = '11111111-1111-4111-8111-111111111111';
const personId = '33333333-3333-4333-8333-333333333333';
const garmentId = '44444444-4444-4444-8444-444444444444';

function harness() {
  const assets = [
    { id: personId, organizationId, status: 'READY', kind: 'IMAGE', mimeType: 'image/jpeg', bucket: 'private', objectKey: 'person', fileSize: 10 },
    { id: garmentId, organizationId, status: 'READY', kind: 'IMAGE', mimeType: 'image/png', bucket: 'private', objectKey: 'garment', fileSize: 20 },
  ];
  const prisma = { asset: { findMany: jest.fn(({ where }) => assets.filter((asset) => where.id.in.includes(asset.id) && asset.organizationId === where.organizationId)) } };
  const access = { requireMembership: jest.fn().mockResolvedValue({}) };
  const storage = { headObject: jest.fn((bucket, objectKey) => Promise.resolve({ exists: true, contentLength: objectKey === 'person' ? 10 : 20 })) };
  return { validator: new GenerationRequestValidator(prisma as never, access as never, storage as never), assets, access, storage };
}

const dto = (parameters: Record<string, unknown> = {}) => ({
  type: 'VIRTUAL_TRY_ON' as const,
  inputs: [{ assetId: personId, role: 'PERSON' as const }, { assetId: garmentId, role: 'GARMENT' as const }],
  parameters,
});

describe('GenerationRequestValidator virtual try-on', () => {
  it('accepts and normalizes the supported parameter subset', async () => {
    const state = harness();
    await expect(state.validator.validate(userId, organizationId, dto({ prompt: ' editorial ', resolution: '4k', generation_mode: 'quality', num_images: 4 }))).resolves.toMatchObject({
      parameters: { prompt: 'editorial', resolution: '4k', generation_mode: 'quality', num_images: 4 },
    });
    expect(state.storage.headObject).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ unknown: true }],
    [{ prompt: 'x'.repeat(501) }],
    [{ resolution: '8k' }],
    [{ generation_mode: 'turbo' }],
    [{ num_images: 0 }],
    [{ num_images: 5 }],
  ])('rejects invalid parameters %#', async (parameters) => {
    await expect(harness().validator.validate(userId, organizationId, dto(parameters))).rejects.toMatchObject({ response: expect.objectContaining({ code: 'GENERATION_INVALID_INPUT' }) });
  });

  it('rejects missing and duplicate role combinations with stable codes', async () => {
    const state = harness();
    await expect(state.validator.validate(userId, organizationId, { ...dto(), inputs: [{ assetId: garmentId, role: 'GARMENT' }] })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'VIRTUAL_TRY_ON_PERSON_REQUIRED' }) });
    await expect(state.validator.validate(userId, organizationId, { ...dto(), inputs: [{ assetId: personId, role: 'PERSON' }] })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'VIRTUAL_TRY_ON_GARMENT_REQUIRED' }) });
    await expect(state.validator.validate(userId, organizationId, { ...dto(), inputs: [{ assetId: personId, role: 'PERSON' }, { assetId: garmentId, role: 'PERSON' }, { assetId: garmentId, role: 'GARMENT' }] })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'VIRTUAL_TRY_ON_INVALID_INPUTS' }) });
  });

  it.each(['PENDING_UPLOAD', 'FAILED', 'DELETED'])('rejects %s assets', async (status) => {
    const state = harness(); state.assets[0]!.status = status;
    await expect(state.validator.validate(userId, organizationId, dto())).rejects.toMatchObject({ response: expect.objectContaining({ code: 'GENERATION_INPUT_ASSET_NOT_READY' }) });
  });

  it('rejects cross-organization, non-image, unsupported MIME, and missing storage objects', async () => {
    const cross = harness(); cross.assets[0]!.organizationId = 'other';
    await expect(cross.validator.validate(userId, organizationId, dto())).rejects.toMatchObject({ response: expect.objectContaining({ code: 'GENERATION_INVALID_INPUT' }) });
    const video = harness(); video.assets[0]!.kind = 'VIDEO';
    await expect(video.validator.validate(userId, organizationId, dto())).rejects.toMatchObject({ response: expect.objectContaining({ code: 'VIRTUAL_TRY_ON_INVALID_INPUTS' }) });
    const mime = harness(); mime.assets[0]!.mimeType = 'image/gif';
    await expect(mime.validator.validate(userId, organizationId, dto())).rejects.toMatchObject({ response: expect.objectContaining({ code: 'VIRTUAL_TRY_ON_INVALID_INPUTS' }) });
    const missing = harness(); missing.storage.headObject.mockResolvedValueOnce({ exists: false } as never);
    await expect(missing.validator.validate(userId, organizationId, dto())).rejects.toMatchObject({ response: expect.objectContaining({ code: 'GENERATION_INVALID_INPUT' }) });
  });
});
