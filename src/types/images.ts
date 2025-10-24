export type ImageProvider = "r2" | "imgbb";

export interface StoredImage {
  url: string;
  provider: ImageProvider;
  mime?: string | null;
  key?: string | null;
}

