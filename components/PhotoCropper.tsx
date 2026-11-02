"use client";

import { useEffect, useRef, useState } from "react";

const OUTPUT_SIZE = 600;
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export interface PhotoCropperLabels {
  upload: string;
  camera: string;
  remove: string;
  zoom: string;
  hint: string;
  error: string;
  noPhoto: string;
}

/**
 * Square avatar cropper. The image is drawn into a 600×600 canvas (drag to
 * reposition, slider to zoom) and submitted as a JPEG data URL. The server
 * re-validates magic bytes and re-encodes with sharp, so this client output is
 * never trusted as-is.
 */
export function PhotoCropper({
  name,
  initialUrl,
  labels,
  onPreview,
}: {
  name: string;
  initialUrl?: string | null;
  labels: PhotoCropperLabels;
  onPreview?: (dataUrl: string | null) => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dataUrl) onPreview?.(dataUrl);
  }, [dataUrl, onPreview]);

  useEffect(() => {
    if (!image) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    const base = Math.max(OUTPUT_SIZE / image.width, OUTPUT_SIZE / image.height);
    const scale = base * zoom;
    const width = image.width * scale;
    const height = image.height * scale;
    const limitX = Math.max(0, (width - OUTPUT_SIZE) / 2);
    const limitY = Math.max(0, (height - OUTPUT_SIZE) / 2);
    const x = (OUTPUT_SIZE - width) / 2 + Math.min(limitX, Math.max(-limitX, offset.x));
    const y = (OUTPUT_SIZE - height) / 2 + Math.min(limitY, Math.max(-limitY, offset.y));
    context.drawImage(image, x, y, width, height);

    setDataUrl(canvas.toDataURL("image/jpeg", 0.9));
  }, [image, zoom, offset]);

  function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError(labels.error);
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError(labels.error);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const source = typeof reader.result === "string" ? reader.result : "";
      const nextImage = new Image();
      nextImage.onload = () => {
        setImage(nextImage);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      };
      nextImage.onerror = () => setError(labels.error);
      nextImage.src = source;
    };
    reader.onerror = () => setError(labels.error);
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    setImage(null);
    setDataUrl(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError(null);
    onPreview?.(null);
    if (inputRef.current) inputRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-4">
        {image ? (
          <canvas
            ref={canvasRef}
            width={OUTPUT_SIZE}
            height={OUTPUT_SIZE}
            aria-label={labels.upload}
            onPointerDown={(event) => {
              (event.target as HTMLElement).setPointerCapture(event.pointerId);
              dragRef.current = {
                startX: event.clientX,
                startY: event.clientY,
                originX: offset.x,
                originY: offset.y,
              };
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag) return;
              const rect = (event.target as HTMLElement).getBoundingClientRect();
              const factor = OUTPUT_SIZE / Math.max(1, rect.width);
              setOffset({
                x: drag.originX + (event.clientX - drag.startX) * factor,
                y: drag.originY + (event.clientY - drag.startY) * factor,
              });
            }}
            onPointerUp={() => {
              dragRef.current = null;
            }}
            onPointerCancel={() => {
              dragRef.current = null;
            }} className="h-48 w-48 cursor-move touch-none rounded-card border-2 border-brand object-cover"
          />
        ) : initialUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={initialUrl} alt={labels.upload} className="h-32 w-32 rounded-card border border-border object-cover" />
        ) : (
          <div className="flex h-32 w-32 items-center justify-center rounded-card border border-dashed border-border bg-surface p-2 text-center text-xs text-muted">
            {labels.noPhoto}
          </div>
        )}

        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp" className="sr-only"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment" className="sr-only"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()}>
              {labels.upload}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => cameraRef.current?.click()}>
              {labels.camera}
            </button>
          </div>
          {image || initialUrl ? (
            <button type="button" className="btn btn-ghost btn-sm block" onClick={removePhoto}>
              {labels.remove}
            </button>
          ) : null}
          {image ? (
            <div>
              <label className="label" htmlFor={`${name}-zoom`}>
                {labels.zoom}
              </label>
              <input
                id={`${name}-zoom`}
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))} className="w-48 accent-brand"
              />
            </div>
          ) : null}
        </div>
      </div>

      <p className="hint">{labels.hint}</p>
      {error ? (
        <p role="alert" className="text-xs font-semibold text-danger-fg">
          {error}
        </p>
      ) : null}
      <input type="hidden" name={name} value={dataUrl ?? ""} />
    </div>
  );
}
