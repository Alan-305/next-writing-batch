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

const PAGE2_TAIL_CLASS = "student-result-print-tail--page2";

function readHeight(el: HTMLElement): number {
  return Math.max(el.scrollHeight, el.getBoundingClientRect().height);
}

function readOffsetTopWithin(el: HTMLElement, root: HTMLElement): number {
  const zoom = Number.parseFloat(root.style.zoom || "1") || 1;
  const elTop = el.getBoundingClientRect().top;
  const rootTop = root.getBoundingClientRect().top;
  return (elTop - rootTop) / zoom;
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

function readPrintHeight(root: HTMLElement): number {
  const tail = root.querySelector(".student-result-print-tail") as HTMLElement | null;
  if (tail?.classList.contains(PAGE2_TAIL_CLASS)) {
    const essay = root.querySelector(".student-result-card--essay") as HTMLElement | null;
    if (essay) {
      const pageHeight = printableAreaPx(1).height;
      const essayTop = readOffsetTopWithin(essay, root);
      const pagesBefore = Math.max(1, Math.ceil(essayTop / pageHeight));
      return pagesBefore * pageHeight + readHeight(tail);
    }
  }
  return readHeight(root);
}

function clearPageLayout(root: HTMLElement): void {
  root.querySelector(".student-result-print-tail")?.classList.remove(PAGE2_TAIL_CLASS);
}

/**
 * 完成版＋QR が1ページ目の末尾で切れる場合、まとめて2ページ目先頭へ送る。
 */
function applyPageLayout(root: HTMLElement): void {
  const tail = root.querySelector(".student-result-print-tail") as HTMLElement | null;
  const essay = root.querySelector(".student-result-card--essay") as HTMLElement | null;
  if (!tail || !essay) return;

  tail.classList.remove(PAGE2_TAIL_CLASS);

  const pageHeight = printableAreaPx(1).height;
  const essayTop = readOffsetTopWithin(essay, root);
  const essayHeight = readHeight(essay);
  const tailHeight = readHeight(tail);

  const roomLeftOnPage1 = pageHeight - essayTop;
  const essayWouldSplitOnPage1 =
    essayTop > 0 && essayTop < pageHeight && essayHeight > roomLeftOnPage1 + 2;
  const tailWouldSpanPages =
    essayTop > 0 && essayTop < pageHeight && essayTop + tailHeight > pageHeight + 2;
  const tailFitsOnOnePage = tailHeight <= pageHeight * 1.02;

  if ((essayWouldSplitOnPage1 || tailWouldSpanPages) && tailFitsOnOnePage) {
    tail.classList.add(PAGE2_TAIL_CLASS);
  }
}

function fitScaleOnly(root: HTMLElement, maxPages: number): void {
  clearScale(root);
  const maxHeight = printableAreaPx(maxPages).height;
  const naturalHeight = readPrintHeight(root);
  if (naturalHeight <= maxHeight || naturalHeight <= 0) return;

  let lo = MIN_PRINT_SCALE;
  let hi = 1;
  let best = MIN_PRINT_SCALE;

  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) / 2;
    applyScale(root, mid);
    const h = readPrintHeight(root);
    if (h <= maxHeight) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  applyScale(root, best * 0.98);
}

/**
 * 解説・完成版の長さに応じて縮小率を決める（最大 maxPages 枚の A4 に収める）。
 * beforeprint 内で呼ぶ想定。
 */
export function fitStudentResultPrint(root: HTMLElement, maxPages = STUDENT_RESULT_PRINT_MAX_PAGES): void {
  clearPageLayout(root);
  clearScale(root);

  fitScaleOnly(root, maxPages);
  applyPageLayout(root);

  const maxHeight = printableAreaPx(maxPages).height;
  if (readPrintHeight(root) > maxHeight) {
    fitScaleOnly(root, maxPages);
    applyPageLayout(root);
  }
}

export function resetStudentResultPrint(root: HTMLElement): void {
  clearScale(root);
  clearPageLayout(root);
}
