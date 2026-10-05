import type { Bill } from '@/domain/models';
import { isThermal, type AppSettings } from '@/domain/models/settings';
import { Invoice } from './Invoice';
import { ThermalReceipt } from './ThermalReceipt';

/** Renders the bill in the configured print format (thermal receipt or A4/A5 invoice). */
export function PrintableBill({ bill, settings }: { bill: Bill; settings: AppSettings }) {
  if (isThermal(settings.paperSize)) return <ThermalReceipt bill={bill} settings={settings} roll={settings.paperSize} />;
  return <Invoice bill={bill} settings={settings} compact={settings.paperSize === 'A5'} />;
}
