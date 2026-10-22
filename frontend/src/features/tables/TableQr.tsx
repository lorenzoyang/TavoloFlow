import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, ExternalLink, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RestaurantTable } from "./api";
import { isLocalOnlyUrl, publicMenuUrl } from "./qr-url";

export function TableQr({ table, restaurantName, close }: {
  table: RestaurantTable; restaurantName: string; close: () => void;
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
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    void QRCode.toDataURL(url, {
      width: 1024, margin: 4, errorCorrectionLevel: "M", type: "image/png",
      color: { dark: "#000000ff", light: "#ffffffff" },
    }).then(data => { if (!cancelled) setImage({ url, data }); })
      .catch(() => { if (!cancelled) setImage({ url, error: "二维码生成失败，请关闭后重试。" }); });
    return () => { cancelled = true; };
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
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="text-sm text-muted-foreground wrap-break-word">{restaurantName}</p>
            <h2 className="text-xl font-semibold wrap-break-word">{table.tableLabel} · 桌位二维码</h2></div>
          <Button variant="ghost" className="size-11 shrink-0" aria-label="关闭二维码" onClick={close}><X /></Button>
        </div>
        {configurationError || current?.error ? (
          <Alert variant="destructive"><AlertDescription>{configurationError || current?.error}</AlertDescription></Alert>
        ) : <>
          {current?.data ? <img src={current.data} width={256} height={256}
            alt={`${table.tableLabel} 桌公开菜单二维码`} className="mx-auto w-full max-w-64" />
            : <p role="status">正在生成二维码…</p>}
          {url && isLocalOnlyUrl(url) && <Alert><AlertDescription>
            此链接使用本机地址，手机无法直接访问。请使用手机可访问的网站地址后再下载二维码，配置方法见桌位模块文档。
          </AlertDescription></Alert>}
          <div className="space-y-2"><Label htmlFor="qr-url">公开菜单链接</Label>
            <Input id="qr-url" className="h-11" value={url} readOnly onFocus={event => event.target.select()} /></div>
          <div className="flex flex-wrap gap-3">
            {current?.data && <a className={buttonVariants({ className: "h-11" })}
              href={current.data} download={`tavoloflow-table-${table.id}.png`}><Download />下载 PNG</a>}
            <Button variant="outline" className="h-11" onClick={() => void copy()}><Copy />复制链接</Button>
            <a className={buttonVariants({ variant: "outline", className: "h-11" })} href={url} target="_blank" rel="noreferrer">
              <ExternalLink />打开菜单</a>
          </div>
          {notice && <p role="status" className="text-sm">{notice}</p>}
        </>}
      </CardContent>
    </Card>
  );
}
