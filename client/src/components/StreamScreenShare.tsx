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
  ArrowLeft,
  Menu,
  X,
  UserIcon
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useTheme } from '../contexts/ThemeContext';
import { io, Socket } from 'socket.io-client';

import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  CallControls,
  SpeakerLayout,
  StreamTheme,
  CallingState,
  useCallStateHooks,
  ScreenShareButton,
  RecordCallButton,
  CallStatsButton,
  ParticipantView,
  useCall,
  useCallStateHooks as useStreamCallStateHooks,
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

export default function StreamScreenShare({ onBackToModeSelector }: StreamScreenShareProps) {
  const { theme, toggleTheme } = useTheme();
  const [userId] = useState(() => uuidv4());
  const [userName, setUserName] = useState(() => `User ${Math.random().toString(36).substr(2, 4)}`);
  const [roomId, setRoomId] = useState('');
  const [isInRoom, setIsInRoom] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [showMobileParticipants, setShowMobileParticipants] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [fps, setFps] = useState(30);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [quality, setQuality] = useState('1080p');
  const [showCursor, setShowCursor] = useState(true);
  const [showChatPopup, setShowChatPopup] = useState(false);
  
  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  
  // Stream.io specific states
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [nativeRecordingState, setNativeRecordingState] = useState(false);
  const recordingUrlRef = useRef<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);

  // Custom recording functionality that captures screen directly
  const startCustomRecording = async () => {
    try {
      console.log('Starting custom recording...');
      
      // Get screen sharing stream with maximum bandwidth settings
      const getQualityConstraints = (quality: string) => {
        switch (quality) {
          case '4K': return { width: { ideal: 3840 }, height: { ideal: 2160 } };
          case '1440p': return { width: { ideal: 2560 }, height: { ideal: 1440 } };
          case '1080p': return { width: { ideal: 1920 }, height: { ideal: 1080 } };
          case '720p': return { width: { ideal: 1280 }, height: { ideal: 720 } };
          case '480p': return { width: { ideal: 854 }, height: { ideal: 480 } };
          default: return { width: { ideal: 1920 }, height: { ideal: 1080 } };
        }
      };

      const qualityConstraints = getQualityConstraints(quality);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: fps, max: fps },
          ...qualityConstraints,
          cursor: showCursor ? 'always' : 'never',
          displaySurface: 'monitor',
          logicalSurface: true
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
          channelCount: 2,
          suppressLocalAudioPlayback: false
        }
      });

      // Enhanced MediaRecorder configuration with maximum quality
      const getRecordingBitrate = (quality: string) => {
        switch (quality) {
          case '4K': return { video: 25000000, audio: 320000 };
          case '1440p': return { video: 15000000, audio: 256000 };
          case '1080p': return { video: 10000000, audio: 192000 };
          case '720p': return { video: 5000000, audio: 128000 };
          case '480p': return { video: 2500000, audio: 96000 };
          default: return { video: 10000000, audio: 192000 };
        }
      };

      const bitrates = getRecordingBitrate(quality);
      const hasAudio = stream.getAudioTracks().length > 0;
      
      const options = {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: bitrates.video,
        audioBitsPerSecond: hasAudio ? bitrates.audio : 0,
        bitsPerSecond: bitrates.video + (hasAudio ? bitrates.audio : 0)
      };

      console.log(`🎥 Stream.io recording configuration:`, {
        quality,
        fps,
        videoBitrate: `${(bitrates.video / 1000000).toFixed(1)} Mbps`,
        audioBitrate: hasAudio ? `${(bitrates.audio / 1000).toFixed(0)} kbps` : 'No audio',
        totalBitrate: `${((bitrates.video + (hasAudio ? bitrates.audio : 0)) / 1000000).toFixed(1)} Mbps`,
        systemAudio: hasAudio,
        audioTracks: stream.getAudioTracks().length
      });

      console.log('Recording options:', options);

      // Fallback for browsers that don't support vp9
      let recorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch (error) {
        console.log('VP9 not supported, falling back to VP8');
        recorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp8,opus'
        });
      }

      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
          console.log('Data chunk collected:', event.data.size, 'bytes');
        }
      };

      recorder.onstop = () => {
        console.log('Recording stopped, creating blob...');
        const blob = new Blob(chunks, { type: 'video/webm' });
        console.log('Final recording blob size:', blob.size, 'bytes');
        downloadCustomRecording(blob);
        setRecordedChunks([]);
        
        // Stop all tracks to release screen capture
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.onerror = (event) => {
        console.error('Recording error:', event);
        setIsRecording(false);
        alert('Recording failed. Please try again.');
      };

      // Start recording with 1 second intervals
      recorder.start(1000);
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordedChunks(chunks);

      console.log('Custom recording started successfully');
      
      // Add recording notification with detailed quality info
      const message: Message = {
        id: uuidv4(),
        userId: 'system',
        userName: 'System',
        text: `🔴 ${userName} started screen recording (${quality}, ${fps}FPS, ${(bitrates.video / 1000000).toFixed(1)} Mbps${hasAudio ? ` + ${(bitrates.audio / 1000).toFixed(0)} kbps audio` : ''})`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, message]);

    } catch (error) {
      console.error('Failed to start custom recording:', error);
      setIsRecording(false);
      alert('Failed to start recording. Please grant screen sharing permission.');
    }
  };

  const stopCustomRecording = () => {
    if (mediaRecorder && isRecording) {
      console.log('Stopping custom recording...');
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
      
      // Add stop notification
      const message: Message = {
        id: uuidv4(),
        userId: 'system',
        userName: 'System',
        text: `⏹️ ${userName} stopped recording. Processing download...`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, message]);
    } else {
      console.log('No active recording to stop');
    }
  };

  const downloadCustomRecording = (blob: Blob) => {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `custom-recording-${timestamp}-${quality}-${fps}fps.webm`;
      
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      console.log(`Custom recording downloaded successfully: ${filename}`);
      
      // Add success message
      const message: Message = {
        id: uuidv4(),
        userId: 'system',
        userName: 'System',
        text: `✅ Recording downloaded: ${filename}`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, message]);
      
      alert(`Recording saved as: ${filename}`);
    } catch (error) {
      console.error('Failed to download custom recording:', error);
      
      // Add error message
      const message: Message = {
        id: uuidv4(),
        userId: 'system',
        userName: 'System',
        text: `❌ Failed to download recording: ${error.message}`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, message]);
      
      alert('Failed to download recording. Please try again.');
    }
  };

  // Removed Stream.io recording functions - using custom recording solution

  // Check for mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Cleanup Socket.io connection on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leave-room', { roomId, userName });
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // Generate Stream.io token (in production, this should come from your backend)


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

      // Create Stream video client
      const user = {
        id: userId,
        name: userName,
      };

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
      
      // Set initial microphone state based on our setting
      try {
        if (microphoneEnabled) {
          await callInstance.microphone.enable();
          console.log('Microphone enabled on join');
        } else {
          await callInstance.microphone.disable();
          console.log('Microphone disabled on join');
        }
      } catch (e) {
        console.log('Microphone setup not needed:', e);
      }
      
      // Join the call
      await callInstance.join({ create: true });

      console.log("Joined Stream.io call successfully");

      setClient(videoClient);
      setCall(callInstance);
      setIsInRoom(true);
      
      // Stream.io recording events removed - using custom recording solution
      
      // Initialize Socket.io for participant synchronization
      if (!socketRef.current) {
        const socket = io();
        socketRef.current = socket;

        // Join room for participant sync
        socket.emit('join-room', { roomId: callId, userName });

        // Listen for participants updates from server
        socket.on('participants-updated', (participantsList: Participant[]) => {
          console.log('📊 Participants updated from server:', participantsList);
          setParticipants(participantsList);
        });

        // Listen for messages from server (Socket.io only, no duplicates)
        socket.on('new-message', (message: Message) => {
          setMessages(prev => {
            const exists = prev.some(msg => msg.id === message.id);
            if (!exists) {
              return [...prev, message];
            }
            return prev;
          });
        });
      }

      // DISABLED: Stream.io custom events for messaging - using Socket.io only
      // This was causing duplicate messages as both systems were sending the same message
      /*
      callInstance.on('custom', (event) => {
        console.log('Received custom event:', event);
        // ... Stream.io messaging code disabled to prevent duplicates
      });
      */

      // Also listen for other Stream.io events
      callInstance.on('call.session_participant_joined', (event) => {
        console.log('Participant joined:', event);
        if (event.participant && event.participant.user) {
          const newParticipant: Participant = {
            id: event.participant.user.id,
            name: event.participant.user.name || `User ${event.participant.user.id.slice(0, 4)}`,
            isPresenting: false,
            connectionStatus: 'connected'
          };
          setParticipants(prev => {
            const exists = prev.some(p => p.id === newParticipant.id);
            if (!exists) {
              console.log('Adding new participant:', newParticipant);
              return [...prev, newParticipant];
            }
            console.log('Participant already exists, not adding duplicate');
            return prev;
          });
        }
      });

      callInstance.on('call.session_participant_left', (event) => {
        console.log('Participant left:', event);
        if (event.participant && event.participant.user) {
          setParticipants(prev => prev.filter(p => p.id !== event.participant.user.id));
        }
      });

      // Current user already added above - no need to duplicate

      // Add a welcome message to test chat functionality
      setTimeout(() => {
        const welcomeMessage: Message = {
          id: uuidv4(),
          userId: 'system',
          userName: 'System',
          text: `${userName} joined the chat!`,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, welcomeMessage]);
      }, 1000);
      
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
    
    // Leave Socket.io room
    if (socketRef.current) {
      socketRef.current.emit('leave-room', { roomId, userName });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    setIsInRoom(false);
    setCall(null);
    setClient(null);
    setShowJoinModal(true);
    setParticipants([]);
    setMessages([]);
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendMessage = async () => {
    if (!messageInput.trim()) {
      console.log('Cannot send message: empty input');
      return;
    }

    console.log('📩 Sending message:', messageInput.trim());

    // Only send to server - don't add locally to avoid duplicates
    if (socketRef.current) {
      socketRef.current.emit('send-message', {
        roomId,
        message: messageInput.trim(),
        userName,
        userId
      });
      console.log('📨 Message sent through Socket.io');
    }
    
    setMessageInput('');
  };

  // Toggle microphone function
  const toggleMicrophone = async () => {
    if (!call) return;
    
    try {
      if (microphoneEnabled) {
        await call.microphone.disable();
        console.log('Microphone disabled');
      } else {
        await call.microphone.enable();
        console.log('Microphone enabled');
      }
      setMicrophoneEnabled(!microphoneEnabled);
    } catch (error) {
      console.error('Error toggling microphone:', error);
    }
  };

  // Note: Show cursor is handled in screen sharing constraints
  const toggleShowCursor = () => {
    setShowCursor(!showCursor);
    console.log('Cursor visibility toggled:', !showCursor);
    // The cursor setting will be applied when screen sharing starts
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

  const getQualityConstraints = () => {
    const constraints = {
      video: {
        frameRate: { ideal: fps, max: fps },
        cursor: showCursor ? 'always' : 'never'
      } as any,
      audio: microphoneEnabled
    };

    switch (quality) {
      case '4K':
        constraints.video.width = { ideal: 3840 };
        constraints.video.height = { ideal: 2160 };
        break;
      case '1440p':
        constraints.video.width = { ideal: 2560 };
        constraints.video.height = { ideal: 1440 };
        break;
      case '1080p':
        constraints.video.width = { ideal: 1920 };
        constraints.video.height = { ideal: 1080 };
        break;
      case '720p':
        constraints.video.width = { ideal: 1280 };
        constraints.video.height = { ideal: 720 };
        break;
      case '480p':
        constraints.video.width = { ideal: 854 };
        constraints.video.height = { ideal: 480 };
        break;
    }

    return constraints;
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
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full border border-white/20">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-full mb-4">
              <Monitor className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Screen Share Pro</h1>
            <p className="text-blue-200 mb-1">Powered by Airavata Technologies</p>
            <div className="flex items-center justify-center space-x-4">
              <span className="bg-green-500/20 text-green-300 px-3 py-1 rounded-full text-sm">
                ✅ Unlimited Free
              </span>
              <span className="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-sm">
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
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your name"
              />
            </div>
            
            <div>
              <label className="block text-white text-sm font-medium mb-2">Room ID</label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter room ID or create new"
              />
            </div>
            
            <div className="flex gap-3">
              {onBackToModeSelector && (
                <button
                  onClick={onBackToModeSelector}
                  className="px-4 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors font-medium"
                >
                  Back
                </button>
              )}
              <button
                onClick={joinRoom}
                disabled={!roomId.trim() || !userName.trim() || isConnecting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center"
              >
              {isConnecting ? (
                <RotateCcw className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <Monitor className="h-5 w-5 mr-2" />
              )}
              {isConnecting ? 'Connecting...' : 'Join Room'}
            </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Top Navigation */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 md:px-6 py-3 md:py-4">
        <div className="flex items-center justify-between">
          {/* Left side */}
          <div className={`flex items-center space-x-2 ${isMobile ? 'flex-1' : 'space-x-4'}`}>
            <div className="flex items-center space-x-2">
              <Monitor className="h-5 w-5 md:h-6 md:w-6 text-blue-400" />
              <span className={`font-semibold ${isMobile ? 'text-sm' : ''}`}>Screen Share Pro</span>
            </div>
            {!isMobile && (
              <div className="flex items-center space-x-2 bg-gray-700 px-3 py-1 rounded-lg">
                <span className="text-sm text-gray-300">Room:</span>
                <span className="text-sm font-mono text-blue-400">{roomId}</span>
                <button onClick={copyRoomId} className="text-gray-400 hover:text-white">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            )}
            {isMobile && (
              <div className="flex items-center space-x-1 bg-gray-700 px-2 py-1 rounded text-xs">
                <span className="text-gray-300">Room:</span>
                <span className="font-mono text-blue-400">{roomId.slice(0, 8)}...</span>
                <button onClick={copyRoomId} className="text-gray-400">
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            )}
          </div>
          
          {/* Right side */}
          <div className="flex items-center space-x-2">
            {!isMobile && (
              <div className="flex items-center space-x-2">
                <span className="bg-green-500/20 text-green-300 px-3 py-1 rounded-full text-sm">
                  ✅ Unlimited
                </span>
                <span className="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-sm">
                  {fps} FPS
                </span>
                <span className="bg-purple-500/20 text-purple-300 px-3 py-1 rounded-full text-sm">
                  {quality}
                </span>
              </div>
            )}
            
            {isMobile && (
              <span className="bg-green-500/20 text-green-300 px-2 py-1 rounded-full text-xs">
                ✅ Free
              </span>
            )}
            
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              <Settings className="h-4 w-4 md:h-5 md:w-5" />
            </button>
            
            {!isMobile && (
              <button
                onClick={toggleFullScreen}
                className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                {isFullScreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </button>
            )}
            
            {!isMobile && onBackToModeSelector && (
              <button
                onClick={onBackToModeSelector}
                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg transition-colors"
              >
                Back to Modes
              </button>
            )}
            
            <button
              onClick={leaveRoom}
              className={`bg-red-600 hover:bg-red-700 rounded-lg transition-colors ${
                isMobile ? 'p-2' : 'px-4 py-2'
              }`}
            >
              {isMobile ? <X className="h-4 w-4" /> : 'Leave'}
            </button>
          </div>
        </div>
      </div>

      <div className={`flex h-[calc(100vh-80px)] ${isMobile ? 'relative' : ''} overflow-hidden`}>
        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* User Info Bar - Mobile */}
          {isMobile && (
            <div className="bg-gray-700 px-3 py-2 border-b border-gray-600 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center">
                  <UserIcon className="h-3 w-3 text-white" />
                </div>
                <span className="font-medium text-white text-sm">{userName}</span>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setShowMobileParticipants(true)}
                  className="p-2 bg-gray-600 rounded-lg relative"
                >
                  <Users className="h-4 w-4" />
                  <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {participants.length}
                  </span>
                </button>
                <button
                  onClick={() => setShowMobileChat(true)}
                  className="p-2 bg-gray-600 rounded-lg relative"
                >
                  <MessageCircle className="h-4 w-4" />
                  {messages.filter(m => m.userId !== 'system').length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                      {messages.filter(m => m.userId !== 'system').length}
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Video Area */}
          <div className="flex-1 bg-gray-800 relative">
            {client && call ? (
              <StreamVideo client={client}>
                <StreamCall call={call}>
                  <StreamCallContent 
                    fps={fps}
                    quality={quality}
                    microphoneEnabled={microphoneEnabled}
                    showCursor={showCursor}
                    messages={messages}
                    setShowChatPopup={setShowChatPopup}
                    isRecording={isRecording}
                    startRecording={startCustomRecording}
                    stopRecording={stopCustomRecording}
                  />
                </StreamCall>
              </StreamVideo>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <RotateCcw className="h-12 w-12 text-gray-400 animate-spin mx-auto mb-4" />
                  <p className="text-gray-400">Connecting to Stream.io...</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Desktop Settings Panel */}
        {!isMobile && showSettings && (
          <div className="w-80 bg-gray-800 border-l border-gray-700 p-6">
            <h3 className="text-lg font-semibold mb-4">Settings</h3>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Video Quality</label>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                >
                  <option value="4K">4K Ultra HD (25 Mbps)</option>
                  <option value="1440p">1440p QHD (15 Mbps)</option>
                  <option value="1080p">1080p HD (10 Mbps)</option>
                  <option value="720p">720p (5 Mbps)</option>
                  <option value="480p">480p (2.5 Mbps)</option>
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
              
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-300">Show Cursor</label>
                <button
                  onClick={toggleShowCursor}
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
                  onClick={toggleMicrophone}
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
        )}



        {/* Mobile Chat Overlay */}
        {isMobile && showMobileChat && (
          <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
            <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MessageCircle className="h-5 w-5 text-blue-400" />
                <h3 className="font-semibold">Chat</h3>
              </div>
              <button
                onClick={() => setShowMobileChat(false)}
                className="p-2 hover:bg-gray-700 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Mobile Chat Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.userId === userId ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-3 py-2 rounded-2xl ${
                    message.userId === userId 
                      ? 'bg-blue-600 text-white rounded-br-md' 
                      : message.userId === 'system'
                      ? 'bg-gray-600 text-gray-200 mx-auto text-center rounded-xl'
                      : 'bg-gray-700 text-white rounded-bl-md'
                  }`}>
                    {message.userId !== userId && message.userId !== 'system' && (
                      <div className="text-xs text-blue-400 font-medium mb-1">{message.userName}</div>
                    )}
                    <p className="text-sm leading-relaxed">{message.text}</p>
                    <div className={`text-xs mt-1 ${
                      message.userId === userId ? 'text-blue-200' : 'text-gray-400'
                    }`}>
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-gray-700 bg-gray-800">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-full px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={sendMessage}
                  disabled={!messageInput.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 p-2 rounded-full transition-colors min-w-[40px]"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Participants Overlay */}
        {isMobile && showMobileParticipants && (
          <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
            <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-blue-400" />
                <h3 className="font-semibold">Participants ({participants.length})</h3>
              </div>
              <button
                onClick={() => setShowMobileParticipants(false)}
                className="p-2 hover:bg-gray-700 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-2">
                {participants.map((participant) => (
                  <div key={participant.id} className="flex items-center space-x-3 p-3 bg-gray-800 rounded-xl">
                    <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                      <UserIcon className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-white text-base">{participant.name}</div>
                      {participant.id === userId ? (
                        <div className="text-sm text-blue-400">(You)</div>
                      ) : (
                        <div className="text-sm text-gray-400">Participant</div>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span className="text-xs text-green-400">
                        Online
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Mobile Settings Overlay */}
        {isMobile && showSettings && (
          <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
            <div className="bg-gray-800 p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold">Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 hover:bg-gray-700 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Video Quality</label>
                  <select
                    value={quality}
                    onChange={(e) => setQuality(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
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
                
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-300">Show Cursor</label>
                  <button
                    onClick={toggleShowCursor}
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
                    onClick={toggleMicrophone}
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

        {/* Chat Popup Modal */}
        {showChatPopup && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-xl w-full max-w-md h-[600px] flex flex-col border border-gray-700">
              {/* Chat Header */}
              <div className="bg-gray-700 p-4 rounded-t-xl border-b border-gray-600 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                    <MessageCircle className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Chat</h3>
                    <p className="text-sm text-gray-400">
                      {participants.length} participant{participants.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowChatPopup(false)}
                  className="p-2 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 mt-8">
                    <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No messages yet</p>
                    <p className="text-sm">Start the conversation!</p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div key={message.id} className="space-y-1">
                      {message.userId === 'system' ? (
                        <div className="text-center text-sm text-gray-400 py-2">
                          {message.text}
                        </div>
                      ) : (
                        <div className={`flex ${message.userId === userId ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[70%] p-3 rounded-2xl ${
                            message.userId === userId 
                              ? 'bg-blue-600 text-white rounded-br-md' 
                              : 'bg-gray-700 text-white rounded-bl-md'
                          }`}>
                            {message.userId !== userId && (
                              <div className="text-xs text-blue-300 mb-1 font-medium">
                                {message.userName}
                              </div>
                            )}
                            <p className="text-sm leading-relaxed break-words">{message.text}</p>
                            <div className={`text-xs mt-1 ${
                              message.userId === userId ? 'text-blue-200' : 'text-gray-400'
                            }`}>
                              {new Date(message.timestamp).toLocaleTimeString([], { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Chat Input */}
              <div className="p-4 border-t border-gray-600">
                <div className="flex space-x-2">
                  <textarea
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Type a message..."
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none"
                    rows={2}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!messageInput.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Stream.io Call Content Component
function StreamCallContent({ 
  fps, 
  quality, 
  microphoneEnabled, 
  showCursor,
  messages,
  setShowChatPopup,
  isRecording,
  startRecording,
  stopRecording
}: { 
  fps: number;
  quality: string;
  microphoneEnabled: boolean;
  showCursor: boolean;
  messages: Message[];
  setShowChatPopup: (show: boolean) => void;
  isRecording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
}) {
  const { useCallCallingState, useParticipants, useLocalParticipant, useRemoteParticipants } = useCallStateHooks();
  const callingState = useCallCallingState();
  const participants = useParticipants();
  const localParticipant = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const [showParticipants, setShowParticipants] = useState(false);

  const allParticipants = [
    ...(localParticipant ? [localParticipant] : []),
    ...remoteParticipants
  ];

  if (callingState === CallingState.LEFT) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>You have left the call</p>
      </div>
    );
  }
  
  // No custom layout - use Stream.io default with sidebar for participants
  return (
    <StreamTheme className="h-full">
      <div className="h-full flex">
        {/* Main video area - let Stream.io handle its own layout */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1">
            <SpeakerLayout 
              participantsBarPosition="bottom"
              ParticipantsBarLimit={20}
              excludeLocalParticipant={false}
            />
          </div>
          
          {/* Controls area */}
          <div className="p-4 bg-gray-900/50 flex items-center justify-center relative">
            {/* Participants Button */}
            <button
              onClick={() => setShowParticipants(!showParticipants)}
              className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-gray-600 hover:bg-gray-500 text-white p-3 rounded-lg transition-colors flex items-center gap-2"
            >
              <Users className="h-5 w-5" />
              <span className="hidden sm:inline">Participants ({allParticipants.length})</span>
            </button>
            
            {/* Chat Button - Positioned absolutely to top-right */}
            <button
              onClick={() => setShowChatPopup(true)}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg transition-colors flex items-center gap-2"
            >
              <MessageCircle className="h-5 w-5" />
              <span className="hidden sm:inline">Chat</span>
              {messages.length > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] h-5 flex items-center justify-center">
                  {messages.length}
                </span>
              )}
            </button>
            
            {/* Centered Call Controls with custom recording */}
            <div className="flex items-center space-x-4">
              {/* Stream.io Controls with recording button hidden */}
              <div className="stream-controls-no-record str-video__call-controls">
                <CallControls />
              </div>
              
              {/* Custom Recording Button */}
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`custom-recording-button p-3 rounded-lg transition-all flex items-center gap-2 ${
                  isRecording 
                    ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse shadow-lg' 
                    : 'bg-gray-600 hover:bg-gray-500 text-white shadow-md'
                }`}
                title={isRecording ? 'Stop Recording & Download' : 'Start Recording'}
              >
                {isRecording ? (
                  <>
                    <Square className="h-5 w-5" />
                    <span className="hidden sm:inline">Stop Recording</span>
                  </>
                ) : (
                  <>
                    <div className="h-5 w-5 rounded-full bg-red-500" />
                    <span className="hidden sm:inline">Start Recording</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Participants Sidebar */}
        {showParticipants && (
          <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-white font-semibold">Participants ({allParticipants.length})</h3>
              <button
                onClick={() => setShowParticipants(false)}
                className="text-gray-400 hover:text-white p-1 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {allParticipants.map((participant) => (
                <div 
                  key={participant.sessionId || participant.userId}
                  className="bg-gray-700 rounded-lg p-3 flex items-center space-x-3"
                >
                  <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center">
                    <UserIcon className="h-6 w-6 text-gray-300" />
                  </div>
                  
                  <div className="flex-1">
                    <div className="text-white font-medium">
                      {participant.name || participant.userId}
                      {participant.userId === localParticipant?.userId && (
                        <span className="text-gray-400 text-sm ml-2">(You)</span>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2 mt-1">
                      {participant.publishedTracks.includes('audio') ? (
                        <Mic className="h-4 w-4 text-green-400" />
                      ) : (
                        <MicOff className="h-4 w-4 text-red-400" />
                      )}
                      
                      {participant.publishedTracks.includes('video') ? (
                        <Video className="h-4 w-4 text-green-400" />
                      ) : (
                        <VideoOff className="h-4 w-4 text-red-400" />
                      )}
                      
                      {participant.isScreenSharing && (
                        <Monitor className="h-4 w-4 text-blue-400" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </StreamTheme>
  );
}