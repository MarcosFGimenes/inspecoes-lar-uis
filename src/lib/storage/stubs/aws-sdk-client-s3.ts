export interface S3ClientConfig {
  region?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

export class PutObjectCommand {
  constructor(public readonly input: Record<string, unknown>) {}
}

export class S3Client {
  constructor(public readonly config: S3ClientConfig) {}

  async send() {
    throw new Error(
      "@aws-sdk/client-s3 is not installed. Install the dependency to enable R2 uploads."
    );
  }
}

