declare module "@aws-sdk/client-s3" {
  export interface S3ClientConfig {
    region?: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    credentials?: {
      accessKeyId: string;
      secretAccessKey: string;
    };
  }

  export class S3Client {
    constructor(config: S3ClientConfig);
    send<TInput, TOutput = unknown>(command: TInput): Promise<TOutput>;
  }

  export class PutObjectCommand {
    constructor(input: Record<string, unknown>);
  }
}

declare module "@aws-sdk/s3-request-presigner" {
  // Stub module to satisfy TypeScript when dependencies are unavailable during CI builds.
}

