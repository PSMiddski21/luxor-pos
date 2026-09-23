import { useMemo, useState } from 'react';
import { usePosStore } from '../lib/store';
import { formatPence } from '../lib/types';
import { getNextNDays } from '../lib/dates';

const formatDuration = (clockIn: string, clockOut?: string) => {
  if (!clockOut) return 'In progress';
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  const hours = ms / 1000 / 60 / 60;
  return `${hours.toFixed(2)} hrs`;
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const dayLabel = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export function TimesheetsPage() {
  const staff = usePosStore((s) => s.staff);
  const shifts = usePosStore((s) => s.shifts);
  const timesheets = usePosStore((s) => s.timesheets);
  const clockIn = usePosStore((s) => s.clockIn);
  const clockOut = usePosStore((s) => s.clockOut);
  const [error, setError] = useState<string | null>(null);

  const nextDays = useMemo(() => getNextNDays(5), []);
  const staffWithUpcomingShifts = staff.filter((m) =>
    shifts.some((sh) => sh.staffId === m.id && nextDays.includes(sh.date)),
  );

  const activeEntryFor = (staffId: string) => timesheets.find((t) => t.staffId === staffId && !t.clockOut);

  const handleToggle = async (staffId: string, activeEntryId?: string) => {
    setError(null);
    try {
      if (activeEntryId) await clockOut(activeEntryId);
      else await clockIn(staffId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update clock status');
    }
  };

  const sortedEntries = [...timesheets].sort(
    (a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime(),
  );

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-lg font-semibold mb-4">Timesheets</h1>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Clock in / out</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {staff.map((member) => {
            const active = activeEntryFor(member.id);
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => handleToggle(member.id, active?.id)}
                className={`rounded-lg border-2 px-3 py-3 text-sm font-medium text-left transition ${
                  active
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 hover:border-violet-400'
                }`}
              >
                <div>{member.name}</div>
                <div className="text-xs mt-1">
                  {active ? `Clocked in ${formatTime(active.clockIn)}` : 'Clock in'}
                </div>
              </button>
            );
          })}
        </div>
        {error && <div className="text-sm text-red-600 mt-3">{error}</div>}
      </div>

      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Rota — next 5 days</h2>
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-3 py-2 font-medium sticky left-0 bg-slate-50">Staff</th>
              {nextDays.map((d) => (
                <th key={d} className="px-3 py-2 font-medium whitespace-nowrap">
                  {dayLabel(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staffWithUpcomingShifts.map((member) => (
              <tr key={member.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-800 sticky left-0 bg-white">
                  {member.name}
                </td>
                {nextDays.map((d) => {
                  const dayShifts = shifts.filter((sh) => sh.staffId === member.id && sh.date === d);
                  return (
                    <td key={d} className="px-3 py-2 align-top">
                      {dayShifts.map((sh) => (
                        <div
                          key={sh.id}
                          className="rounded-md bg-violet-50 border border-violet-200 text-violet-700 text-xs px-2 py-1 mb-1"
                        >
                          {sh.plannedStart}–{sh.plannedEnd}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
            {staffWithUpcomingShifts.length === 0 && (
              <tr>
                <td colSpan={nextDays.length + 1} className="px-4 py-6 text-center text-slate-400">
                  No shifts scheduled in the next 5 days.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Staff</th>
              <th className="px-4 py-2 font-medium">Clock in</th>
              <th className="px-4 py-2 font-medium">Clock out</th>
              <th className="px-4 py-2 font-medium">Duration</th>
              <th className="px-4 py-2 font-medium">Est. pay</th>
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map((entry) => {
              const member = staff.find((m) => m.id === entry.staffId);
              const hours = entry.clockOut
                ? (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 1000 / 60 / 60
                : 0;
              const pay = member ? Math.round(hours * member.payRatePence) : 0;
              return (
                <tr key={entry.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{member?.name}</td>
                  <td className="px-4 py-2 text-slate-500">{formatTime(entry.clockIn)}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {entry.clockOut ? formatTime(entry.clockOut) : '—'}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {formatDuration(entry.clockIn, entry.clockOut)}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {entry.clockOut ? formatPence(pay) : '—'}
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
