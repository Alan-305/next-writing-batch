/** ブラウザ印刷で A4 用紙に収めるための寸法・スケール計算 */

const MM_PER_INCH = 25.4;
const CSS_DPI = 96;
const A4_HEIGHT_MM = 297;
const A4_WIDTH_MM = 210;
/** @page margin と実印刷の余白を踏まえたおおよその値 */
const PAGE_MARGIN_MM = 10;

export const STUDENT_RESULT_PRINT_MAX_PAGES = 2;

export function printableAreaPx(pages: number): { width: number; height: number } {
  const mmToPx = (mm: number) => (mm * CSS_DPI) / MM_PER_INCH;
  return {
    width: mmToPx(A4_WIDTH_MM - PAGE_MARGIN_MM * 2),
    height: mmToPx((A4_HEIGHT_MM - PAGE_MARGIN_MM * 2) * pages),
  };
}

const MIN_PRINT_SCALE = 0.52;

function readHeight(el: HTMLElement): number {
  return Math.max(el.scrollHeight, el.getBoundingClientRect().height);
}

function supportsZoom(el: HTMLElement): boolean {
  return "zoom" in el.style;
}

function applyScale(root: HTMLElement, scale: number): void {
  if (supportsZoom(root)) {
    root.style.zoom = String(scale);
    root.style.removeProperty("--print-fit-scale");
  } else {
    root.style.removeProperty("zoom");
    root.style.setProperty("--print-fit-scale", String(scale));
  }
}

function clearScale(root: HTMLElement): void {
  root.style.removeProperty("zoom");
  root.style.removeProperty("--print-fit-scale");
}

/**
 * 解説・完成版の長さに応じて縮小率を決める（最大 maxPages 枚の A4 に収める）。
 * beforeprint 内で呼ぶ想定。
 */
export function fitStudentResultPrint(root: HTMLElement, maxPages = STUDENT_RESULT_PRINT_MAX_PAGES): void {
  clearScale(root);
  const maxHeight = printableAreaPx(maxPages).height;
  const naturalHeight = readHeight(root);
  if (naturalHeight <= maxHeight || naturalHeight <= 0) return;

  let lo = MIN_PRINT_SCALE;
  let hi = 1;
  let best = MIN_PRINT_SCALE;

  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) / 2;
    applyScale(root, mid);
    const h = readHeight(root);
    if (h <= maxHeight) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  applyScale(root, best * 0.98);
}

export function resetStudentResultPrint(root: HTMLElement): void {
  clearScale(root);
}
