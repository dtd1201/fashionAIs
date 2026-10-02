interface R2HttpMetadata {
  contentType?: string;
}

interface R2ObjectMetadata {
  size: number;
  httpEtag?: string;
  httpMetadata?: R2HttpMetadata;
  writeHttpMetadata(headers: Headers): void;
}

interface R2ObjectBody extends R2ObjectMetadata {
  body: ReadableStream<Uint8Array>;
}

interface R2BucketBinding {
  put(
    key: string,
    value: ReadableStream<Uint8Array>,
    options?: { httpMetadata?: R2HttpMetadata },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2ObjectMetadata | null>;
  delete(key: string): Promise<void>;
}

export interface Env {
  ASSETS_BUCKET: R2BucketBinding;
  R2_GATEWAY_SIGNING_SECRET: string;
  ALLOWED_ORIGINS: string;
}

type ObjectMethod = 'PUT' | 'GET' | 'HEAD' | 'DELETE';

interface SignatureInput {
  method: ObjectMethod;
  objectKey: string;
  expiresAt: number;
  contentType?: string;
  maxBytes?: number;
}

const OBJECT_PATH_PREFIX = '/objects/';
const PUBLIC_METHODS = 'PUT, GET, HEAD, OPTIONS';

export function canonicalMessage(input: SignatureInput): string {
  return [
    input.method,
    input.objectKey,
    String(input.expiresAt),
    input.contentType ?? '',
    input.maxBytes === undefined ? '' : String(input.maxBytes),
  ].join('\n');
}

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins(env).has(origin)) {
    return errorResponse(403, 'ORIGIN_NOT_ALLOWED');
  }
  if (request.method === 'OPTIONS') {
    return corsPreflight(origin);
  }
  if (!isObjectMethod(request.method)) {
    return responseWithSecurityHeaders(
      errorResponse(405, 'METHOD_NOT_ALLOWED'),
      origin,
    );
  }

  const url = new URL(request.url);
  const objectKey = parseObjectKey(url.pathname);
  if (!objectKey) {
    return responseWithSecurityHeaders(
      errorResponse(404, 'OBJECT_NOT_FOUND'),
      origin,
    );
  }
  const verification = await verifyRequest(
    request.method,
    objectKey,
    url.searchParams,
    env.R2_GATEWAY_SIGNING_SECRET,
  );
  if (verification instanceof Response) {
    return responseWithSecurityHeaders(verification, origin);
  }

  try {
    const response = await executeObjectRequest(
      request,
      env.ASSETS_BUCKET,
      objectKey,
      verification,
    );
    return responseWithSecurityHeaders(response, origin);
  } catch {
    return responseWithSecurityHeaders(
      errorResponse(500, 'STORAGE_ERROR'),
      origin,
    );
  }
}

async function verifyRequest(
  method: ObjectMethod,
  objectKey: string,
  params: URLSearchParams,
  secret: string,
): Promise<SignatureInput | Response> {
  const expiresAt = Number(params.get('expires'));
  const signature = params.get('signature');
  if (!Number.isSafeInteger(expiresAt) || !signature) {
    return errorResponse(403, 'INVALID_SIGNATURE');
  }
  if (expiresAt <= Math.floor(Date.now() / 1000)) {
    return errorResponse(403, 'EXPIRED_SIGNATURE');
  }
  const contentType = params.get('contentType') || undefined;
  const maxBytesValue = params.get('maxBytes');
  const maxBytes = maxBytesValue === null ? undefined : Number(maxBytesValue);
  if (
    maxBytes !== undefined &&
    (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
  ) {
    return errorResponse(403, 'INVALID_SIGNATURE');
  }
  const input: SignatureInput = {
    method,
    objectKey,
    expiresAt,
    contentType,
    maxBytes,
  };
  const expected = await sign(canonicalMessage(input), secret);
  if (!constantTimeEqual(signature, expected)) {
    return errorResponse(403, 'INVALID_SIGNATURE');
  }
  return input;
}

async function executeObjectRequest(
  request: Request,
  bucket: R2BucketBinding,
  objectKey: string,
  signature: SignatureInput,
): Promise<Response> {
  if (request.method === 'PUT') {
    if (!request.body) return errorResponse(400, 'INVALID_BODY');
    const contentType = request.headers.get('content-type') ?? undefined;
    if (signature.contentType && contentType !== signature.contentType) {
      return errorResponse(415, 'INVALID_CONTENT_TYPE');
    }
    const contentLength = optionalNumber(
      request.headers.get('content-length'),
    );
    if (
      signature.maxBytes !== undefined &&
      contentLength !== undefined &&
      contentLength > signature.maxBytes
    ) {
      return errorResponse(413, 'OBJECT_TOO_LARGE');
    }
    await bucket.put(objectKey, request.body, {
      httpMetadata: { contentType: signature.contentType ?? contentType },
    });
    return new Response(null, { status: 204 });
  }
  if (request.method === 'GET') {
    const object = await bucket.get(objectKey);
    if (!object) return errorResponse(404, 'OBJECT_NOT_FOUND');
    const headers = objectHeaders(object);
    return new Response(object.body, { status: 200, headers });
  }
  if (request.method === 'HEAD') {
    const object = await bucket.head(objectKey);
    if (!object) return errorResponse(404, 'OBJECT_NOT_FOUND');
    return new Response(null, { status: 200, headers: objectHeaders(object) });
  }
  await bucket.delete(objectKey);
  return new Response(null, { status: 204 });
}

function objectHeaders(object: R2ObjectMetadata): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-length', String(object.size));
  if (object.httpEtag) headers.set('etag', object.httpEtag);
  return headers;
}

function parseObjectKey(pathname: string): string | null {
  if (!pathname.startsWith(OBJECT_PATH_PREFIX)) return null;
  try {
    const key = decodeURIComponent(pathname.slice(OBJECT_PATH_PREFIX.length));
    const segments = key.split('/');
    if (
      !key.startsWith('organizations/') ||
      key.includes('\\') ||
      segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      return null;
    }
    return key;
  } catch {
    return null;
  }
}

async function sign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function constantTimeEqual(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function allowedOrigins(env: Env): Set<string> {
  return new Set(
    env.ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function corsPreflight(origin: string | null): Response {
  const response = new Response(null, { status: 204 });
  if (origin) {
    response.headers.set('access-control-allow-origin', origin);
    response.headers.set('vary', 'Origin');
    response.headers.set('access-control-allow-methods', PUBLIC_METHODS);
    response.headers.set('access-control-allow-headers', 'Content-Type');
    response.headers.set('access-control-max-age', '86400');
  }
  return responseWithSecurityHeaders(response, origin);
}

function responseWithSecurityHeaders(
  response: Response,
  origin: string | null,
): Response {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('cache-control', 'private, no-store');
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function errorResponse(status: number, code: string): Response {
  return Response.json({ error: code }, { status });
}

function optionalNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function isObjectMethod(value: string): value is ObjectMethod {
  return ['PUT', 'GET', 'HEAD', 'DELETE'].includes(value);
}

export default { fetch: handleRequest };
