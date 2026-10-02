import { GeminiVirtualTryOnProvider } from '../src/ai/gemini-virtual-try-on.provider';

const personBytes = new Uint8Array([1, 2, 3]);
const garmentBytes = new Uint8Array([4, 5, 6]);
const imageData = Buffer.from(new Uint8Array([137, 80, 78, 71])).toString('base64');

function harness(outputCount = 1) {
  const values: Record<string, unknown> = {
    'ai.gemini.apiKey': 'gemini-test-key',
    'ai.gemini.model': 'gemini-3.1-flash-image',
    'ai.gemini.requestTimeoutMs': 1000,
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
    parameters: { prompt: 'studio lighting', num_images: outputCount },
    inputs: [
      { assetId: 'person', role: 'PERSON' as const, mimeType: 'image/jpeg', bucket: 'private', objectKey: 'person.jpg' },
      { assetId: 'garment', role: 'GARMENT' as const, mimeType: 'image/png', bucket: 'private', objectKey: 'garment.png' },
    ],
    persistProviderJobId: jest.fn().mockResolvedValue(undefined),
    isCancellationRequested: jest.fn().mockResolvedValue(false),
  };
  return {
    provider: new GeminiVirtualTryOnProvider(config as never, storage as never),
    context,
  };
}

function geminiResponse(): Response {
  return new Response(JSON.stringify({
    candidates: [{
      content: {
        parts: [
          { text: 'Generated the requested fashion image.' },
          { inlineData: { mimeType: 'image/png', data: imageData } },
        ],
      },
    }],
  }), { status: 200 });
}

describe('GeminiVirtualTryOnProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('maps person and garment as multimodal image inputs and extracts image parts', async () => {
    const state = harness();
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(personBytes, { status: 200, headers: { 'content-type': 'image/jpeg' } }))
      .mockResolvedValueOnce(new Response(garmentBytes, { status: 200, headers: { 'content-type': 'image/png' } }))
      .mockResolvedValueOnce(geminiResponse());

    const result = await state.provider.generate(state.context);

    const requestInput = fetchMock.mock.calls[2]?.[0];
    const requestUrl = requestInput instanceof Request
      ? requestInput.url
      : requestInput?.toString() ?? '';
    expect(requestUrl).toContain(
      '/models/gemini-3.1-flash-image:generateContent',
    );
    const init = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({ 'x-goog-api-key': 'gemini-test-key' });
    const body = JSON.parse(typeof init.body === 'string' ? init.body : '') as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
    };
    expect(body.contents[0]?.parts).toHaveLength(3);
    expect(body.contents[0]?.parts[1]).toHaveProperty('inlineData.mimeType', 'image/jpeg');
    expect(body.contents[0]?.parts[2]).toHaveProperty('inlineData.mimeType', 'image/png');
    expect(result.outputs[0]).toMatchObject({
      mimeType: 'image/png',
      fileName: 'gemini-tryon-output-1.png',
    });
  });

  it('uses controlled calls for num_images greater than one', async () => {
    const state = harness(2);
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(personBytes, { status: 200, headers: { 'content-type': 'image/jpeg' } }))
      .mockResolvedValueOnce(new Response(garmentBytes, { status: 200, headers: { 'content-type': 'image/png' } }))
      .mockResolvedValueOnce(geminiResponse())
      .mockResolvedValueOnce(geminiResponse());

    const result = await state.provider.generate(state.context);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.outputs.map((output) => output.fileName)).toEqual([
      'gemini-tryon-output-1.png',
      'gemini-tryon-output-2.png',
    ]);
  });
});
