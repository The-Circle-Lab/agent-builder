"use client";

import dynamic from "next/dynamic";

// Dynamically import the main App component with SSR disabled
const App = dynamic(() => import("./components/app"), { 
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="text-gray-600">Loading...</span>
      </div>
    </div>
  )
});

export default function HomePage() {
  return <App />;
}
