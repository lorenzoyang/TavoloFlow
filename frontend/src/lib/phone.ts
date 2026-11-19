export function formatPhone(value: string): string {
  const match = /^(\+?)([0-9]{4,11})([0-9]{4})$/.exec(value);
  if (!match) return value;

  const [, prefix, leading, last] = match;
  return `${prefix}${leading.replace(/\B(?=([0-9]{3})+$)/g, " ")} ${last}`;
}
