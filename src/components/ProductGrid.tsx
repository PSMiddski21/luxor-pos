import { usePosStore } from '../lib/store';
import { formatPence } from '../lib/types';

export function ProductGrid() {
  const addToCart = usePosStore((s) => s.addToCart);
  const stock = usePosStore((s) => s.stock);
  const products = usePosStore((s) => s.products);

  const stockFor = (productId: string) => stock.find((s) => s.productId === productId);

  const tanning = products.filter((p) => p.category === 'tanning_minutes');
  const retail = products.filter((p) => p.category === 'retail');

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Tanning minutes
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {tanning.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => addToCart(p)}
              className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-violet-400 hover:shadow transition"
            >
              <div className="font-medium text-slate-900">{p.name}</div>
              <div className="text-violet-600 font-semibold mt-1">{formatPence(p.pricePence)}</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Retail</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {retail.map((p) => {
            const item = stockFor(p.id);
            const outOfStock = item ? item.quantityOnHand <= 0 : false;
            const low = item ? item.quantityOnHand <= item.reorderLevel && item.quantityOnHand > 0 : false;
            return (
              <button
                key={p.id}
                type="button"
                disabled={outOfStock}
                onClick={() => addToCart(p)}
                className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-violet-400 hover:shadow transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-sm"
              >
                <div className="font-medium text-slate-900">{p.name}</div>
                <div className="text-violet-600 font-semibold mt-1">{formatPence(p.pricePence)}</div>
                {item && (
                  <div className={`text-xs mt-1 ${outOfStock ? 'text-red-600' : low ? 'text-amber-600' : 'text-slate-400'}`}>
                    {outOfStock ? 'Out of stock' : `${item.quantityOnHand} in stock${low ? ' — reorder' : ''}`}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
