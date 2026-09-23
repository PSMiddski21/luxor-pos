import { useRef, useState } from 'react';
import { usePosStore, type CustomerImportRowResult, type NewCustomer } from '../lib/store';
import { parseCsvRecords } from '../lib/csv';
import type { Customer } from '../lib/types';

const emptyForm = { name: '', phone: '', email: '', minutesBalance: '0', notes: '' };

interface ParsedRow {
  rowNumber: number;
  name: string;
  phone?: string;
  email?: string;
  minutesBalance?: number;
  notes?: string;
  error?: string;
}

// Same header shape as db/import/customers.example.csv, so a file exported
// for the one-off cutover script also works here.
function parseCustomerCsv(text: string): ParsedRow[] {
  return parseCsvRecords(text).map((r, i) => {
    const name = r.name?.trim() ?? '';
    const minutesRaw = r.minutes_balance?.trim() ?? '';
    let minutesBalance: number | undefined;
    const errors: string[] = [];

    if (!name) errors.push('missing name');
    if (minutesRaw !== '') {
      const n = Number(minutesRaw);
      if (!Number.isInteger(n) || n < 0) {
        errors.push('minutes_balance must be a non-negative integer');
      } else {
        minutesBalance = n;
      }
    }

    return {
      rowNumber: i + 2,
      name,
      phone: r.phone?.trim() || undefined,
      email: r.email?.trim() || undefined,
      minutesBalance,
      notes: r.notes?.trim() || undefined,
      error: errors.length > 0 ? errors.join('; ') : undefined,
    };
  });
}

export function CustomersPage() {
  const customers = usePosStore((s) => s.customers);
  const createCustomer = usePosStore((s) => s.createCustomer);
  const updateCustomer = usePosStore((s) => s.updateCustomer);
  const importCustomers = usePosStore((s) => s.importCustomers);

  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [importRows, setImportRows] = useState<ParsedRow[]>([]);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<CustomerImportRowResult[] | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = query
    ? customers.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : customers;

  const startEdit = (c: Customer) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      minutesBalance: String(c.minutesBalance),
      notes: c.notes ?? '',
    });
    setFormError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setFormError('Name is required');
      return;
    }
    const minutesBalance = Number(form.minutesBalance);
    if (form.minutesBalance !== '' && (!Number.isInteger(minutesBalance) || minutesBalance < 0)) {
      setFormError('Minutes balance must be a non-negative whole number');
      return;
    }

    const data: NewCustomer = {
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      minutesBalance: form.minutesBalance === '' ? 0 : minutesBalance,
      notes: form.notes.trim() || undefined,
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await updateCustomer(editingId, data);
      } else {
        await createCustomer(data);
      }
      cancelEdit();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save customer');
    } finally {
      setSaving(false);
    }
  };

  const handleFile = async (file: File) => {
    setImportError(null);
    setImportResults(null);
    setImportFileName(file.name);
    try {
      const text = await file.text();
      const rows = parseCustomerCsv(text);
      if (rows.length === 0) setImportError('No rows found in file.');
      setImportRows(rows);
    } catch {
      setImportError('Could not read that file as CSV.');
      setImportRows([]);
    }
  };

  const validImportRows = importRows.filter((r) => !r.error);

  const runImport = async () => {
    if (validImportRows.length === 0) return;
    setImporting(true);
    setImportError(null);
    try {
      const result = await importCustomers(
        validImportRows.map((r) => ({
          name: r.name,
          phone: r.phone,
          email: r.email,
          minutesBalance: r.minutesBalance,
          notes: r.notes,
        })),
      );
      setImportResults(result.results);
      setImportRows([]);
      setImportFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const clearImport = () => {
    setImportRows([]);
    setImportFileName(null);
    setImportError(null);
    setImportResults(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Customers</h1>
        <span className="text-sm text-slate-500">{customers.length} total</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
        <div className="p-3 border-b border-slate-100">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers…"
            className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Balance</th>
              <th className="px-4 py-2 font-medium">Notes</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">{c.name}</td>
                <td className="px-4 py-2 text-slate-500">{c.phone}</td>
                <td className="px-4 py-2 text-slate-500">{c.email}</td>
                <td className="px-4 py-2 text-slate-800">{c.minutesBalance} min</td>
                <td className="px-4 py-2 text-slate-500 max-w-xs truncate">{c.notes}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    className="text-xs text-violet-700 underline"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No customers match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            {editingId ? 'Edit customer' : 'Add customer'}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Name"
              className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="Phone"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="Email"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <label className="col-span-2 text-xs text-slate-500">
              Minutes balance
              <input
                type="number"
                min="0"
                value={form.minutesBalance}
                onChange={(e) => setForm((f) => ({ ...f, minutesBalance: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Notes"
              rows={2}
              className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {formError && <div className="mt-2 text-xs text-red-600">{formError}</div>}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-lg bg-violet-600 text-white font-semibold px-4 py-2 text-sm hover:bg-violet-700 disabled:opacity-50"
            >
              {editingId ? 'Save changes' : 'Add customer'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1">Bulk import</h2>
          <p className="text-xs text-slate-500 mb-3">
            CSV with headers <code className="bg-slate-100 px-1 rounded">name,phone,email,minutes_balance,notes</code>
            . Existing customers matched by name are updated; new names are added.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="text-sm"
          />

          {importError && <div className="mt-2 text-xs text-red-600">{importError}</div>}

          {importRows.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-slate-500 mb-2">
                {importFileName} — {validImportRows.length} of {importRows.length} row(s) valid
              </div>
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 text-left sticky top-0">
                    <tr>
                      <th className="px-2 py-1 font-medium">Row</th>
                      <th className="px-2 py-1 font-medium">Name</th>
                      <th className="px-2 py-1 font-medium">Balance</th>
                      <th className="px-2 py-1 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((r) => (
                      <tr key={r.rowNumber} className="border-t border-slate-100">
                        <td className="px-2 py-1 text-slate-400">{r.rowNumber}</td>
                        <td className="px-2 py-1 text-slate-800">{r.name || '—'}</td>
                        <td className="px-2 py-1 text-slate-500">{r.minutesBalance ?? '—'}</td>
                        <td className="px-2 py-1">
                          {r.error ? (
                            <span className="text-red-600">{r.error}</span>
                          ) : (
                            <span className="text-emerald-600">ok</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={runImport}
                  disabled={validImportRows.length === 0 || importing}
                  className="rounded-lg bg-violet-600 text-white font-semibold px-4 py-2 text-sm hover:bg-violet-700 disabled:opacity-50"
                >
                  {importing ? 'Importing…' : `Import ${validImportRows.length} customer(s)`}
                </button>
                <button
                  type="button"
                  onClick={clearImport}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {importResults && (
            <div className="mt-3 text-sm">
              <div className="text-emerald-700 font-medium mb-1">
                {importResults.filter((r) => r.action === 'created').length} created,{' '}
                {importResults.filter((r) => r.action === 'updated').length} updated
                {importResults.some((r) => r.action === 'error') && (
                  <span className="text-red-600">
                    , {importResults.filter((r) => r.action === 'error').length} failed
                  </span>
                )}
              </div>
              {importResults
                .filter((r) => r.action === 'error')
                .map((r) => (
                  <div key={r.row} className="text-xs text-red-600">
                    Row {r.row} ({r.name || 'unnamed'}): {r.error}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
