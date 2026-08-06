import { usePosStore } from '../lib/store';

const statusStyles: Record<string, string> = {
  available: 'bg-white border-slate-300 hover:border-violet-400',
  in_use: 'bg-amber-50 border-amber-300',
  maintenance: 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed',
};

export function BedSelector() {
  const beds = usePosStore((s) => s.beds);
  const selectedBedId = usePosStore((s) => s.selectedBedId);
  const selectBed = usePosStore((s) => s.selectBed);

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Bed</h2>
      <div className="grid grid-cols-3 gap-2">
        {beds.map((bed) => {
          const disabled = bed.status === 'maintenance';
          const selected = selectedBedId === bed.id;
          return (
            <button
              key={bed.id}
              type="button"
              disabled={disabled}
              onClick={() => selectBed(selected ? null : bed.id)}
              className={`rounded-lg border-2 px-3 py-3 text-sm font-medium transition ${
                selected ? 'border-violet-500 bg-violet-50 text-violet-700' : statusStyles[bed.status]
              }`}
            >
              {bed.label}
              {bed.status === 'maintenance' && <div className="text-xs">Out of service</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
