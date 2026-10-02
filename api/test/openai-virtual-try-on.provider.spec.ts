import { OpenAiVirtualTryOnProvider } from '../src/ai/openai-virtual-try-on.provider';

const personBytes = new Uint8Array([1, 2, 3]);
const garmentBytes = new Uint8Array([4, 5, 6]);
const outputBytes = new Uint8Array([137, 80, 78, 71]);

function harness(outputCount = 1) {
  const values: Record<string, unknown> = {
    'ai.openai.apiKey': 'openai-test-key',
    'ai.openai.model': 'gpt-image-2.5-sunburst',
    'ai.openai.quality': 'high',
    'ai.openai.size': '1024x1536',
    'ai.openai.requestTimeoutMs': 1000,
  };
  const config = { getOrThrow: jest.fn((key: string) => values[key]) };
  const storage = {
    createPresignedDownload: jest.fn((_bucket: string, key: string) =>
      Promise.resolve({ downloadUrl: `https://storage.example/${key}` }),
    ),
  };
  const context = {
    generationId: 'generation-id',
    organizationId: 'organization-id',
    type: 'VIRTUAL_TRY_ON' as const,
    parameters: { prompt: 'editorial styling', num_images: outputCount },
    inputs: [
      { assetId: 'person', role: 'PERSON' as const, mimeType: 'image/jpeg', bucket: 'private', objectKey: 'person.jpg' },
      { assetId: 'garment', role: 'GARMENT' as const, mimeType: 'image/png', bucket: 'private', objectKey: 'garment.png' },
    ],
    persistProviderJobId: jest.fn().mockResolvedValue(undefined),
    isCancellationRequested: jest.fn().mockResolvedValue(false),
  };
  return {
    provider: new OpenAiVirtualTryOnProvider(config as never, storage as never),
    context,
  };
}

describe('OpenAiVirtualTryOnProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('maps person and garment images to the official multi-image edit request', async () => {
    const state = harness();
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(personBytes, { status: 200, headers: { 'content-type': 'image/jpeg' } }))
      .mockResolvedValueOnce(new Response(garmentBytes, { status: 200, headers: { 'content-type': 'image/png' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(outputBytes).toString('base64') }] }), { status: 200 }));

    await state.provider.generate(state.context);

    expect(fetchMock.mock.calls[2]?.[0]).toBe('https://api.openai.com/v1/images/edits');
    const init = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(init.headers).toEqual({ authorization: 'Bearer openai-test-key' });
    const form = init.body as FormData;
    expect(form.get('model')).toBe('gpt-image-2.5-sunburst');
    expect(form.get('quality')).toBe('high');
    expect(form.get('size')).toBe('1024x1536');
    expect(form.get('n')).toBe('1');
    expect(form.getAll('image[]')).toHaveLength(2);
    const prompt = form.get('prompt');
    expect(typeof prompt === 'string' ? prompt : '').toContain('first image');
    expect(typeof prompt === 'string' ? prompt : '').toContain(
      'Additional styling guidance',
    );
  });

  it('normalizes image bytes and respects num_images', async () => {
    const state = harness(2);
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(personBytes, { status: 200, headers: { 'content-type': 'image/jpeg' } }))
      .mockResolvedValueOnce(new Response(garmentBytes, { status: 200, headers: { 'content-type': 'image/png' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [
        { b64_json: Buffer.from(outputBytes).toString('base64') },
        { b64_json: Buffer.from(new Uint8Array([7, 8])).toString('base64') },
      ] }), { status: 200 }));

    const result = await state.provider.generate(state.context);

    expect(result.outputs).toHaveLength(2);
    expect(result.outputs[0]).toMatchObject({
      bytes: outputBytes,
      mimeType: 'image/png',
      fileName: 'openai-tryon-output-1.png',
    });
  });
});
