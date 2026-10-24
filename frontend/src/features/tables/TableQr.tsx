import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, ExternalLink, Printer } from "lucide-react";
import { LoadingState } from "@/components/loading-state";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RestaurantTable } from "./api";
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
  let url = "";
  let configurationError = "";
  try {
    url = publicMenuUrl(table.qrPath, window.location.origin, import.meta.env.VITE_PUBLIC_BASE_URL);
  } catch (error) {
    configurationError = error instanceof Error ? error.message : "二维码地址配置无效。";
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
        if (!cancelled) setImage({ url, error: "二维码生成失败，请关闭后重试。" });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  const current = image?.url === url ? image : undefined;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("链接已复制。");
    } catch {
      setNotice("无法自动复制，请选中下方链接手动复制。");
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
      setNotice("桌卡生成失败，请稍后重试或改用二维码 PNG。");
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
          alt={`${table.tableLabel} 桌公开菜单二维码`}
          className="mx-auto w-full max-w-60 rounded-xl border"
        />
      ) : (
        <LoadingState label="正在生成二维码…" />
      )}
      {url && isLocalOnlyUrl(url) && (
        <Notice tone="warning">
          此链接使用本机地址，手机无法直接访问。请使用手机可访问的网站地址后再下载二维码，配置方法见桌位模块文档。
        </Notice>
      )}
      <div className="space-y-2">
        <Label htmlFor="qr-url">公开菜单链接</Label>
        <Input id="qr-url" value={url} readOnly onFocus={(event) => event.target.select()} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {current?.data && (
          <>
            <Button disabled={rendering} onClick={() => void downloadCard(current.data!)}>
              <Printer />
              {rendering ? "正在生成…" : "下载桌卡"}
            </Button>
            <a
              className={buttonVariants({ variant: "outline" })}
              href={current.data}
              download={`tavoloflow-table-${table.id}.png`}
            >
              <Download />
              下载二维码
            </a>
          </>
        )}
        <Button variant="outline" onClick={() => void copy()}>
          <Copy />
          复制链接
        </Button>
        <a
          className={buttonVariants({ variant: "outline" })}
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink />
          打开菜单
        </a>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        桌卡包含店名、桌号、二维码和中意英三语“扫码点餐”提示，按 A6（10.5 × 14.8
        厘米）打印即可摆桌。
      </p>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
    </div>
  );
}
