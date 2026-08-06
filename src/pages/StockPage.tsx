import { useState } from 'react';
import { usePosStore } from '../lib/store';
import { formatPence } from '../lib/types';

export function StockPage() {
  const stock = usePosStore((s) => s.stock);
  const products = usePosStore((s) => s.products);
  const adjustStock = usePosStore((s) => s.adjustStock);
  const setStockCount = usePosStore((s) => s.setStockCount);
  const setReorderLevel = usePosStore((s) => s.setReorderLevel);

  const [editingCount, setEditingCount] = useState<Record<string, string>>({});

  const rows = stock
    .map((item) => ({ item, product: products.find((p) => p.id === item.productId)! }))
    .sort((a, b) => a.product.name.localeCompare(b.product.name));

  const lowStockCount = rows.filter((r) => r.item.quantityOnHand <= r.item.reorderLevel).length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Stock</h1>
        {lowStockCount > 0 && (
          <span className="text-sm rounded-full bg-amber-100 text-amber-700 px-3 py-1 font-medium">
            {lowStockCount} item{lowStockCount > 1 ? 's' : ''} at or below reorder level
          </span>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Product</th>
              <th className="px-4 py-2 font-medium">Supplier</th>
              <th className="px-4 py-2 font-medium">Price</th>
              <th className="px-4 py-2 font-medium">On hand</th>
              <th className="px-4 py-2 font-medium">Reorder level</th>
              <th className="px-4 py-2 font-medium">Adjust</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, product }) => {
              const low = item.quantityOnHand <= item.reorderLevel;
              const out = item.quantityOnHand <= 0;
              const editValue = editingCount[item.productId] ?? String(item.quantityOnHand);

              return (
                <tr key={item.productId} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{product.name}</td>
                  <td className="px-4 py-2 text-slate-500">{item.supplier}</td>
                  <td className="px-4 py-2 text-slate-500">{formatPence(product.pricePence)}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`font-semibold ${out ? 'text-red-600' : low ? 'text-amber-600' : 'text-slate-800'}`}
                    >
                      {item.quantityOnHand}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min="0"
                      value={item.reorderLevel}
                      onChange={(e) => setReorderLevel(item.productId, Number(e.target.value) || 0)}
                      className="w-16 rounded-md border border-slate-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => adjustStock(item.productId, -1)}
                        className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustStock(item.productId, 1)}
                        className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
                      >
                        +
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={editValue}
                        onChange={(e) =>
                          setEditingCount((s) => ({ ...s, [item.productId]: e.target.value }))
                        }
                        onBlur={() => {
                          const n = Number(editValue);
                          if (!Number.isNaN(n)) setStockCount(item.productId, n);
                          setEditingCount((s) => {
                            const next = { ...s };
                            delete next[item.productId];
                            return next;
                          });
                        }}
                        className="w-16 rounded-md border border-slate-300 px-2 py-1"
                        title="Set exact count (stock take)"
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
