import { BedSelector } from '../components/BedSelector';
import { CustomerPanel } from '../components/CustomerPanel';
import { ProductGrid } from '../components/ProductGrid';
import { CartPanel } from '../components/CartPanel';

export function PosPage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-6 items-start">
      <div className="flex flex-col gap-6 bg-white rounded-xl border border-slate-200 p-4">
        <BedSelector />
        <CustomerPanel />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <ProductGrid />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 lg:sticky lg:top-6 lg:h-[calc(100vh-8rem)]">
        <CartPanel />
      </div>
    </div>
  );
}
