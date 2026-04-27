// Cloudflare R2 signed-URL upload (Phase 3.4).
//
// R2 is S3-compatible, so we drive it with @aws-sdk/client-s3 +
// @aws-sdk/s3-request-presigner. Two-leg flow:
//   1. Client POSTs metadata to /api/v2/uploads/sign
//      → server returns { uploadUrl, storageKey, expiresAt }.
//   2. Client PUTs the file directly to R2 using uploadUrl.
//   3. Client POSTs the storageKey + finalize metadata to
//      /api/v2/attachments → server inserts a row in `attachments`
//      with optional message/event/transaction/bill linkage.
//
// Storage keys live under `family/<familyId>/<yyyy-mm>/<random>.<ext>` so
// access control via signed URL is sufficient even with a public-read
// bucket policy.
//
// Env:
//   R2_ENDPOINT             — https://<account>.r2.cloudflarestorage.com
//   R2_ACCESS_KEY_ID
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET               — bucket name
//   R2_PUBLIC_BASE_URL      — optional public CDN URL prefix; falls back
//                              to signed-GET when unset.

import { randomBytes } from 'node:crypto';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let cachedClient = null;

export const isR2Configured = () =>
  Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET
  );

const getClient = () => {
  if (cachedClient) return cachedClient;
  if (!isR2Configured()) {
    const err = new Error('R2 is not configured.');
    err.status = 503;
    throw err;
  }
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
  });
  return cachedClient;
};

const extensionFor = (mimeType) => {
  if (!mimeType) return 'bin';
  if (mimeType.startsWith('image/')) return mimeType.split('/')[1].split(';')[0];
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'text/plain') return 'txt';
  return 'bin';
};

/**
 * @param {{
 *   familyId: string,
 *   memberId: string,
 *   mimeType: string,
 *   byteSize: number
 * }} args
 */
export const createUploadUrl = async ({ familyId, memberId, mimeType, byteSize }) => {
  const month = new Date().toISOString().slice(0, 7);
  const ext = extensionFor(mimeType);
  const random = randomBytes(12).toString('hex');
  const storageKey = `family/${familyId}/${month}/${random}.${ext}`;

  const client = getClient();
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: storageKey,
    ContentType: mimeType,
    ContentLength: byteSize,
    Metadata: { uploader: memberId }
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 });

  return {
    uploadUrl,
    storageKey,
    expiresAt: new Date(Date.now() + 60 * 5 * 1000).toISOString()
  };
};

/**
 * Build a public or signed URL the client can render <img src=...> against.
 * Uses R2_PUBLIC_BASE_URL when set; otherwise mints a 24h signed-GET URL.
 */
export const buildAttachmentReadUrl = async (storageKey) => {
  const publicBase = process.env.R2_PUBLIC_BASE_URL;
  if (publicBase) return `${publicBase.replace(/\/$/, '')}/${storageKey}`;
  const client = getClient();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: storageKey }),
    { expiresIn: 60 * 60 * 24 }
  );
};
