import { inflateSync } from 'node:zlib';
import { ConfigService } from '@nestjs/config';
import {
  AiProviderCancelledError,
  AiProviderPermanentError,
  AiProviderTransientError,
  type AiGenerationContext,
} from '../src/ai/ai-provider.interface';
import { MockAiProvider } from '../src/ai/mock-ai.provider';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function context(
  parameters: Record<string, unknown> = {},
  isCancellationRequested = jest.fn().mockResolvedValue(false),
): AiGenerationContext {
  return {
    generationId: '11111111-1111-4111-8111-111111111111',
    organizationId: '22222222-2222-4222-8222-222222222222',
    type: 'IMAGE_GENERATION',
    parameters,
    inputs: [],
    persistProviderJobId: jest.fn().mockResolvedValue(undefined),
    isCancellationRequested,
  };
}

function provider(delay = 0): MockAiProvider {
  const config = {
    get: jest.fn((key: string) => key === 'ai.mockDelayMs' ? delay : undefined),
  } as unknown as ConfigService;
  return new MockAiProvider(config);
}

describe('MockAiProvider', () => {
  it('returns a complete, renderable 256x256 PNG', async () => {
    const result = await provider().generate(context());
    const output = result.outputs[0];

    expect(output).toBeDefined();
    expect(output?.mimeType).toBe('image/png');
    expect(output?.fileName).toBe('mock-output.png');
    expect(output?.bytes.length).toBeGreaterThan(100);
    expect(Array.from(output?.bytes.slice(0, 8) ?? [])).toEqual(PNG_SIGNATURE);

    const chunks = parsePngChunks(output?.bytes ?? new Uint8Array());
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const ihdr = chunks[0]?.data;
    expect(ihdr).toBeDefined();
    expect(new DataView(ihdr.buffer, ihdr.byteOffset).getUint32(0)).toBe(256);
    expect(new DataView(ihdr.buffer, ihdr.byteOffset).getUint32(4)).toBe(256);

    const pixels = inflateSync(chunks[1].data);
    expect(pixels.length).toBe(256 * (1 + 256 * 3));
  });

  it.each([
    ['permanent-failure', AiProviderPermanentError],
    ['transient-failure', AiProviderTransientError],
  ] as const)('preserves %s behavior', async (mockBehavior, errorType) => {
    await expect(provider().generate(context({ mockBehavior }))).rejects.toBeInstanceOf(
      errorType,
    );
  });

  it('preserves cancellation checks before and after the configured delay', async () => {
    await expect(
      provider().generate(context({}, jest.fn().mockResolvedValue(true))),
    ).rejects.toBeInstanceOf(AiProviderCancelledError);

    const cancellation = jest.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await expect(provider(1).generate(context({}, cancellation))).rejects.toBeInstanceOf(
      AiProviderCancelledError,
    );
    expect(cancellation).toHaveBeenCalledTimes(2);
  });
});

function parsePngChunks(bytes: Uint8Array): Array<{ type: string; data: Uint8Array }> {
  const chunks: Array<{ type: string; data: Uint8Array }> = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = PNG_SIGNATURE.length;
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
    const dataStart = offset + 8;
    chunks.push({ type, data: bytes.slice(dataStart, dataStart + length) });
    offset = dataStart + length + 4;
  }
  return chunks;
}
