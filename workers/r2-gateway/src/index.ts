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
    value: ReadableStream<Uint8Array> | Uint8Array,
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
const MAX_R2_PUT_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_BUFFERED_UPLOAD_BYTES = 32 * 1024 * 1024;

class ObjectTooLargeError extends Error {}
class ContentLengthMismatchError extends Error {}

declare class FixedLengthStream {
  constructor(expectedLength: number | bigint);
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}

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
  const maxBytes = parseUnsignedInteger(maxBytesValue, MAX_R2_PUT_BYTES);
  if (maxBytes === null) {
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
    const contentLength = parseContentLength(
      request.headers.get('content-length'),
    );
    if (contentLength === null) {
      return errorResponse(400, 'INVALID_CONTENT_LENGTH');
    }
    if (
      signature.maxBytes !== undefined &&
      contentLength !== undefined &&
      contentLength > signature.maxBytes
    ) {
      return errorResponse(413, 'OBJECT_TOO_LARGE');
    }
    if (signature.maxBytes === undefined) {
      return errorResponse(403, 'INVALID_SIGNATURE');
    }
    const metadata = { contentType: signature.contentType ?? contentType };
    const uploadResult =
      contentLength === undefined
        ? await putBufferedBody(
            request.body,
            bucket,
            objectKey,
            signature.maxBytes,
            metadata,
          )
        : await putFixedLengthBody(
            request.body,
            bucket,
            objectKey,
            contentLength,
            signature.maxBytes,
            metadata,
          );
    if (uploadResult) return uploadResult;
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

function parseContentLength(value: string | null): number | undefined | null {
  return parseUnsignedInteger(value, Number.MAX_SAFE_INTEGER);
}

function parseUnsignedInteger(
  value: string | null,
  maximum: number,
): number | undefined | null {
  if (value === null) return undefined;
  if (!/^(0|[1-9]\d*)$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number <= maximum ? number : null;
}

async function putFixedLengthBody(
  body: ReadableStream<Uint8Array>,
  bucket: R2BucketBinding,
  objectKey: string,
  contentLength: number,
  maxBytes: number,
  httpMetadata: R2HttpMetadata,
): Promise<Response | undefined> {
  let putResultPromise:
    | Promise<{ ok: true } | { ok: false; error: unknown }>
    | undefined;
  try {
    const fixedLength = new FixedLengthStream(contentLength);
    putResultPromise = bucket
      .put(objectKey, fixedLength.readable, { httpMetadata })
      .then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      );
    await pumpFixedLengthBody(
      body,
      fixedLength.writable,
      contentLength,
      maxBytes,
    );
    const putResult = await putResultPromise;
    if (!putResult.ok) throw putResult.error;
  } catch (error) {
    if (putResultPromise) await putResultPromise;
    if (error instanceof ObjectTooLargeError) {
      return errorResponse(413, 'OBJECT_TOO_LARGE');
    }
    if (error instanceof ContentLengthMismatchError) {
      return errorResponse(400, 'CONTENT_LENGTH_MISMATCH');
    }
    logPutFailure(error);
    return errorResponse(500, 'STORAGE_WRITE_FAILED');
  }
}

async function pumpFixedLengthBody(
  body: ReadableStream<Uint8Array>,
  destination: WritableStream<Uint8Array>,
  contentLength: number,
  maxBytes: number,
): Promise<void> {
  const reader = body.getReader();
  const writer = destination.getWriter();
  let receivedBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maxBytes) throw new ObjectTooLargeError();
      if (receivedBytes > contentLength) {
        throw new ContentLengthMismatchError();
      }
      await writer.write(value);
    }
    if (receivedBytes !== contentLength) {
      throw new ContentLengthMismatchError();
    }
    await writer.close();
  } catch (error) {
    await writer.abort(error).catch(() => undefined);
    await reader.cancel(error).catch(() => undefined);
    throw error;
  }
}

async function putBufferedBody(
  body: ReadableStream<Uint8Array>,
  bucket: R2BucketBinding,
  objectKey: string,
  maxBytes: number,
  httpMetadata: R2HttpMetadata,
): Promise<Response | undefined> {
  try {
    const bufferLimit = Math.min(maxBytes, MAX_BUFFERED_UPLOAD_BYTES);
    const bytes = new Uint8Array(bufferLimit);
    const reader = body.getReader();
    let receivedBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (receivedBytes + value.byteLength > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return errorResponse(413, 'OBJECT_TOO_LARGE');
      }
      if (receivedBytes + value.byteLength > MAX_BUFFERED_UPLOAD_BYTES) {
        await reader.cancel().catch(() => undefined);
        return errorResponse(413, 'BUFFERED_UPLOAD_LIMIT_EXCEEDED');
      }
      bytes.set(value, receivedBytes);
      receivedBytes += value.byteLength;
    }
    await bucket.put(objectKey, bytes.subarray(0, receivedBytes), {
      httpMetadata,
    });
  } catch (error) {
    logPutFailure(error);
    return errorResponse(500, 'STORAGE_WRITE_FAILED');
  }
}

function logPutFailure(error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error({
    operation: 'r2.put',
    errorName: name.slice(0, 80),
    errorMessage: message
      .replace(/https?:\/\/\S+/gi, '[redacted-url]')
      .slice(0, 240),
  });
}

function isObjectMethod(value: string): value is ObjectMethod {
  return ['PUT', 'GET', 'HEAD', 'DELETE'].includes(value);
}

export default { fetch: handleRequest };
