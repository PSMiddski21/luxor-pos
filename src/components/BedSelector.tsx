import { useEffect, useState } from 'react';
import { usePosStore } from '../lib/store';

const statusStyles: Record<string, string> = {
  available: 'bg-white border-slate-300 hover:border-violet-400',
  in_use: 'bg-amber-50 border-amber-300',
  maintenance: 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed',
};

const BED_POLL_MS = 15_000;
const TICK_MS = 30_000;

function formatRemaining(busyUntil: string): string {
  const minutesLeft = Math.ceil((new Date(busyUntil).getTime() - Date.now()) / 60_000);
  return minutesLeft <= 0 ? 'Freeing up…' : `Free in ${minutesLeft} min`;
}

export function BedSelector() {
  const beds = usePosStore((s) => s.beds);
  const selectedBedId = usePosStore((s) => s.selectedBedId);
  const selectBed = usePosStore((s) => s.selectBed);
  const setBedStatus = usePosStore((s) => s.setBedStatus);
  const refreshBeds = usePosStore((s) => s.refreshBeds);
  const [error, setError] = useState<string | null>(null);

  // Beds free themselves server-side once a session's time is up (no cron —
  // it's checked lazily whenever /beds is read). Poll so this screen
  // reflects that without staff needing to reload, and re-render on a timer
  // so "Free in N min" counts down even between polls.
  useEffect(() => {
    const poll = setInterval(() => {
      refreshBeds().catch(() => {});
    }, BED_POLL_MS);
    return () => clearInterval(poll);
  }, [refreshBeds]);

  const [, setTick] = useState(0);
  useEffect(() => {
    const tick = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const toggleOperational = async (bedId: string, status: 'available' | 'in_use' | 'maintenance') => {
    setError(null);
    try {
      await setBedStatus(bedId, status === 'maintenance' ? 'available' : 'maintenance');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update bed');
    }
  };

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Bed</h2>
      <div className="grid grid-cols-2 gap-2">
        {beds.map((bed) => {
          const disabled = bed.status === 'maintenance';
          const selected = selectedBedId === bed.id;
          return (
            <div key={bed.id} className="relative">
              <button
                type="button"
                disabled={disabled}
                onClick={() => selectBed(selected ? null : bed.id)}
                className={`w-full rounded-lg border-2 px-3 py-3 text-sm font-medium transition ${
                  selected ? 'border-violet-500 bg-violet-50 text-violet-700' : statusStyles[bed.status]
                }`}
              >
                {bed.label}
                {bed.status === 'maintenance' && <div className="text-xs">Out of service</div>}
                {bed.status === 'in_use' && bed.busyUntil && (
                  <div className="text-xs font-normal text-amber-700">{formatRemaining(bed.busyUntil)}</div>
                )}
              </button>
              {bed.status !== 'in_use' && (
                <button
                  type="button"
                  onClick={() => toggleOperational(bed.id, bed.status)}
                  title={bed.status === 'maintenance' ? 'Mark available' : 'Mark out of service'}
                  className="absolute top-1 right-1 rounded px-1 py-0.5 text-[10px] leading-none text-slate-400 hover:text-violet-600 hover:bg-white"
                >
                  {bed.status === 'maintenance' ? 'Enable' : 'Disable'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
    </div>
  );
}
