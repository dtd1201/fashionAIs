import { AiProviderResolver } from '../src/ai/ai-provider.resolver';

describe('AiProviderResolver', () => {
  const mock = { provider: 'MOCK', supports: jest.fn(() => true) };
  const fashn = { provider: 'FASHN', supports: jest.fn((type) => type === 'VIRTUAL_TRY_ON') };
  const openai = { provider: 'OPENAI', supports: jest.fn((type) => type === 'VIRTUAL_TRY_ON') };
  const gemini = { provider: 'GEMINI', supports: jest.fn((type) => type === 'VIRTUAL_TRY_ON') };

  function resolver(virtualTryOn: string): AiProviderResolver {
    const config = {
      getOrThrow: jest.fn((key: string) =>
        key === 'ai.providers.virtualTryOn' ? virtualTryOn : 'mock',
      ),
    };
    return new AiProviderResolver(
      config as never,
      mock as never,
      fashn as never,
      openai as never,
      gemini as never,
    );
  }

  it('selects FASHN only for configured virtual try-on', () => {
    const value = resolver('fashn');
    expect(value.providerForType('VIRTUAL_TRY_ON')).toBe('FASHN');
    expect(value.providerForType('IMAGE_GENERATION')).toBe('MOCK');
    expect(value.resolve('FASHN', 'VIRTUAL_TRY_ON')).toBe(fashn);
    expect(() => value.resolve('FASHN', 'IMAGE_GENERATION')).toThrow('unavailable');
  });

  it.each([
    ['openai', 'OPENAI', openai],
    ['gemini', 'GEMINI', gemini],
  ] as const)('selects %s for virtual try-on', (configured, name, provider) => {
    const value = resolver(configured);
    expect(value.providerForType('VIRTUAL_TRY_ON')).toBe(name);
    expect(value.resolve(name, 'VIRTUAL_TRY_ON')).toBe(provider);
  });

  it('fails clearly for an unknown provider', () => {
    expect(() => resolver('unknown').providerForType('VIRTUAL_TRY_ON')).toThrow(
      'Configured AI provider is unavailable',
    );
  });
});
