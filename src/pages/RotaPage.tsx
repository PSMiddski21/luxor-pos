import { useEffect, useMemo, useState } from 'react';
import { usePosStore } from '../lib/store';
import { getCurrentWeekDates } from '../lib/dates';
import { formatPence, type Staff } from '../lib/types';

const dayLabel = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

const roleLabel: Record<Staff['role'], string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
};

const emptyStaffForm = { name: '', role: 'staff' as Staff['role'], payRate: '0' };

export function RotaPage() {
  const staff = usePosStore((s) => s.staff);
  const shifts = usePosStore((s) => s.shifts);
  const addShift = usePosStore((s) => s.addShift);
  const removeShift = usePosStore((s) => s.removeShift);
  const createStaff = usePosStore((s) => s.createStaff);
  const updateStaff = usePosStore((s) => s.updateStaff);

  const weekDates = useMemo(() => getCurrentWeekDates(), []);

  const [form, setForm] = useState({
    staffId: '',
    date: weekDates[0],
    plannedStart: '09:00',
    plannedEnd: '17:00',
  });

  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState(emptyStaffForm);
  const [staffFormError, setStaffFormError] = useState<string | null>(null);
  const [savingStaff, setSavingStaff] = useState(false);

  useEffect(() => {
    if (!form.staffId && staff.length > 0) {
      setForm((f) => ({ ...f, staffId: staff[0].id }));
    }
  }, [staff, form.staffId]);

  const handleAdd = () => {
    if (!form.staffId || !form.date) return;
    addShift(form);
  };

  const startEditStaff = (member: Staff) => {
    setEditingStaffId(member.id);
    setStaffForm({
      name: member.name,
      role: member.role,
      payRate: (member.payRatePence / 100).toFixed(2),
    });
    setStaffFormError(null);
  };

  const cancelEditStaff = () => {
    setEditingStaffId(null);
    setStaffForm(emptyStaffForm);
    setStaffFormError(null);
  };

  const handleStaffSubmit = async () => {
    if (!staffForm.name.trim()) {
      setStaffFormError('Name is required');
      return;
    }
    const payRatePence = Math.round((parseFloat(staffForm.payRate) || 0) * 100);
    if (payRatePence < 0) {
      setStaffFormError('Pay rate must be a non-negative amount');
      return;
    }

    setSavingStaff(true);
    setStaffFormError(null);
    try {
      if (editingStaffId) {
        await updateStaff(editingStaffId, { name: staffForm.name.trim(), role: staffForm.role, payRatePence });
      } else {
        await createStaff({ name: staffForm.name.trim(), role: staffForm.role, payRatePence });
      }
      cancelEditStaff();
    } catch (e) {
      setStaffFormError(e instanceof Error ? e.message : 'Could not save staff member');
    } finally {
      setSavingStaff(false);
    }
  };

  const handleDeactivate = async (member: Staff) => {
    if (!window.confirm(`Remove ${member.name} from the active staff list?`)) return;
    await updateStaff(member.id, { name: member.name, role: member.role, active: false });
    if (editingStaffId === member.id) cancelEditStaff();
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

      <div className="bg-white rounded-xl border border-slate-200 p-4 max-w-xl mb-6">
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

      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Staff</h2>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Pay rate</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr key={member.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">{member.name}</td>
                <td className="px-4 py-2 text-slate-500">{roleLabel[member.role]}</td>
                <td className="px-4 py-2 text-slate-500">{formatPence(member.payRatePence)}/hr</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => startEditStaff(member)}
                    className="text-xs text-violet-700 underline mr-3"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeactivate(member)}
                    className="text-xs text-red-600 underline"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {staff.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No staff yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 max-w-xl">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          {editingStaffId ? 'Edit staff member' : 'Add staff member'}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <input
            value={staffForm.name}
            onChange={(e) => setStaffForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Name"
            className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={staffForm.role}
            onChange={(e) => setStaffForm((f) => ({ ...f, role: e.target.value as Staff['role'] }))}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
            <option value="owner">Owner</option>
          </select>
          <label className="text-xs text-slate-500">
            Pay rate (£/hr)
            <input
              type="number"
              min="0"
              step="0.01"
              value={staffForm.payRate}
              onChange={(e) => setStaffForm((f) => ({ ...f, payRate: e.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </label>
        </div>

        {staffFormError && <div className="mt-2 text-xs text-red-600">{staffFormError}</div>}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleStaffSubmit}
            disabled={savingStaff}
            className="rounded-lg bg-violet-600 text-white font-semibold px-4 py-2 text-sm hover:bg-violet-700 disabled:opacity-50"
          >
            {editingStaffId ? 'Save changes' : 'Add staff member'}
          </button>
          {editingStaffId && (
            <button
              type="button"
              onClick={cancelEditStaff}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
