import { ShieldCheck } from 'lucide-react';

/**
 * "✓ Verified Tutor — <module>" badge (spec section 27). Only ever rendered
 * from data returned by the backend's verified_modules list, which already
 * filters to status === 'Verified' server-side — this component never
 * decides verification itself, it only displays it.
 */
export default function VerifiedBadge({ moduleCode, size = 'md' }) {
  const sizeClasses = size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1';
  return (
    <span className={`chip bg-emerald-100 text-emerald-800 ${sizeClasses}`}>
      <ShieldCheck size={size === 'sm' ? 12 : 14} />
      Verified Tutor{moduleCode ? ` — ${moduleCode}` : ''}
    </span>
  );
}
