import { createHmac } from 'node:crypto';
import { R2GatewaySigner } from '../src/storage/r2-gateway-signer';

describe('R2GatewaySigner', () => {
  it('canonicalizes and signs method, key, expiry, content type, and size', () => {
    const input = {
      method: 'PUT' as const,
      objectKey: 'organizations/org/assets/asset/source.jpg',
      expiresAt: 2_000_000_000,
      contentType: 'image/jpeg',
      maxBytes: 123,
    };
    const expectedMessage = [
      'PUT',
      input.objectKey,
      '2000000000',
      'image/jpeg',
      '123',
    ].join('\n');
    const signer = new R2GatewaySigner(
      'https://gateway.example',
      'test-signing-secret-with-at-least-32-characters',
    );

    expect(R2GatewaySigner.canonicalMessage(input)).toBe(expectedMessage);
    expect(signer.sign(input)).toBe(
      createHmac(
        'sha256',
        'test-signing-secret-with-at-least-32-characters',
      )
        .update(expectedMessage)
        .digest('hex'),
    );
  });

  it('creates short-lived method-bound URLs with an encoded server key', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const signer = new R2GatewaySigner(
      'https://gateway.example/base/',
      'test-signing-secret-with-at-least-32-characters',
    );
    const url = new URL(
      signer.createSignedUrl({
        method: 'GET',
        objectKey: 'organizations/org/assets/asset/file name.jpg',
        expiresInSeconds: 600,
      }),
    );

    expect(url.pathname).toBe(
      '/base/objects/organizations%2Forg%2Fassets%2Fasset%2Ffile%20name.jpg',
    );
    expect(url.searchParams.get('expires')).toBe('1700000600');
    expect(url.searchParams.get('signature')).toMatch(/^[a-f0-9]{64}$/);
    jest.restoreAllMocks();
  });

  it('changes the signature when the method or object key changes', () => {
    const signer = new R2GatewaySigner(
      'https://gateway.example',
      'test-signing-secret-with-at-least-32-characters',
    );
    const base = {
      method: 'GET' as const,
      objectKey: 'organizations/org/assets/asset/source.jpg',
      expiresAt: 2_000_000_000,
    };

    expect(signer.sign(base)).not.toBe(
      signer.sign({ ...base, method: 'DELETE' }),
    );
    expect(signer.sign(base)).not.toBe(
      signer.sign({ ...base, objectKey: `${base.objectKey}.tampered` }),
    );
  });
});
