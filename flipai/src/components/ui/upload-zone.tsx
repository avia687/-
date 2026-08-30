"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, Camera, X, ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";

export type UploadItem = {
  id: string;
  file: File;
  preview: string;
};

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_FILES = 6;

export function UploadZone({
  items,
  onChange,
  onError,
}: {
  items: UploadItem[];
  onChange: (items: UploadItem[]) => void;
  onError?: (message: string) => void;
}) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);

  const addFiles = React.useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;
      const incoming = Array.from(fileList);
      const next: UploadItem[] = [...items];
      for (const file of incoming) {
        if (next.length >= MAX_FILES) {
          onError?.(`ניתן להעלות עד ${MAX_FILES} תמונות`);
          break;
        }
        if (!ACCEPTED.includes(file.type)) {
          onError?.("פורמט לא נתמך. השתמשו ב-JPG, PNG או WEBP.");
          continue;
        }
        if (file.size > MAX_BYTES) {
          onError?.("הקובץ גדול מדי (מקסימום 8MB)");
          continue;
        }
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          preview: URL.createObjectURL(file),
        });
      }
      onChange(next);
    },
    [items, onChange, onError],
  );

  const remove = (id: string) => {
    const target = items.find((i) => i.id === id);
    if (target) URL.revokeObjectURL(target.preview);
    onChange(items.filter((i) => i.id !== id));
  };

  React.useEffect(() => {
    return () => items.forEach((i) => URL.revokeObjectURL(i.preview));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragging
            ? "border-primary bg-accent/70"
            : "border-border bg-card hover:border-primary/50 hover:bg-accent/30",
        )}
      >
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-primary">
          <UploadCloud className="h-7 w-7" />
        </div>
        <p className="font-semibold">גררו תמונות לכאן או לחצו להעלאה</p>
        <p className="mt-1 text-sm text-muted-foreground">
          JPG, PNG או WEBP · עד {MAX_FILES} תמונות · עד 8MB לתמונה
        </p>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              cameraRef.current?.click();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Camera className="h-4 w-4" />
            צילום
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <AnimatePresence>
        {items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4"
          >
            {items.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="group relative aspect-square overflow-hidden rounded-xl border bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.preview}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  aria-label="הסרת תמונה"
                  className="absolute left-1.5 top-1.5 rounded-full bg-slate-950/60 p-1 text-white opacity-0 transition-opacity hover:bg-slate-950/80 group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            ))}
            {items.length < MAX_FILES && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <ImagePlus className="h-5 w-5" />
                <span className="text-xs">הוספה</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
