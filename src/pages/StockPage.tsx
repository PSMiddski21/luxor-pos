import { useState } from 'react';
import { usePosStore } from '../lib/store';
import { formatPence, type Product } from '../lib/types';

const emptyForm = { name: '', price: '', costPrice: '', quantityOnHand: '0', reorderLevel: '0', supplier: '' };
const emptyTanningForm = { name: '', price: '', minutes: '' };

const toPence = (value: string): number | undefined => {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
};

export function StockPage() {
  const stock = usePosStore((s) => s.stock);
  const products = usePosStore((s) => s.products);
  const addStockItem = usePosStore((s) => s.addStockItem);
  const adjustStock = usePosStore((s) => s.adjustStock);
  const setStockCount = usePosStore((s) => s.setStockCount);
  const setReorderLevel = usePosStore((s) => s.setReorderLevel);
  const setCostPrice = usePosStore((s) => s.setCostPrice);
  const createTanningProduct = usePosStore((s) => s.createTanningProduct);
  const updateProduct = usePosStore((s) => s.updateProduct);

  const [editingCount, setEditingCount] = useState<Record<string, string>>({});
  const [editingCost, setEditingCost] = useState<Record<string, string>>({});
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const tanningProducts = products
    .filter((p) => p.category === 'tanning_minutes')
    .sort((a, b) => (a.minutes ?? 0) - (b.minutes ?? 0));

  const [editingTanningId, setEditingTanningId] = useState<string | null>(null);
  const [tanningForm, setTanningForm] = useState(emptyTanningForm);
  const [tanningFormError, setTanningFormError] = useState<string | null>(null);
  const [savingTanning, setSavingTanning] = useState(false);

  const startEditTanning = (product: Product) => {
    setEditingTanningId(product.id);
    setTanningForm({
      name: product.name,
      price: (product.pricePence / 100).toFixed(2),
      minutes: String(product.minutes ?? ''),
    });
    setTanningFormError(null);
  };

  const cancelEditTanning = () => {
    setEditingTanningId(null);
    setTanningForm(emptyTanningForm);
    setTanningFormError(null);
  };

  const handleTanningSubmit = async () => {
    if (!tanningForm.name.trim()) {
      setTanningFormError('Name is required');
      return;
    }
    const pricePence = toPence(tanningForm.price);
    if (pricePence === undefined) {
      setTanningFormError('Price must be a non-negative number');
      return;
    }
    const minutes = Number(tanningForm.minutes);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      setTanningFormError('Minutes must be a positive whole number');
      return;
    }

    setSavingTanning(true);
    setTanningFormError(null);
    try {
      if (editingTanningId) {
        await updateProduct(editingTanningId, { name: tanningForm.name.trim(), pricePence, minutes });
      } else {
        await createTanningProduct({ name: tanningForm.name.trim(), pricePence, minutes });
      }
      cancelEditTanning();
    } catch (e) {
      setTanningFormError(e instanceof Error ? e.message : 'Could not save tanning package');
    } finally {
      setSavingTanning(false);
    }
  };

  const handleDeactivateTanning = async (product: Product) => {
    if (!window.confirm(`Remove "${product.name}" from tanning packages?`)) return;
    await updateProduct(product.id, { active: false });
    if (editingTanningId === product.id) cancelEditTanning();
  };

  const rows = stock
    .map((item) => ({ item, product: products.find((p) => p.id === item.productId)! }))
    .sort((a, b) => a.product.name.localeCompare(b.product.name));

  const lowStockCount = rows.filter((r) => r.item.quantityOnHand <= r.item.reorderLevel).length;

  const commitCostPrice = (productId: string, raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') {
      setCostPrice(productId, null);
    } else {
      const pence = toPence(trimmed);
      if (pence !== undefined) setCostPrice(productId, pence);
    }
    setEditingCost((s) => {
      const next = { ...s };
      delete next[productId];
      return next;
    });
  };

  const handleAddItem = async () => {
    setFormError(null);
    if (!form.name.trim()) {
      setFormError('Name is required');
      return;
    }
    const pricePence = toPence(form.price);
    if (pricePence === undefined) {
      setFormError('Price must be a non-negative number');
      return;
    }
    const costPricePence = form.costPrice.trim() === '' ? undefined : toPence(form.costPrice);
    if (form.costPrice.trim() !== '' && costPricePence === undefined) {
      setFormError('Cost price must be a non-negative number');
      return;
    }

    setSaving(true);
    try {
      await addStockItem({
        name: form.name.trim(),
        pricePence,
        costPricePence,
        quantityOnHand: Number(form.quantityOnHand) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
        supplier: form.supplier.trim() || undefined,
      });
      setForm(emptyForm);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not add item');
    } finally {
      setSaving(false);
    }
  };

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

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Product</th>
              <th className="px-4 py-2 font-medium">Supplier</th>
              <th className="px-4 py-2 font-medium">Price</th>
              <th className="px-4 py-2 font-medium">Cost price</th>
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
              const editCostValue =
                editingCost[item.productId] ??
                (product.costPricePence !== undefined ? (product.costPricePence / 100).toFixed(2) : '');

              return (
                <tr key={item.productId} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{product.name}</td>
                  <td className="px-4 py-2 text-slate-500">{item.supplier}</td>
                  <td className="px-4 py-2 text-slate-500">{formatPence(product.pricePence)}</td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="—"
                      value={editCostValue}
                      onChange={(e) => setEditingCost((s) => ({ ...s, [item.productId]: e.target.value }))}
                      onBlur={() => commitCostPrice(item.productId, editCostValue)}
                      className="w-20 rounded-md border border-slate-300 px-2 py-1"
                      title="What we pay for this item"
                    />
                  </td>
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

      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Tanning minutes</h2>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Minutes</th>
              <th className="px-4 py-2 font-medium">Price</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {tanningProducts.map((product) => (
              <tr key={product.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">{product.name}</td>
                <td className="px-4 py-2 text-slate-500">{product.minutes} min</td>
                <td className="px-4 py-2 text-slate-500">{formatPence(product.pricePence)}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => startEditTanning(product)}
                    className="text-xs text-violet-700 underline mr-3"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeactivateTanning(product)}
                    className="text-xs text-red-600 underline"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {tanningProducts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No tanning packages yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 max-w-xl mb-6">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          {editingTanningId ? 'Edit tanning package' : 'Add tanning package'}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <input
            value={tanningForm.name}
            onChange={(e) => setTanningForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Name"
            className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <label className="text-xs text-slate-500">
            Minutes
            <input
              type="number"
              min="1"
              step="5"
              value={tanningForm.minutes}
              onChange={(e) => setTanningForm((f) => ({ ...f, minutes: e.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="text-xs text-slate-500">
            Price (£)
            <input
              type="number"
              min="0"
              step="0.01"
              value={tanningForm.price}
              onChange={(e) => setTanningForm((f) => ({ ...f, price: e.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
        </div>

        {tanningFormError && <div className="mt-2 text-xs text-red-600">{tanningFormError}</div>}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleTanningSubmit}
            disabled={savingTanning}
            className="rounded-lg bg-violet-600 text-white font-semibold px-4 py-2 text-sm hover:bg-violet-700 disabled:opacity-50"
          >
            {editingTanningId ? 'Save changes' : 'Add tanning package'}
          </button>
          {editingTanningId && (
            <button
              type="button"
              onClick={cancelEditTanning}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 max-w-xl">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Add item</h2>
        <div className="grid grid-cols-2 gap-3">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Name"
            className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <label className="text-xs text-slate-500">
            Price (£)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="text-xs text-slate-500">
            Cost price (£)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.costPrice}
              onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
              placeholder="Optional"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="text-xs text-slate-500">
            Starting quantity
            <input
              type="number"
              min="0"
              value={form.quantityOnHand}
              onChange={(e) => setForm((f) => ({ ...f, quantityOnHand: e.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="text-xs text-slate-500">
            Reorder level
            <input
              type="number"
              min="0"
              value={form.reorderLevel}
              onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <input
            value={form.supplier}
            onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
            placeholder="Supplier"
            className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {formError && <div className="mt-2 text-xs text-red-600">{formError}</div>}

        <button
          type="button"
          onClick={handleAddItem}
          disabled={saving}
          className="mt-3 rounded-lg bg-violet-600 text-white font-semibold px-4 py-2 text-sm hover:bg-violet-700 disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add item'}
        </button>
      </div>
    </div>
  );
}
