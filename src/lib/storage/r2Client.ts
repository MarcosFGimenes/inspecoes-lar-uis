import { S3Client } from "@aws-sdk/client-s3";

function ensureEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} env var is required for R2 uploads`);
  }
  return value;
}

const region = process.env.R2_REGION || "auto";
const accountId = ensureEnv("R2_ACCOUNT_ID");
const accessKeyId = ensureEnv("R2_ACCESS_KEY_ID");
const secretAccessKey = ensureEnv("R2_SECRET_ACCESS_KEY");

export const r2 = new S3Client({
  region,
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

