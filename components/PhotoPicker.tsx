"use client";

import { useEffect, useMemo, useRef } from "react";
import { Camera, ImageSquare } from "@phosphor-icons/react";
import { Avatar } from "./ui";

/** Optional photo: "Take photo" (camera) or "Choose photo" (gallery). */
export function PhotoPicker({
  file,
  onChange,
  name,
  currentUrl,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  name: string;
  currentUrl?: string | null;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onChange(f);
    e.target.value = "";
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar src={preview ?? currentUrl} name={name || "?"} size={88} />
      <div className="flex flex-1 flex-col gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-gray-300 px-3 text-base font-semibold active:bg-gray-100"
        >
          <Camera size={22} weight="bold" aria-hidden /> Take photo
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-gray-300 px-3 text-base font-semibold active:bg-gray-100"
        >
          <ImageSquare size={22} weight="bold" aria-hidden /> Choose photo
        </button>
        {file && (
          <button type="button" onClick={() => onChange(null)} className="text-sm text-gray-500 underline">
            Remove photo
          </button>
        )}
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={pick} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={pick} />
    </div>
  );
}
