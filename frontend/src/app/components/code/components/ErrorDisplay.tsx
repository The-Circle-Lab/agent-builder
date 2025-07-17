interface ErrorDisplayProps {
  error: string;
  onDismiss: () => void;
}

export default function ErrorDisplay({ error, onDismiss }: ErrorDisplayProps) {
  if (!error) return null;

  return (
    <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-start space-x-2">
        <svg className="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="flex-1">
          <p className="text-red-800">{error}</p>
          <button
            onClick={onDismiss}
            className="mt-2 text-sm text-red-600 hover:text-red-700 underline"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
} 
