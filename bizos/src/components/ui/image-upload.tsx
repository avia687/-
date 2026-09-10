"use client";

import * as React from "react";
import { ImagePlus, X } from "lucide-react";
import { fileToDataUri, UPLOAD_ERRORS } from "@/lib/upload";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** Reusable image picker → returns a validated, downscaled data URI. */
export function ImageUpload({
  value,
  onChange,
  label = "העלה תמונה",
  className,
}: {
  value?: string | null;
  onChange: (dataUri: string | null) => void;
  label?: string;
  className?: string;
}) {
  const toast = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    const res = await fileToDataUri(file);
    setBusy(false);
    if ("error" in res) {
      toast(UPLOAD_ERRORS[res.error], "error");
      return;
    }
    onChange(res.dataUri);
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {value ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-16 w-16 rounded-lg border object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -left-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground"
            aria-label="הסר תמונה"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-secondary"
        >
          <ImagePlus size={18} />
          {busy ? "..." : label}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </div>
  );
}
