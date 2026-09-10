"use client";

import * as React from "react";
import { Label } from "@/components/ui/primitives";
import { fileToDataUri, UPLOAD_ERRORS } from "@/lib/upload";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client";
import { ImagePlus } from "lucide-react";

type Photo = { id: string; kind: string; data: string };

/** Before/After photo gallery + upload for an existing job. */
export function JobPhotos({ jobId }: { jobId: string }) {
  const toast = useToast();
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const d = await api<{ photos: Photo[] }>(`/api/jobs/${jobId}/photos`).catch(() => ({ photos: [] }));
    setPhotos(d.photos);
  }, [jobId]);
  React.useEffect(() => {
    load();
  }, [load]);

  async function upload(kind: "before" | "after", file?: File) {
    if (!file) return;
    setBusy(true);
    const res = await fileToDataUri(file);
    if ("error" in res) {
      setBusy(false);
      toast(UPLOAD_ERRORS[res.error], "error");
      return;
    }
    try {
      await api(`/api/jobs/${jobId}/photos`, { method: "POST", body: { kind, data: res.dataUri } });
      toast("התמונה נשמרה");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Label>תמונות לפני / אחרי</Label>
      <div className="grid grid-cols-2 gap-3">
        {(["before", "after"] as const).map((kind) => {
          const items = photos.filter((p) => p.kind === kind);
          return (
            <div key={kind} className="rounded-lg border p-2">
              <p className="mb-1 text-xs font-medium text-muted-foreground">{kind === "before" ? "לפני" : "אחרי"}</p>
              <div className="flex flex-wrap gap-1">
                {items.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={p.id} href={p.data} target="_blank" rel="noreferrer"><img src={p.data} alt="" className="h-12 w-12 rounded object-cover" /></a>
                ))}
                <label className="flex h-12 w-12 cursor-pointer items-center justify-center rounded border border-dashed text-muted-foreground hover:bg-secondary">
                  <ImagePlus size={16} />
                  <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => upload(kind, e.target.files?.[0])} />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
