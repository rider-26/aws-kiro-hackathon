const TONES = {
  Strong: { bar: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-800' },
  Developing: { bar: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800' },
  'Needs Improvement': { bar: 'bg-red-500', chip: 'bg-red-100 text-red-700' },
};

/**
 * Per-topic score bars used on the quiz diagnosis report and the progress page.
 * Colour encodes the spec's three classification bands.
 */
export default function TopicBreakdownBars({ items, showCounts = true }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-slate-400">No topic data yet.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const tone = TONES[item.status] || TONES.Developing;
        const pct = item.score_percentage ?? 0;
        return (
          <div key={item.topic}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-slate-700 truncate">{item.topic}</span>
                <span className={`chip text-[10px] ${tone.chip}`}>{item.status}</span>
              </div>
              <span className="text-sm font-semibold text-slate-700 shrink-0">
                {pct}%
                {showCounts && item.total !== undefined && (
                  <span className="ml-1 text-xs font-normal text-slate-400">
                    ({item.correct}/{item.total})
                  </span>
                )}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className={`h-2 rounded-full ${tone.bar} transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
