import { createHmac } from 'node:crypto';

export interface R2GatewaySignatureInput {
  method: 'PUT' | 'GET' | 'HEAD' | 'DELETE';
  objectKey: string;
  expiresAt: number;
  contentType?: string;
  maxBytes?: number;
}

export class R2GatewaySigner {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  createSignedUrl(
    input: Omit<R2GatewaySignatureInput, 'expiresAt'> & {
      expiresInSeconds: number;
    },
  ): string {
    const expiresAt = Math.floor(Date.now() / 1000) + input.expiresInSeconds;
    const signatureInput: R2GatewaySignatureInput = { ...input, expiresAt };
    const signature = this.sign(signatureInput);
    const url = new URL(
      `objects/${encodeURIComponent(input.objectKey)}`,
      this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`,
    );
    url.searchParams.set('expires', String(expiresAt));
    url.searchParams.set('signature', signature);
    if (input.contentType) {
      url.searchParams.set('contentType', input.contentType);
    }
    if (input.maxBytes !== undefined) {
      url.searchParams.set('maxBytes', String(input.maxBytes));
    }
    return url.toString();
  }

  sign(input: R2GatewaySignatureInput): string {
    return createHmac('sha256', this.secret)
      .update(R2GatewaySigner.canonicalMessage(input))
      .digest('hex');
  }

  static canonicalMessage(input: R2GatewaySignatureInput): string {
    return [
      input.method,
      input.objectKey,
      String(input.expiresAt),
      input.contentType ?? '',
      input.maxBytes === undefined ? '' : String(input.maxBytes),
    ].join('\n');
  }
}
