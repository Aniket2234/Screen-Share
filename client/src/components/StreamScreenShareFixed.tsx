import React, { useState, useEffect, useRef } from 'react';
import { 
  Monitor, 
  Square, 
  Users, 
  MessageCircle, 
  Send,
  Copy,
  Check,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Settings,
  Download,
  Play,
  Pause,
  RotateCcw,
  Maximize,
  Minimize,
  Sun,
  Moon,
  ArrowLeft
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useTheme } from '../contexts/ThemeContext';

import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  CallControls,
  SpeakerLayout,
  StreamTheme,
  CallingState,
  useCallStateHooks,
  useCall,
  ScreenShareButton,
  RecordCallButton,
  CallStatsButton,
} from "@stream-io/video-react-sdk";

// Stream.io styles imported in index.css

// Stream API key will be fetched from backend

interface Message {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
}

interface Participant {
  id: string;
  name: string;
  isPresenting: boolean;
  connectionStatus?: 'connecting' | 'connected' | 'failed' | 'offline';
}

interface StreamScreenShareProps {
  onBackToModeSelector?: () => void;
}

// Custom Stream Call Content Component with proper recording handling
function StreamCallContent({ call }: any) {
  const [isRecording, setIsRecording] = useState(false);
  
  // Start/stop recording with proper error handling
  const startRecording = async () => {
    if (!call) return;
    try {
      // Check if already recording
      if (isRecording) {
        console.log('Recording already in progress');
        return;
      }
      await call.startRecording();
      setIsRecording(true);
      console.log('Recording started successfully');
    } catch (error: any) {
      console.error('Recording start error:', error);
      if (error.message?.includes('already being recorded')) {
        console.log('Call is already being recorded');
        setIsRecording(true); // Set state to reflect actual recording status
      }
    }
  };

  const stopRecording = async () => {
    if (!call) return;
    try {
      await call.stopRecording();
      setIsRecording(false);
      console.log('Recording stopped successfully');
    } catch (error) {
      console.error('Recording stop error:', error);
    }
  };

  return (
    <div className="relative h-full">
      <SpeakerLayout />
      
      {/* Recording indicator */}
      {isRecording && (
        <div className="absolute top-4 left-4 z-10 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium animate-pulse">
          🔴 Recording
        </div>
      )}
      
      {/* Controls overlay */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
        <div className="bg-black/70 backdrop-blur-sm rounded-lg p-2">
          <div className="flex items-center space-x-2">
            <ScreenShareButton />
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`px-3 py-2 rounded-lg text-white font-medium text-sm ${
                isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>
            <CallStatsButton />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StreamScreenShare({ onBackToModeSelector }: StreamScreenShareProps) {
  const { theme, toggleTheme } = useTheme();
  const [userId] = useState(() => uuidv4());
  const [userName, setUserName] = useState(() => `User ${Math.random().toString(36).substr(2, 4)}`);
  const [roomId, setRoomId] = useState('');
  const [isInRoom, setIsInRoom] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(true);
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  
  // Chat and UI state
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  // Settings
  const [fps, setFps] = useState(30);
  const [quality, setQuality] = useState('1080p');
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [showCursor, setShowCursor] = useState(true);

  const initializeStream = async (callId: string) => {
    setIsConnecting(true);
    
    try {
      // Get Stream API key from backend
      const configResponse = await fetch('/api/stream-config');
      if (!configResponse.ok) {
        throw new Error('Failed to get Stream.io configuration');
      }
      const { apiKey } = await configResponse.json();

      // Generate token for user
      const response = await fetch('/api/stream-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, userName }),
      });

      if (!response.ok) {
        throw new Error('Failed to get Stream.io token');
      }

      const { token: userToken } = await response.json();

      // Initialize Stream video client
      const user = { id: userId, name: userName };
      const videoClient = new StreamVideoClient({ 
        apiKey: apiKey, 
        user,
        token: userToken,
      });

      // Create or join call
      const callInstance = videoClient.call("default", callId);
      
      // Configure call settings for better device access
      try {
        await callInstance.camera.disable();
      } catch (e) {
        console.log('Camera disable not needed:', e);
      }
      
      try {
        await callInstance.microphone.disable();
      } catch (e) {
        console.log('Microphone disable not needed:', e);
      }
      
      // Join the call
      await callInstance.join({ create: true });

      console.log("Joined Stream.io call successfully");

      setClient(videoClient);
      setCall(callInstance);
      setIsInRoom(true);

      // Listen for chat messages
      callInstance.on('custom', (event) => {
        if (event.type === 'chat_message') {
          setMessages(prev => [...prev, event.data]);
        }
      });
      
    } catch (error) {
      console.error("Error joining Stream.io call:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const joinRoom = async () => {
    if (!roomId.trim() || !userName.trim()) return;
    
    await initializeStream(roomId);
    setShowJoinModal(false);
  };

  const leaveRoom = async () => {
    if (call) {
      await call.leave();
    }
    if (client) {
      await client.disconnectUser();
    }
    
    setIsInRoom(false);
    setCall(null);
    setClient(null);
    setShowJoinModal(true);
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendMessage = () => {
    if (!messageInput.trim() || !call) return;

    const message: Message = {
      id: uuidv4(),
      userId,
      userName,
      text: messageInput,
      timestamp: Date.now()
    };

    // Send message through Stream.io chat
    try {
      call.sendCustomEvent({
        type: 'chat_message',
        data: message
      });
    } catch (error) {
      console.log('Message sent locally only:', error);
    }

    setMessages(prev => [...prev, message]);
    setMessageInput('');
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullScreen(true);
    } else {
      document.exitFullscreen();
      setIsFullScreen(false);
    }
  };

  if (showJoinModal) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 dark:from-gray-900 dark:via-black dark:to-gray-800 flex items-center justify-center p-4">
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="fixed top-4 right-4 z-50 p-3 bg-white/10 dark:bg-black/20 backdrop-blur-lg rounded-full border border-white/20 dark:border-gray-600 text-white hover:bg-white/20 dark:hover:bg-black/30 transition-colors"
        >
          {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </button>
        
        {/* Mobile-responsive card */}
        <div className="bg-white/10 dark:bg-black/20 backdrop-blur-lg rounded-2xl p-4 sm:p-6 md:p-8 max-w-md w-full border border-white/20 dark:border-gray-600 mx-4">
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-blue-500 rounded-full mb-4">
              <Monitor className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Screen Share Pro</h1>
            <p className="text-blue-200 mb-1 text-sm sm:text-base">Powered by Airavata Technologies</p>
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-4">
              <span className="bg-green-500/20 text-green-300 px-3 py-1 rounded-full text-xs sm:text-sm">
                ✅ Unlimited Free
              </span>
              <span className="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-xs sm:text-sm">
                ⚡ Stream.io Mode
              </span>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-white text-sm font-medium mb-2">Your Name</label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
                placeholder="Enter your name"
              />
            </div>
            
            <div>
              <label className="block text-white text-sm font-medium mb-2">Room ID</label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
                placeholder="Enter room ID or create new"
              />
            </div>
            
            <button
              onClick={joinRoom}
              disabled={!roomId.trim() || !userName.trim() || isConnecting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 sm:py-3 px-4 sm:px-6 rounded-lg transition-colors flex items-center justify-center text-sm sm:text-base"
            >
              {isConnecting ? (
                <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5 animate-spin mr-2" />
              ) : (
                <Monitor className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
              )}
              {isConnecting ? 'Connecting...' : 'Join Room'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 dark:bg-black text-white flex flex-col">
      {/* Mobile-responsive navigation */}
      <div className="bg-gray-800 dark:bg-gray-900 border-b border-gray-700 dark:border-gray-600 px-3 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-4 min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <Monitor className="h-5 w-5 sm:h-6 sm:w-6 text-blue-400 flex-shrink-0" />
              <span className="font-semibold text-sm sm:text-base truncate">Screen Share Pro</span>
            </div>
            <div className="hidden sm:flex items-center space-x-2 bg-gray-700 dark:bg-gray-800 px-3 py-1 rounded-lg">
              <span className="text-xs sm:text-sm text-gray-300">Room:</span>
              <span className="text-xs sm:text-sm font-mono text-blue-400 truncate max-w-20">{roomId}</span>
              <button onClick={copyRoomId} className="text-gray-400 hover:text-white">
                {copied ? <Check className="h-3 w-3 sm:h-4 sm:w-4" /> : <Copy className="h-3 w-3 sm:h-4 sm:w-4" />}
              </button>
            </div>
          </div>
          
          <div className="flex items-center space-x-1 sm:space-x-2">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 sm:p-2 bg-gray-700 dark:bg-gray-800 hover:bg-gray-600 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            
            {/* Settings toggle */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1.5 sm:p-2 bg-gray-700 dark:bg-gray-800 hover:bg-gray-600 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Settings className="h-4 w-4" />
            </button>
            
            {/* Chat toggle */}
            <button
              onClick={() => setShowChat(!showChat)}
              className="p-1.5 sm:p-2 bg-gray-700 dark:bg-gray-800 hover:bg-gray-600 dark:hover:bg-gray-700 rounded-lg transition-colors relative"
            >
              <MessageCircle className="h-4 w-4" />
              {messages.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                  {messages.length > 9 ? '9+' : messages.length}
                </span>
              )}
            </button>
            
            {/* Back button */}
            {onBackToModeSelector && (
              <button
                onClick={onBackToModeSelector}
                className="hidden sm:flex items-center space-x-1 px-2 sm:px-3 py-1.5 sm:py-2 bg-gray-600 dark:bg-gray-700 hover:bg-gray-500 dark:hover:bg-gray-600 rounded-lg transition-colors text-xs sm:text-sm"
              >
                <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden md:inline">Back</span>
              </button>
            )}
            
            <button
              onClick={leaveRoom}
              className="px-2 sm:px-4 py-1.5 sm:py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors text-xs sm:text-sm"
            >
              Leave
            </button>
          </div>
        </div>
        
        {/* Mobile room info */}
        <div className="sm:hidden mt-2 flex items-center space-x-2 bg-gray-700 dark:bg-gray-800 px-3 py-1 rounded-lg">
          <span className="text-xs text-gray-300">Room:</span>
          <span className="text-xs font-mono text-blue-400 truncate flex-1">{roomId}</span>
          <button onClick={copyRoomId} className="text-gray-400 hover:text-white">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main video area */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 bg-gray-800 dark:bg-gray-900 relative">
            {client && call ? (
              <StreamVideo client={client}>
                <StreamCall call={call}>
                  <StreamCallContent call={call} />
                </StreamCall>
              </StreamVideo>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <RotateCcw className="h-8 w-8 sm:h-12 sm:w-12 text-gray-400 animate-spin mx-auto mb-4" />
                  <p className="text-gray-400 text-sm sm:text-base">Connecting to Stream.io...</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile back button */}
        {onBackToModeSelector && (
          <button
            onClick={onBackToModeSelector}
            className="sm:hidden fixed bottom-4 left-4 z-50 p-3 bg-gray-600 dark:bg-gray-700 hover:bg-gray-500 dark:hover:bg-gray-600 rounded-full transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}

        {/* Settings Panel */}
        {showSettings && (
          <div className="absolute inset-y-0 right-0 w-full sm:w-80 bg-gray-800 dark:bg-gray-900 border-l border-gray-700 dark:border-gray-600 p-4 sm:p-6 z-40 overflow-y-auto sm:relative sm:inset-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="sm:hidden p-1 text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Video Quality</label>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                  className="w-full bg-gray-700 dark:bg-gray-800 border border-gray-600 dark:border-gray-500 rounded-lg px-3 py-2 text-white"
                >
                  <option value="480p">480p (SD)</option>
                  <option value="720p">720p (HD)</option>
                  <option value="1080p">1080p (Full HD)</option>
                  <option value="1440p">1440p (2K)</option>
                  <option value="4K">4K (Ultra HD)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Frame Rate: {fps} FPS</label>
                <input
                  type="range"
                  min="15"
                  max="60"
                  step="5"
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-300">Show Cursor</label>
                  <button
                    onClick={() => setShowCursor(!showCursor)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      showCursor ? 'bg-blue-600' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        showCursor ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-300">Microphone</label>
                  <button
                    onClick={() => setMicrophoneEnabled(!microphoneEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      microphoneEnabled ? 'bg-blue-600' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        microphoneEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Chat Panel */}
        {showChat && (
          <div className="absolute inset-y-0 right-0 w-full sm:w-80 bg-gray-800 dark:bg-gray-900 border-l border-gray-700 dark:border-gray-600 p-4 z-40 flex flex-col sm:relative sm:inset-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Chat</h3>
              <button
                onClick={() => setShowChat(false)}
                className="sm:hidden p-1 text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {messages.length === 0 ? (
                <p className="text-gray-400 text-center text-sm">No messages yet</p>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className="bg-gray-700 dark:bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-blue-400">{message.userName}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300">{message.text}</p>
                  </div>
                ))
              )}
            </div>
            
            {/* Message input */}
            <div className="flex space-x-2">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 bg-gray-700 dark:bg-gray-800 border border-gray-600 dark:border-gray-500 rounded-lg px-3 py-2 text-white placeholder-gray-400 text-sm"
              />
              <button
                onClick={sendMessage}
                disabled={!messageInput.trim()}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}