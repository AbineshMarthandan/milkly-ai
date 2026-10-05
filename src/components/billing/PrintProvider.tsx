import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import type { Bill } from '@/domain/models';
import { DEFAULT_APP_SETTINGS, isThermal, type PaperSize } from '@/domain/models/settings';
import { useAppSettings } from '@/hooks/useAppSettings';
import { PrintableBill } from './PrintableBill';

type PrintFn = (bill: Bill) => void;
const PrintContext = createContext<PrintFn | null>(null);

const PX_PER_MM = 96 / 25.4;
const ROLL_WIDTH_MM = { THERMAL_80: 80, THERMAL_58: 58 } as const;

/**
 * `@page` rule for the chosen format. Thermal rolls get an exact page length
 * measured from the rendered receipt, so the printer feeds exactly one
 * receipt instead of a fixed A4-length strip.
 */
function pageRule(paperSize: PaperSize, contentHeightPx: number): string {
  if (isThermal(paperSize)) {
    const lengthMm = Math.ceil(contentHeightPx / PX_PER_MM) + 4;
    return `@page { size: ${ROLL_WIDTH_MM[paperSize]}mm ${lengthMm}mm; margin: 0; } html, body { width: ${ROLL_WIDTH_MM[paperSize]}mm; }`;
  }
  return `@page { size: ${paperSize} portrait; margin: ${paperSize === 'A5' ? '8mm' : '12mm'}; }`;
}

/**
 * Prints a bill through the browser's print dialog using the printer's own
 * driver (works with USB/Bluetooth thermal printers that are installed in the
 * OS). Printing is a pure view operation: it never saves, numbers or
 * finalizes anything.
 */
export function PrintProvider({ children }: { children: ReactNode }) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [pageCss, setPageCss] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const { data } = useAppSettings();
  const settings = data?.data ?? DEFAULT_APP_SETTINGS;
  const target = typeof document !== 'undefined' ? document.getElementById('print-root') : null;

  const print = useCallback<PrintFn>((next) => setBill(next), []);

  useEffect(() => {
    if (!bill) return;
    const clear = () => {
      setBill(null);
      setPageCss('');
    };
    window.addEventListener('afterprint', clear, { once: true });
    // Frame 1: React has committed the portal → measure and set @page.
    // Frame 2: the browser has applied it → open the print dialog.
    let second = 0;
    const first = requestAnimationFrame(() => {
      setPageCss(pageRule(settings.paperSize, contentRef.current?.offsetHeight ?? 0));
      second = requestAnimationFrame(() => {
        try {
          window.print();
        } catch {
          toast.error('Printing is not available in this browser.');
          clear();
        }
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      window.removeEventListener('afterprint', clear);
    };
  }, [bill, settings.paperSize]);

  return (
    <PrintContext.Provider value={print}>
      {children}
      {bill &&
        target &&
        createPortal(
          <>
            {pageCss && <style>{pageCss}</style>}
            <div ref={contentRef} className={isThermal(settings.paperSize) ? 'mx-auto w-fit' : 'mx-auto max-w-[190mm]'}>
              <PrintableBill bill={bill} settings={settings} />
            </div>
          </>,
          target,
        )}
    </PrintContext.Provider>
  );
}

export function usePrintBill(): PrintFn {
  const print = useContext(PrintContext);
  if (!print) throw new Error('usePrintBill must be used inside <PrintProvider>');
  return print;
}
