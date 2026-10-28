import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, ExternalLink, Printer } from "lucide-react";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import type { RestaurantTable } from "./api";
import { tableMessages } from "./messages";
import { isLocalOnlyUrl, publicMenuUrl } from "./qr-url";
import { renderTableCard } from "./table-card";

function download(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

// Body of the QR dialog: the code, its public link and the printable table card.
export function TableQr({
  table,
  restaurantName,
}: {
  table: RestaurantTable;
  restaurantName: string;
}) {
  const language = useStaffLanguage();
  const m = tableMessages[language];
  let url = "";
  let configurationError = "";
  try {
    url = publicMenuUrl(table.qrPath, window.location.origin, import.meta.env.VITE_PUBLIC_BASE_URL);
  } catch (error) {
    // The detailed reason is written in Chinese for whoever configures the deployment.
    configurationError =
      language === "zh" && error instanceof Error ? error.message : m.configError;
  }
  const [image, setImage] = useState<{ url: string; data?: string; error?: string }>();
  const [notice, setNotice] = useState("");
  const [rendering, setRendering] = useState(false);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void QRCode.toDataURL(url, {
      width: 1024,
      margin: 4,
      errorCorrectionLevel: "M",
      type: "image/png",
      color: { dark: "#000000ff", light: "#ffffffff" },
    })
      .then((data) => {
        if (!cancelled) setImage({ url, data });
      })
      .catch(() => {
        if (!cancelled) setImage({ url, error: m.qrFailed });
      });
    return () => {
      cancelled = true;
    };
  }, [url, m]);
  const current = image?.url === url ? image : undefined;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setNotice(m.copied);
    } catch {
      setNotice(m.copyFailed);
    }
  }
  async function downloadCard(qrDataUrl: string) {
    setRendering(true);
    setNotice("");
    try {
      const card = await renderTableCard({
        qrDataUrl,
        restaurantName,
        tableLabel: table.tableLabel,
      });
      download(card, `tavoloflow-table-card-${table.id}.png`);
    } catch {
      setNotice(m.cardFailed);
    } finally {
      setRendering(false);
    }
  }
  if (configurationError || current?.error)
    return <Notice tone="error">{configurationError || current?.error}</Notice>;
  return (
    <div className="space-y-4">
      {current?.data ? (
        <img
          src={current.data}
          width={256}
          height={256}
          alt={m.qrAlt(table.tableLabel)}
          className="mx-auto w-full max-w-60 rounded-xl border"
        />
      ) : (
        <LoadingState label={m.generating} />
      )}
      {url && isLocalOnlyUrl(url) && <Notice tone="warning">{m.localOnly}</Notice>}
      <div className="space-y-2">
        <Label htmlFor="qr-url">{m.link}</Label>
        <Input id="qr-url" value={url} readOnly onFocus={(event) => event.target.select()} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {current?.data && (
          <>
            <Button disabled={rendering} onClick={() => void downloadCard(current.data!)}>
              <Printer />
              {rendering ? m.rendering : m.downloadCard}
            </Button>
            <a
              className={buttonVariants({ variant: "outline" })}
              href={current.data}
              download={`tavoloflow-table-${table.id}.png`}
            >
              <Download />
              {m.downloadQr}
            </a>
          </>
        )}
        <Button variant="outline" onClick={() => void copy()}>
          <Copy />
          {m.copy}
        </Button>
        <a
          className={buttonVariants({ variant: "outline" })}
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink />
          {m.openMenu}
        </a>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{m.cardHint}</p>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
    </div>
  );
}
