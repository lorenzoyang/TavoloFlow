import { PRODUCT_NAME } from "@/lib/brand";
import { LANGUAGES } from "@/lib/language";
import { messages } from "@/features/public-menu/messages";

// A6 at 300 dpi (10.5 × 14.8 cm), sized for an acrylic table stand.
const WIDTH = 1240;
const HEIGHT = 1748;
const CREAM = "#FBF8F3";
const TERRACOTTA = "#B9532C";
const ESPRESSO = "#2B211C";
const MUTED = "#6F625A";
const SANS = '"Geist Variable", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const DISPLAY = `"Fraunces Variable", ${SANS}`;

// Greedy wrapping by words, or by characters for scripts without spaces; the last line gets an ellipsis.
function wrap(context: CanvasRenderingContext2D, text: string, width: number, maxLines: number) {
  const segments = [...new Intl.Segmenter(undefined, { granularity: "word" }).segment(text)].map(
    (part) => part.segment,
  );
  const lines: string[] = [];
  let line = "";
  for (const segment of segments) {
    const pieces = context.measureText(segment).width > width ? [...segment] : [segment];
    for (const piece of pieces) {
      if (line && context.measureText(line + piece).width > width) {
        lines.push(line.trimEnd());
        line = piece.trimStart();
      } else line += piece;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && context.measureText(`${last}…`).width > width) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

// The largest size (down to a floor) at which the text fits on one line.
function fit(
  context: CanvasRenderingContext2D,
  text: string,
  font: (size: number) => string,
  width: number,
  size: number,
) {
  context.font = font(size);
  while (size > 64 && context.measureText(text).width > width) {
    size -= 8;
    context.font = font(size);
  }
  return size;
}

// A printable PNG: restaurant, table, the QR code and a trilingual "scan to order".
export async function renderTableCard({
  qrDataUrl,
  restaurantName,
  tableLabel,
}: {
  qrDataUrl: string;
  restaurantName: string;
  tableLabel: string;
}): Promise<string> {
  await Promise.all([
    document.fonts.load(`600 72px ${DISPLAY}`),
    document.fonts.load(`700 120px ${SANS}`),
  ]);
  const qr = new Image();
  qr.src = qrDataUrl;
  await qr.decode();
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  const center = WIDTH / 2;
  const inner = WIDTH - 200;
  context.fillStyle = CREAM;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = TERRACOTTA;
  context.fillRect(0, 0, WIDTH, 28);
  context.fillRect(0, HEIGHT - 28, WIDTH, 28);
  context.textAlign = "center";
  context.textBaseline = "alphabetic";

  context.fillStyle = ESPRESSO;
  context.font = `600 72px ${DISPLAY}`;
  const nameLines = wrap(context, restaurantName, inner, 2);
  nameLines.forEach((line, index) => context.fillText(line, center, 170 + index * 84));

  context.fillStyle = MUTED;
  context.font = `500 40px ${SANS}`;
  context.fillText(LANGUAGES.map((language) => messages[language].table).join(" · "), center, 350);

  const tableFont = (size: number) => `700 ${size}px ${SANS}`;
  const size = fit(context, tableLabel, tableFont, inner, 180);
  context.fillStyle = TERRACOTTA;
  context.font = tableFont(size);
  context.fillText(tableLabel, center, 380 + size * 0.8);

  const box = 760;
  const boxX = center - box / 2;
  const boxY = 600;
  context.fillStyle = "#FFFFFF";
  context.strokeStyle = "#E8DFD3";
  context.lineWidth = 4;
  context.beginPath();
  context.roundRect(boxX, boxY, box, box, 48);
  context.fill();
  context.stroke();
  context.imageSmoothingEnabled = false;
  context.drawImage(qr, boxX + 30, boxY + 30, box - 60, box - 60);

  // The first language reads largest; the others follow, each phrase kept whole on its line.
  const [first, ...others] = LANGUAGES.map((language) => messages[language].scanToOrder);
  context.fillStyle = ESPRESSO;
  context.font = `700 60px ${SANS}`;
  context.fillText(first, center, boxY + box + 100);
  context.font = `500 40px ${SANS}`;
  const rest = others.join(" · ");
  const lines = context.measureText(rest).width > inner ? others : [rest];
  lines.forEach((line, index) => context.fillText(line, center, boxY + box + 170 + index * 52));
  context.fillStyle = MUTED;
  context.font = `600 32px ${DISPLAY}`;
  context.fillText(PRODUCT_NAME, center, HEIGHT - 100);
  return canvas.toDataURL("image/png");
}
