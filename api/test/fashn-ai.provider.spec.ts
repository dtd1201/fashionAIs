/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-base-to-string */
import { FashnAiProvider } from '../src/ai/fashn-ai.provider';
import { AiProviderCancelledError, AiProviderPermanentError, AiProviderTransientError } from '../src/ai/ai-provider.interface';

const png = new Uint8Array([137, 80, 78, 71]);

function harness(existing?: string) {
  const values: Record<string, unknown> = {
    'ai.fashn.apiKey': 'test-secret-key',
    'ai.fashn.baseUrl': 'https://api.fashn.ai/v1',
    'ai.fashn.modelName': 'tryon-max',
    'ai.fashn.statusPollIntervalMs': 0,
    'ai.fashn.statusTimeoutMs': 1000,
    'ai.fashn.requestTimeoutMs': 1000,
    'ai.fashn.maxOutputBytes': 1024,
  };
  const config = { getOrThrow: jest.fn((key: string) => values[key]) };
  const storage = { createPresignedDownload: jest.fn((_bucket, key) => Promise.resolve({ downloadUrl: `https://signed.example/${key}?signature=secret` })) };
  const persistProviderJobId = jest.fn().mockResolvedValue(undefined);
  const context = {
    generationId: 'generation-id', organizationId: 'organization-id', type: 'VIRTUAL_TRY_ON' as const,
    parameters: { prompt: 'editorial', resolution: '2k', generation_mode: 'quality', num_images: 1 },
    inputs: [
      { assetId: 'person', role: 'PERSON' as const, mimeType: 'image/jpeg', bucket: 'private', objectKey: 'person.jpg' },
      { assetId: 'garment', role: 'GARMENT' as const, mimeType: 'image/png', bucket: 'private', objectKey: 'garment.png' },
    ],
    providerJobId: existing,
    persistProviderJobId,
    isCancellationRequested: jest.fn().mockResolvedValue(false),
  };
  return { provider: new FashnAiProvider(config as never, storage as never), context, storage, persistProviderJobId, values };
}

describe('FashnAiProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('maps PERSON/GARMENT signed URLs, authenticates, persists ID, polls, and downloads output', async () => {
    const state = harness();
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'prediction-1' }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'prediction-1', status: 'completed', output: ['https://cdn.fashn.ai/output.png'] }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(png, { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(png.byteLength) } }));
    const result = await state.provider.generate(state.context);
    const run = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((run[1] as RequestInit).body));
    expect(run[0]).toBe('https://api.fashn.ai/v1/run');
    expect((run[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test-secret-key' });
    expect(body).toMatchObject({ model_name: 'tryon-max', inputs: { model_image: expect.stringContaining('/person.jpg'), product_image: expect.stringContaining('/garment.png'), prompt: 'editorial' } });
    expect(state.persistProviderJobId).toHaveBeenCalledWith('prediction-1');
    expect(result.outputs[0]).toMatchObject({ mimeType: 'image/png', fileName: 'fashn-tryon-output-1.png' });
  });

  it('resumes an existing prediction without posting or regenerating signed URLs', async () => {
    const state = harness('prediction-existing');
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'completed', output: ['https://cdn.fashn.ai/output.jpg'] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    await state.provider.generate(state.context);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/status/prediction-existing');
    expect(state.storage.createPresignedDownload).not.toHaveBeenCalled();
    expect(state.persistProviderJobId).not.toHaveBeenCalled();
  });

  it('polls starting, in_queue, and processing before returning ordered outputs', async () => {
    const state = harness('prediction-existing');
    const fetchMock = jest.spyOn(global, 'fetch');
    for (const status of ['starting', 'in_queue', 'processing']) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status }), { status: 200 }));
    }
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'completed', output: ['https://cdn.fashn.ai/1.png', 'https://cdn.fashn.ai/2.jpg'] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    const result = await state.provider.generate(state.context);
    expect(result.outputs.map((output) => output.fileName)).toEqual(['fashn-tryon-output-1.png', 'fashn-tryon-output-2.jpg']);
  });

  it('checks cancellation between polls and normalizes polling timeout', async () => {
    const cancelled = harness('prediction');
    cancelled.context.isCancellationRequested.mockResolvedValue(true);
    await expect(cancelled.provider.generate(cancelled.context)).rejects.toBeInstanceOf(AiProviderCancelledError);

    const timedOut = harness('prediction');
    timedOut.values['ai.fashn.statusTimeoutMs'] = -1;
    await expect(timedOut.provider.generate(timedOut.context)).rejects.toMatchObject({ code: 'AI_PROVIDER_TIMEOUT' });
  });

  it.each([[401, AiProviderPermanentError, 'AI_PROVIDER_AUTHENTICATION_FAILED'], [429, AiProviderTransientError, 'AI_PROVIDER_RATE_LIMITED'], [503, AiProviderTransientError, 'AI_PROVIDER_UNAVAILABLE']] as const)(
    'normalizes HTTP %s', async (status, errorType, code) => {
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status }));
      const promise = harness().provider.generate(harness().context);
      await expect(promise).rejects.toBeInstanceOf(errorType);
      await expect(promise).rejects.toMatchObject({ code });
    },
  );

  it('rejects dangerous output URLs, invalid MIME types, and oversized output', async () => {
    const cases = [
      ['http://cdn.fashn.ai/x.png', undefined, undefined],
      ['https://127.0.0.1/x.png', undefined, undefined],
      ['https://cdn.fashn.ai/x.png', 'text/html', new Uint8Array([1])],
      ['https://cdn.fashn.ai/x.png', 'image/png', new Uint8Array(1025)],
    ] as const;
    for (const [url, contentType, bytes] of cases) {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ status: 'completed', output: [url] }), { status: 200 }));
      if (contentType) fetchMock.mockResolvedValueOnce(new Response(bytes, { status: 200, headers: { 'content-type': contentType } }));
      await expect(harness('prediction').provider.generate(harness('prediction').context)).rejects.toMatchObject({ code: 'AI_PROVIDER_INVALID_RESPONSE' });
      fetchMock.mockRestore();
    }
  });
});
