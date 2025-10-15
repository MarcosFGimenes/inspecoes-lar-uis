"use client";

import { useEffect, useMemo, useState } from "react";
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
    setZoom(1);
  }, [image.src]);

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

  const zoomPercentage = useMemo(() => Math.round(zoom * 100), [zoom]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative flex w-full max-w-5xl flex-col gap-4 text-white sm:max-h-[90vh]"
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

        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
          <Button
            type="button"
            variant="secondary"
            onClick={handleZoomOut}
            disabled={zoom <= 1}
            className="bg-white/90 text-black hover:bg-white"
          >
            -
          </Button>
          <span className="w-16 text-center">{zoomPercentage}%</span>
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

        <div className="relative flex min-h-[200px] flex-1 justify-center">
          <div className="flex max-h-[80vh] w-full max-w-full items-center justify-center overflow-auto rounded-lg bg-black/40 p-2 sm:p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.src}
              alt={image.alt}
              draggable={false}
              className="max-h-full select-none"
              style={{
                width: `${zoom * 100}%`,
                height: "auto",
                maxWidth: zoom === 1 ? "100%" : "none",
                maxHeight: zoom === 1 ? "100%" : "none",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
