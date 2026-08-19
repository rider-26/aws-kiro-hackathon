import { Clock, CheckCircle2, XCircle, Ban, Award, PlayCircle, Search, ShieldCheck } from 'lucide-react';

const MAP = {
  Pending: { cls: 'chip-pending', icon: Clock },
  Accepted: { cls: 'chip-accepted', icon: CheckCircle2 },
  Confirmed: { cls: 'chip-accepted', icon: CheckCircle2 },
  Declined: { cls: 'chip-declined', icon: XCircle },
  Cancelled: { cls: 'chip-cancelled', icon: Ban },
  Completed: { cls: 'chip-completed', icon: Award },
  Upcoming: { cls: 'chip-pending', icon: Clock },
  'In Progress': { cls: 'bg-blue-100 text-blue-700', icon: PlayCircle },
  // Report lifecycle (spec section 26).
  'Under Review': { cls: 'bg-blue-100 text-blue-700', icon: Search },
  Resolved: { cls: 'chip-accepted', icon: ShieldCheck },
  Dismissed: { cls: 'chip-cancelled', icon: XCircle },
  // Account states surfaced in the moderation queue.
  Active: { cls: 'chip-accepted', icon: CheckCircle2 },
  Suspended: { cls: 'chip-declined', icon: Ban },
};

export default function StatusChip({ status }) {
  const entry = MAP[status] || { cls: 'chip-cancelled', icon: Clock };
  const Icon = entry.icon;
  return (
    <span className={`chip ${entry.cls}`}>
      <Icon size={12} />
      {status}
    </span>
  );
}
