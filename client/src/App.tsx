import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './contexts/ThemeContext';
import HybridScreenShare from './components/HybridScreenShare'

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <HybridScreenShare />
        </div>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App