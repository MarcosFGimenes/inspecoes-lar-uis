"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export interface ImagePreviewData {
  src: string;
  alt: string;
}

interface ImagePreviewDialogProps {
  image: ImagePreviewData;
  onClose: () => void;
}

export function ImagePreviewDialog({ image, onClose }: ImagePreviewDialogProps) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom(current => Math.min(current + 0.25, 3));
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setZoom(current => Math.max(current - 0.25, 1));
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const handleZoomIn = () => setZoom(current => Math.min(current + 0.25, 3));
  const handleZoomOut = () => setZoom(current => Math.max(current - 0.25, 1));
  const handleReset = () => setZoom(1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative flex w-full max-w-5xl flex-col gap-4 text-white"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Visualização da imagem</p>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="bg-white/90 text-black hover:bg-white"
          >
            Fechar
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <Button
            type="button"
            variant="secondary"
            onClick={handleZoomOut}
            disabled={zoom <= 1}
            className="bg-white/90 text-black hover:bg-white"
          >
            -
          </Button>
          <span className="w-16 text-center">{Math.round(zoom * 100)}%</span>
          <Button
            type="button"
            variant="secondary"
            onClick={handleZoomIn}
            disabled={zoom >= 3}
            className="bg-white/90 text-black hover:bg-white"
          >
            +
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleReset}
            disabled={zoom === 1}
            className="bg-white/90 text-black hover:bg-white"
          >
            Resetar
          </Button>
        </div>

        <div className="relative flex max-h-[80vh] min-h-[300px] w-full justify-center overflow-auto rounded-lg bg-black/40 p-2">
          <div className="relative h-[60vh] w-full max-w-5xl">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(max-width: 768px) 100vw, 80vw"
              className="object-contain"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
              priority
            />
          </div>
        </div>
      </div>
    </div>
  );
}
