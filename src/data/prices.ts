/** FPL stores prices in tenths of a million (now_cost 100 → £10.0m). */

export function poundsFromTenths(tenths: number): number {
  return tenths / 10
}

export function formatGbpFromTenths(tenths: number): string {
  return `£${poundsFromTenths(tenths).toFixed(1)}m`
}
