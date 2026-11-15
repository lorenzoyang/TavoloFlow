import QRCode from "qrcode";

// Black on white at print size: table cards and the restaurant's online link use the same QR image.
export const qrPng = (url: string) =>
  QRCode.toDataURL(url, {
    width: 1024,
    margin: 4,
    errorCorrectionLevel: "M",
    type: "image/png",
    color: { dark: "#000000ff", light: "#ffffffff" },
  });
