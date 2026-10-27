import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ImageOff, ImagePlus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldError } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { menuImageUrl, type MenuItem } from "./api";
import { usePhoto } from "./usePhoto";
import { messages as m } from "./messages";

// Matches the API's upload limit, so an oversized photo is refused before it is sent.
const maxPhotoBytes = 15 * 1024 * 1024;

// The dish name sits next to every photo, so the image itself is decorative.
export function DishPhoto({
  imageId,
  onError,
  className,
}: {
  imageId: string;
  onError: () => void;
  className?: string;
}) {
  return (
    <img
      src={menuImageUrl(imageId)}
      alt=""
      loading="lazy"
      decoding="async"
      width={640}
      height={640}
      onError={onError}
      className={cn("aspect-square shrink-0 rounded-xl bg-muted object-cover", className)}
    />
  );
}

export function ItemThumbnail({ imageId, className }: { imageId: string; className?: string }) {
  const photo = usePhoto(imageId);
  return photo.shown ? (
    <DishPhoto imageId={photo.shown} onError={photo.fail} className={className} />
  ) : null;
}

// Lives outside the content form: choosing or removing a photo saves at once and never submits the form.
export function ItemImageSection({
  item,
  busy,
  error,
  notice,
  upload,
  remove,
  clear,
}: {
  item: MenuItem;
  busy: boolean;
  error: ReactNode;
  notice: ReactNode;
  upload: (file: File) => void;
  remove: (done: () => void) => void;
  // Drops the result of an earlier photo write, so the confirmation only reports its own failure.
  clear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const photo = usePhoto(item.imageId);
  const [tooLarge, setTooLarge] = useState(false);
  const [confirming, setConfirming] = useState(false);
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    // Clearing the value lets the same file be chosen again after a failed upload.
    event.currentTarget.value = "";
    if (!file || busy) return;
    setTooLarge(file.size > maxPhotoBytes);
    if (file.size <= maxPhotoBytes) upload(file);
  }
  return (
    <section aria-labelledby="item-photo" className="mb-6 space-y-3 rounded-xl border p-3">
      <h3 id="item-photo" className="font-medium">
        {m.photo}
      </h3>
      <div className="flex items-center gap-4">
        {photo.shown ? (
          <DishPhoto imageId={photo.shown} onError={photo.fail} className="size-24" />
        ) : (
          <div className="flex size-24 shrink-0 items-center justify-center rounded-xl border border-dashed text-muted-foreground">
            <ImageOff aria-hidden="true" />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            <ImagePlus />
            {busy ? m.saving : item.imageId ? m.replacePhoto : m.choosePhoto}
          </Button>
          {item.imageId && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                clear();
                setConfirming(true);
              }}
            >
              <Trash2 />
              {m.removePhoto}
            </Button>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={choose}
      />
      <FieldDescription>{m.photoHint}</FieldDescription>
      {tooLarge && <FieldError>{m.photoTooLarge}</FieldError>}
      {!confirming && (error ?? notice)}
      <ConfirmDialog
        open={confirming}
        tone="destructive"
        title={m.removePhotoTitle}
        description={m.removePhotoHint}
        confirmLabel={busy ? m.saving : m.confirmDelete}
        cancelLabel={m.cancel}
        busy={busy}
        onConfirm={() => remove(() => setConfirming(false))}
        onCancel={() => setConfirming(false)}
      >
        {error}
      </ConfirmDialog>
    </section>
  );
}
