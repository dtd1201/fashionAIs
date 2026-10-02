import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => {
  const transport = process.env.R2_TRANSPORT?.trim() || 's3';
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  return {
    transport,
    configured: transport === 'worker'
      ? Boolean(
          process.env.R2_GATEWAY_BASE_URL &&
          process.env.R2_GATEWAY_SIGNING_SECRET &&
          process.env.R2_BUCKET,
        )
      : Boolean(
          endpoint &&
          process.env.R2_ACCESS_KEY_ID &&
          process.env.R2_SECRET_ACCESS_KEY &&
          process.env.R2_BUCKET,
        ),
    endpoint,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
    gatewayBaseUrl: process.env.R2_GATEWAY_BASE_URL,
    gatewaySigningSecret: process.env.R2_GATEWAY_SIGNING_SECRET,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
    uploadExpiresInSeconds: Number(
      process.env.R2_UPLOAD_EXPIRES_IN_SECONDS ?? 900,
    ),
    downloadExpiresInSeconds: Number(
      process.env.R2_DOWNLOAD_EXPIRES_IN_SECONDS ?? 600,
    ),
    maxImageBytes: Number(
      process.env.ASSET_MAX_IMAGE_BYTES ?? 20 * 1024 * 1024,
    ),
    maxVideoBytes: Number(
      process.env.ASSET_MAX_VIDEO_BYTES ?? 200 * 1024 * 1024,
    ),
    maxPdfBytes: Number(process.env.ASSET_MAX_PDF_BYTES ?? 25 * 1024 * 1024),
  };
});
