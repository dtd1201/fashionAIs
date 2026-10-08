import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { deflateSync } from 'node:zlib';
import {
  AiProviderCancelledError,
  AiProviderPermanentError,
  AiProviderTransientError,
  type AiGenerationContext,
  type AiGenerationResult,
  type AiProvider,
} from './ai-provider.interface';

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const MOCK_IMAGE_SIZE = 256;
const MOCK_PNG_BYTES = createMockPng();

@Injectable()
export class MockAiProvider implements AiProvider {
  readonly provider = 'MOCK' as const;
  constructor(private readonly config: ConfigService) {}

  supports(type: AiGenerationContext['type']): boolean {
    return ['IMAGE_GENERATION', 'VIRTUAL_TRY_ON', 'IMAGE_EDITING'].includes(type);
  }

  async generate(context: AiGenerationContext): Promise<AiGenerationResult> {
    if (await context.isCancellationRequested())
      throw new AiProviderCancelledError();
    const mockBehavior = (context.parameters as unknown as Record<string, unknown>).mockBehavior;
    if (mockBehavior === 'permanent-failure') {
      throw new AiProviderPermanentError('Mock permanent failure');
    }
    if (mockBehavior === 'transient-failure') {
      throw new AiProviderTransientError('Mock transient failure');
    }
    const delay = this.config.get<number>('ai.mockDelayMs') ?? 100;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    if (await context.isCancellationRequested())
      throw new AiProviderCancelledError();
    return {
      providerJobId: `mock-${context.generationId}`,
      outputs: [
        {
          bytes: MOCK_PNG_BYTES.slice(),
          mimeType: 'image/png',
          fileName: 'mock-output.png',
        },
      ],
    };
  }
}

function createMockPng(): Uint8Array {
  const stride = 1 + MOCK_IMAGE_SIZE * 3;
  const scanlines = new Uint8Array(stride * MOCK_IMAGE_SIZE);

  for (let y = 0; y < MOCK_IMAGE_SIZE; y += 1) {
    const rowOffset = y * stride;
    scanlines[rowOffset] = 0;
    for (let x = 0; x < MOCK_IMAGE_SIZE; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 3;
      const checker = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 === 0;
      const inCenter = x >= 64 && x < 192 && y >= 64 && y < 192;
      const color = inCenter
        ? [31, 41, 55]
        : checker
          ? [226, 232, 240]
          : [203, 213, 225];
      scanlines.set(color, pixelOffset);
    }
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, MOCK_IMAGE_SIZE);
  view.setUint32(4, MOCK_IMAGE_SIZE);
  ihdr.set([8, 2, 0, 0, 0], 8);

  return concatenate([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', new Uint8Array()),
  ]);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(concatenate([typeBytes, data])));
  return chunk;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((length, part) => length + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
