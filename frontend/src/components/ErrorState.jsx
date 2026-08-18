import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Consistent error state used across pages that fetch data, per spec
 * section 34 (check error states).
 */
export default function ErrorState({ message = 'Something went wrong. Please try again.', onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-100 bg-red-50 py-10 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mb-3">
        <AlertTriangle size={22} />
      </div>
      <p className="text-sm font-medium text-red-700">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary mt-4">
          <RefreshCw size={14} /> Try again
        </button>
      )}
    </div>
  );
}
