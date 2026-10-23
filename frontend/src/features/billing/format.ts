export const billTime = (value: string | number, timeZone = "Europe/Rome") => new Date(value).toLocaleString("zh-CN", { timeZone });
