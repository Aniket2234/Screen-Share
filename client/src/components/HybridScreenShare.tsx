import React, { useState, useEffect } from 'react';
import StreamScreenShare from './StreamScreenShare';
import WorkingScreenShare from './WorkingScreenShare';
import { Monitor, Zap, Wifi, Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export default function HybridScreenShare() {
  const { theme, toggleTheme } = useTheme();
  const [useStreamIO, setUseStreamIO] = useState(true);
  const [showModeSelector, setShowModeSelector] = useState(true);

  const selectMode = (streamMode: boolean) => {
    setUseStreamIO(streamMode);
    setShowModeSelector(false);
  };

  const goBackToModeSelector = () => {
    setShowModeSelector(true);
  };

  if (showModeSelector) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 dark:from-gray-900 dark:via-black dark:to-gray-800 flex items-center justify-center p-4">
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="fixed top-4 right-4 z-50 p-3 bg-white/10 dark:bg-black/20 backdrop-blur-lg rounded-full border border-white/20 dark:border-gray-600 text-white hover:bg-white/20 dark:hover:bg-black/30 transition-colors"
        >
          {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </button>
        <div className="bg-white/10 dark:bg-black/20 backdrop-blur-lg rounded-2xl p-6 sm:p-8 max-w-2xl w-full border border-white/20 dark:border-gray-600 mx-4">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-full mb-4">
              <Monitor className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Screen Share Pro</h1>
            <p className="text-blue-200">Powered by Airavata Technologies</p>
            <p className="text-blue-300 text-sm mt-1">Choose your connection mode</p>
          </div>
          
          <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {/* Stream.io Mode */}
            <div 
              onClick={() => selectMode(true)}
              className="bg-white/5 hover:bg-white/10 border border-white/20 rounded-xl p-6 cursor-pointer transition-all hover:scale-105"
            >
              <div className="flex items-center justify-center w-12 h-12 bg-blue-500 rounded-lg mb-4">
                <Zap className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Stream.io Mode</h3>
              <p className="text-blue-200 text-sm mb-4">
                Professional video infrastructure with enterprise features
              </p>
              <div className="space-y-2">
                <div className="flex items-center text-green-300 text-sm">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                  Enterprise-grade reliability
                </div>
                <div className="flex items-center text-green-300 text-sm">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                  Advanced recording & analytics
                </div>
                <div className="flex items-center text-green-300 text-sm">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                  Global CDN infrastructure
                </div>
              </div>
            </div>

            {/* WebRTC Mode */}
            <div 
              onClick={() => selectMode(false)}
              className="bg-white/5 hover:bg-white/10 border border-white/20 rounded-xl p-6 cursor-pointer transition-all hover:scale-105"
            >
              <div className="flex items-center justify-center w-12 h-12 bg-purple-500 rounded-lg mb-4">
                <Wifi className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Direct WebRTC</h3>
              <p className="text-blue-200 text-sm mb-4">
                Direct peer-to-peer connection with bulletproof compatibility
              </p>
              <div className="space-y-2">
                <div className="flex items-center text-green-300 text-sm">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                  Universal cross-network support
                </div>
                <div className="flex items-center text-green-300 text-sm">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                  Low latency P2P streaming
                </div>
                <div className="flex items-center text-green-300 text-sm">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                  Proven stable implementation
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-blue-200 text-sm">
              Both modes include all premium features: 4K quality, 60 FPS, unlimited recording
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render selected mode with back button
  return useStreamIO ? 
    <StreamScreenShare onBackToModeSelector={goBackToModeSelector} /> : 
    <WorkingScreenShare onBackToModeSelector={goBackToModeSelector} />;
}