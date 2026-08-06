import { useEffect, useMemo, useState } from 'react';
import { usePosStore } from '../lib/store';
import { getCurrentWeekDates } from '../lib/dates';

const dayLabel = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export function RotaPage() {
  const staff = usePosStore((s) => s.staff);
  const shifts = usePosStore((s) => s.shifts);
  const addShift = usePosStore((s) => s.addShift);
  const removeShift = usePosStore((s) => s.removeShift);

  const weekDates = useMemo(() => getCurrentWeekDates(), []);

  const [form, setForm] = useState({
    staffId: '',
    date: weekDates[0],
    plannedStart: '09:00',
    plannedEnd: '17:00',
  });

  useEffect(() => {
    if (!form.staffId && staff.length > 0) {
      setForm((f) => ({ ...f, staffId: staff[0].id }));
    }
  }, [staff, form.staffId]);

  const handleAdd = () => {
    if (!form.staffId || !form.date) return;
    addShift(form);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold mb-4">Rota</h1>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-3 py-2 font-medium sticky left-0 bg-slate-50">Staff</th>
              {weekDates.map((d) => (
                <th key={d} className="px-3 py-2 font-medium whitespace-nowrap">
                  {dayLabel(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr key={member.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-800 sticky left-0 bg-white">
                  {member.name}
                </td>
                {weekDates.map((d) => {
                  const dayShifts = shifts.filter((sh) => sh.staffId === member.id && sh.date === d);
                  return (
                    <td key={d} className="px-3 py-2 align-top">
                      {dayShifts.map((sh) => (
                        <div
                          key={sh.id}
                          className="rounded-md bg-violet-50 border border-violet-200 text-violet-700 text-xs px-2 py-1 mb-1 flex items-center justify-between gap-2"
                        >
                          <span>
                            {sh.plannedStart}–{sh.plannedEnd}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeShift(sh.id)}
                            className="text-violet-400 hover:text-violet-700"
                            aria-label="Remove shift"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 max-w-xl">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Add shift</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <select
            value={form.staffId}
            onChange={(e) => setForm((f) => ({ ...f, staffId: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm col-span-2"
          >
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm col-span-2"
          >
            {weekDates.map((d) => (
              <option key={d} value={d}>
                {dayLabel(d)}
              </option>
            ))}
          </select>
          <input
            type="time"
            value={form.plannedStart}
            onChange={(e) => setForm((f) => ({ ...f, plannedStart: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
          />
          <input
            type="time"
            value={form.plannedEnd}
            onChange={(e) => setForm((f) => ({ ...f, plannedEnd: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="mt-3 rounded-lg bg-violet-600 text-white font-semibold px-4 py-2 text-sm hover:bg-violet-700"
        >
          Add shift
        </button>
      </div>
    </div>
  );
}
