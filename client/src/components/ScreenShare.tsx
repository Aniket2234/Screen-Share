import React, { useState, useEffect, useRef } from 'react';
import { Monitor, Users, MessageCircle, Settings, Play, Square, Send, Maximize, Wifi, WifiOff, User, X, Chrome, AppWindow as WindowIcon, MonitorSpeaker, Presentation } from 'lucide-react';

interface User {
  name: string;
  joined_at: number;
}

interface Message {
  user: string;
  text: string;
  timestamp: number;
}

interface ScreenShareSettings {
  fps: number;
  quality: number;
  monitor: number;
}

export default function ScreenShare() {
  console.log('🚀 ScreenShare component rendered');
  
  const [userId] = useState(() => {
    const id = 'user_' + Math.random().toString(36).substr(2, 9);
    console.log('👤 Generated userId:', id);
    return id;
  });
  
  const [users, setUsers] = useState<Record<string, User>>({});
  const [currentSharer, setCurrentSharer] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTab, setShareTab] = useState<'tab' | 'window' | 'screen'>('screen');
  const [settings, setSettings] = useState<ScreenShareSettings>({
    fps: 30,
    quality: 85,
    monitor: 0
  });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const frameIntervalRef = useRef<NodeJS.Timeout>();
  const sharedImageRef = useRef<HTMLImageElement>(null);
  
  const userName = `User ${userId.slice(-4)}`;
  const amISharing = currentSharer === userId;
  const amIPresenter = currentSharer === userId || !currentSharer;

  console.log('📊 Current state:', {
    userId,
    userName,
    isConnected,
    isSharing,
    amISharing,
    amIPresenter,
    currentSharer,
    userCount: Object.keys(users).length
  });

  // API calls with extensive logging
  const apiCall = async (endpoint: string, options?: RequestInit) => {
    console.log(`🌐 API Call: ${endpoint}`, options);
    try {
      const response = await fetch(`http://localhost:8080${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });
      console.log(`✅ API Response: ${endpoint}`, response.status, response.ok);
      return response;
    } catch (error) {
      console.error(`❌ API call failed for ${endpoint}:`, error);
      setIsConnected(false);
      throw error;
    }
  };

  const joinRoom = async () => {
    console.log('🚪 Joining room...');
    try {
      const response = await apiCall('/api/join', {
        method: 'POST',
        body: JSON.stringify({ userId, name: userName })
      });
      
      if (response.ok) {
        console.log('✅ Successfully joined room');
        setIsConnected(true);
      } else {
        console.error('❌ Failed to join room:', response.status);
      }
    } catch (error) {
      console.error('❌ Join room error:', error);
    }
  };

  const updateUsers = async () => {
    try {
      const response = await apiCall('/api/users');
      const data = await response.json();
      console.log('👥 Users updated:', data);
      setUsers(data.users);
      setCurrentSharer(data.presenter);
    } catch (error) {
      console.error('❌ Update users error:', error);
    }
  };

  const updateMessages = async () => {
    try {
      const response = await apiCall('/api/messages');
      const data = await response.json();
      console.log('💬 Messages updated:', data.messages.length, 'messages');
      setMessages(data.messages);
    } catch (error) {
      console.error('❌ Update messages error:', error);
    }
  };

  const captureAndSendFrame = () => {
    console.log('🎥 Starting frame capture...');
    if (!streamRef.current || !canvasRef.current || !isSharing || !videoRef.current) {
      console.warn('⚠️ Cannot capture frame - missing requirements:', {
        hasStream: !!streamRef.current,
        hasCanvas: !!canvasRef.current,
        isSharing,
        hasVideo: !!videoRef.current
      });
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const video = videoRef.current;
    
    if (!ctx) {
      console.error('❌ Cannot get canvas context');
      return;
    }

    let frameCount = 0;
    
    const sendFrame = () => {
      if (!isSharing || !streamRef.current || !video.videoWidth || video.readyState < 2) {
        console.warn('⚠️ Skipping frame - not ready:', {
          isSharing,
          hasStream: !!streamRef.current,
          videoWidth: video.videoWidth,
          readyState: video.readyState
        });
        return;
      }

      try {
        frameCount++;
        if (frameCount % 30 === 0) { // Log every 30th frame to reduce spam
          console.log(`📸 Capturing frame #${frameCount}`, {
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            readyState: video.readyState
          });
        }

        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw current video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert canvas to blob and send to server
        canvas.toBlob(async (blob) => {
          if (blob && isSharing) {
            if (frameCount % 30 === 0) { // Log every 30th frame
              console.log(`📤 Sending frame #${frameCount}, size: ${blob.size} bytes`);
            }
            
            const formData = new FormData();
            formData.append('frame', blob);
            formData.append('userId', userId);

            try {
              const response = await fetch('http://localhost:8080/api/frame', {
                method: 'POST',
                body: formData
              });
              
              if (response.ok) {
                if (frameCount % 30 === 0) {
                  console.log(`✅ Frame #${frameCount} sent successfully`);
                }
              } else {
                console.error(`❌ Frame #${frameCount} failed:`, response.status);
              }
            } catch (error) {
              console.error(`❌ Failed to send frame #${frameCount}:`, error);
            }
          } else {
            if (frameCount % 30 === 0) {
              console.warn(`⚠️ Skipping frame #${frameCount} - no blob or not sharing`);
            }
          }
        }, 'image/jpeg', settings.quality / 100);
      } catch (error) {
        console.error(`❌ Failed to capture frame #${frameCount}:`, error);
      }
    };

    // Start frame capture interval
    const intervalMs = Math.max(33, 1000 / settings.fps); // Minimum 33ms (30 FPS max)
    console.log(`⏱️ Starting frame interval: ${intervalMs}ms (${settings.fps} FPS)`);
    frameIntervalRef.current = setInterval(sendFrame, intervalMs);
  };

  const startSharing = async (sourceType: 'tab' | 'window' | 'screen' = 'screen') => {
    console.log(`🎬 Starting screen sharing - type: ${sourceType}`);
    
    try {
      let constraints: any = {
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: settings.fps, max: 60 }
        },
        audio: true
      };

      console.log('🎯 Media constraints:', constraints);

      // Get screen share stream from browser
      const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
      console.log('✅ Got display media stream:', stream);
      console.log('📺 Stream tracks:', stream.getTracks().map(t => ({ kind: t.kind, label: t.label })));

      streamRef.current = stream;
      
      if (videoRef.current) {
        console.log('🎥 Setting video source...');
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        
        // Wait for video to be ready
        await new Promise((resolve, reject) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              console.log('✅ Video metadata loaded');
              videoRef.current?.play().then(() => {
                console.log('▶️ Video playing');
                resolve(true);
              }).catch(reject);
            };
            
            videoRef.current.onerror = (e) => {
              console.error('❌ Video error:', e);
              reject(e);
            };
          }
        });
      }

      // Notify server that we're sharing
      console.log('📡 Notifying server about sharing...');
      await apiCall('/api/start_sharing', {
        method: 'POST',
        body: JSON.stringify({ userId })
      });

      setIsSharing(true);
      setShowShareModal(false);
      console.log('✅ Screen sharing started successfully');

      // Start capturing and sending frames after a short delay
      setTimeout(() => {
        console.log('⏰ Starting frame capture after delay...');
        captureAndSendFrame();
      }, 1000);

      // Handle stream end (when user stops sharing via browser)
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        console.log('🛑 Stream ended by user');
        stopSharing();
      });

    } catch (error) {
      console.error('❌ Failed to start screen sharing:', error);
      if (error instanceof Error && error.name === 'NotAllowedError') {
        alert('Screen sharing permission denied. Please allow screen sharing and try again.');
      } else if (error instanceof Error && error.name === 'NotSupportedError') {
        alert('Screen sharing is not supported in this browser. Please use Chrome, Firefox, or Edge.');
      } else {
        alert('Screen sharing failed. Please try again.');
      }
      setShowShareModal(false);
    }
  };

  const stopSharing = async () => {
    console.log('🛑 Stopping screen share...');
    
    try {
      // Stop the media stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log('🛑 Stopped track:', track.kind);
        });
        streamRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
        console.log('🎥 Cleared video source');
      }

      // Clear frame interval
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = undefined;
        console.log('⏹️ Cleared frame interval');
      }

      // Notify server that we stopped sharing
      await apiCall('/api/stop_sharing', {
        method: 'POST',
        body: JSON.stringify({ userId })
      });

      setIsSharing(false);
      console.log('✅ Screen sharing stopped successfully');
    } catch (error) {
      console.error('❌ Failed to stop sharing:', error);
    }
  };

  const sendMessage = async () => {
    if (!messageInput.trim()) return;
    
    console.log('💬 Sending message:', messageInput);
    try {
      await apiCall('/api/message', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          text: messageInput,
          user: userName
        })
      });
      setMessageInput('');
      console.log('✅ Message sent successfully');
    } catch (error) {
      console.error('❌ Failed to send message:', error);
    }
  };

  const updateSettings = async (newSettings: Partial<ScreenShareSettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    console.log('⚙️ Updating settings:', updatedSettings);
    setSettings(updatedSettings);
    
    try {
      await apiCall('/api/settings', {
        method: 'POST',
        body: JSON.stringify(updatedSettings)
      });
      console.log('✅ Settings updated successfully');
    } catch (error) {
      console.error('❌ Failed to update settings:', error);
    }
  };

  const toggleFullscreen = () => {
    console.log('🖥️ Toggling fullscreen');
    const element = sharedImageRef.current || videoRef.current;
    if (element) {
      if (!document.fullscreenElement) {
        element.requestFullscreen?.() || (element as any).webkitRequestFullscreen?.();
      } else {
        document.exitFullscreen?.() || (document as any).webkitExitFullscreen?.();
      }
    }
  };

  // Load shared screen from server
  const loadSharedScreen = async () => {
    if (currentSharer && currentSharer !== userId && sharedImageRef.current) {
      try {
        const response = await fetch(`http://localhost:8080/api/frame?t=${Date.now()}`, {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        if (response.ok) {
          const blob = await response.blob();
          if (blob.size > 0) {
            console.log('🖼️ Loaded shared screen frame:', blob.size, 'bytes');
            const url = URL.createObjectURL(blob);
            sharedImageRef.current.src = url;
            sharedImageRef.current.style.display = 'block';
            sharedImageRef.current.onload = () => {
              console.log('✅ Image loaded successfully');
            };
            sharedImageRef.current.onerror = (e) => {
              console.error('❌ Image load error:', e);
            };
            
            // Clean up previous URL after a delay
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } else {
            console.log('⚠️ Empty frame received');
            sharedImageRef.current.style.display = 'none';
          }
        } else {
          console.log('⚠️ Frame request failed:', response.status);
          sharedImageRef.current.style.display = 'none';
        }
      } catch (error) {
        console.error('❌ Failed to load shared screen:', error);
        if (sharedImageRef.current) {
          sharedImageRef.current.style.display = 'none';
        }
      }
    }
  };

  const openShareModal = () => {
    console.log('📱 Opening share modal');
    setShowShareModal(true);
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'screen':
        return <MonitorSpeaker className="w-12 h-12 text-blue-600" />;
      case 'window':
        return <WindowIcon className="w-12 h-12 text-blue-600" />;
      case 'tab':
        return <Chrome className="w-12 h-12 text-blue-600" />;
      default:
        return <Monitor className="w-12 h-12 text-blue-600" />;
    }
  };

  const getSourceDescription = (type: string) => {
    switch (type) {
      case 'screen':
        return 'Share your entire screen';
      case 'window':
        return 'Share a specific application window';
      case 'tab':
        return 'Share a Chrome browser tab';
      default:
        return 'Share content';
    }
  };

  // Effects
  useEffect(() => {
    console.log('🔄 Component mounted, joining room...');
    joinRoom();
  }, []);

  useEffect(() => {
    if (!isConnected) {
      console.log('⚠️ Not connected, skipping polling');
      return;
    }

    console.log('⏰ Starting polling intervals...');
    const pollInterval = setInterval(async () => {
      updateUsers();
      updateMessages();
      if (!isSharing && currentSharer && currentSharer !== userId) {
        await loadSharedScreen();
      }
    }, 200); // Even faster polling for smoother video

    return () => {
      console.log('🛑 Clearing polling interval');
      clearInterval(pollInterval);
    };
  }, [isConnected, isSharing, currentSharer, userId]);

  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 Component unmounting, cleaning up...');
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 mb-6 shadow-lg border border-white/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Monitor className="w-8 h-8 text-indigo-600" />
              <h1 className="text-2xl font-bold text-gray-800">Screen Share Pro</h1>
              <div className="ml-4 px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                {userName}
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <Wifi className="w-5 h-5 text-green-500" />
                ) : (
                  <WifiOff className="w-5 h-5 text-red-500" />
                )}
                <span className={`text-sm font-medium ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Status:</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  isSharing ? 'bg-green-100 text-green-800' : amIPresenter ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {isSharing ? 'Presenting' : amIPresenter ? 'Presenter' : 'Viewer'}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600">{Object.keys(users).length} users</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Video Area */}
          <div className="lg:col-span-3">
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
              <div className="relative bg-black rounded-xl overflow-hidden min-h-[400px] flex items-center justify-center">
                {isSharing ? (
                  // Show local video when sharing
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="max-w-full max-h-[500px] object-contain"
                    onLoadedMetadata={() => console.log('🎥 Video metadata loaded')}
                    onPlay={() => console.log('▶️ Video started playing')}
                    onError={(e) => console.error('❌ Video error:', e)}
                  />
                ) : currentSharer ? (
                  // Show shared screen from server when someone else is sharing
                  <img
                    ref={sharedImageRef}
                    className="max-w-full max-h-[500px] object-contain rounded-lg"
                    alt="Shared screen"
                    style={{ display: 'none', backgroundColor: '#000' }}
                    onLoad={() => console.log('🖼️ Shared image loaded')}
                    onError={(e) => console.error('❌ Shared image error:', e)}
                  />
                ) : (
                  // Show placeholder when no one is sharing
                  <div className="text-gray-400 text-center">
                    <Monitor className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg">No screen being shared</p>
                    <p className="text-sm mt-2">Click "Present Screen" to share your screen</p>
                  </div>
                )}
                
                {(isSharing || (currentSharer && sharedImageRef.current?.style.display !== 'none')) && (
                  <button 
                    onClick={toggleFullscreen}
                    className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg transition-colors"
                  >
                    <Maximize className="w-5 h-5" />
                  </button>
                )}
              </div>
              
              {/* Controls */}
              <div className="flex gap-3 mt-6">
                {!isSharing ? (
                  <button
                    onClick={openShareModal}
                    disabled={!amIPresenter}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg transition-colors font-medium"
                  >
                    <Presentation className="w-5 h-5" />
                    Present Screen
                  </button>
                ) : (
                  <button
                    onClick={stopSharing}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg transition-colors font-medium"
                  >
                    <Square className="w-5 h-5" />
                    Stop Presenting
                  </button>
                )}
                
                {!amIPresenter && (
                  <button
                    onClick={() => apiCall('/api/request_presenter', {
                      method: 'POST',
                      body: JSON.stringify({ userId })
                    })}
                    className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors font-medium"
                  >
                    <User className="w-5 h-5" />
                    Request Presenter
                  </button>
                )}
              </div>

              {/* Hidden canvas for frame capture */}
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Participants */}
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-gray-800">Participants</h3>
              </div>
              
              <div className="space-y-2">
                {Object.entries(users).map(([id, user]) => (
                  <div key={id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-700">{user.name}</span>
                    {id === currentSharer && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                        Presenting
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Chat */}
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
              <div className="flex items-center gap-2 mb-4">
                <MessageCircle className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-gray-800">Chat</h3>
              </div>
              
              <div
                ref={chatMessagesRef}
                className="h-48 overflow-y-auto bg-gray-50 rounded-lg p-3 mb-3 space-y-2"
              >
                {messages.map((msg, index) => (
                  <div key={index} className="text-sm">
                    <span className="font-medium text-indigo-600">{msg.user}:</span>
                    <span className="ml-2 text-gray-700">{msg.text}</span>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  maxLength={200}
                />
                <button
                  onClick={sendMessage}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Settings */}
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-gray-800">Settings</h3>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target FPS</label>
                  <select
                    value={settings.fps}
                    onChange={(e) => updateSettings({ fps: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  >
                    <option value={15}>15 FPS</option>
                    <option value={30}>30 FPS</option>
                    <option value={60}>60 FPS</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quality: {settings.quality}%
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="95"
                    value={settings.quality}
                    onChange={(e) => updateSettings({ quality: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Share Screen Modal - Google Meet Style */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800">Choose what to share</h2>
                <button
                  onClick={() => {
                    console.log('❌ Closing share modal');
                    setShowShareModal(false);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Select what you'd like to share with everyone in the meeting
              </p>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => {
                  console.log('📑 Selected tab sharing');
                  setShareTab('tab');
                }}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  shareTab === 'tab'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Chrome Tab
              </button>
              <button
                onClick={() => {
                  console.log('🪟 Selected window sharing');
                  setShareTab('window');
                }}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  shareTab === 'window'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Window
              </button>
              <button
                onClick={() => {
                  console.log('🖥️ Selected screen sharing');
                  setShareTab('screen');
                }}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  shareTab === 'screen'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Entire Screen
              </button>
            </div>

            {/* Source Selection */}
            <div className="p-6">
              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={() => {
                    console.log(`🎯 Starting sharing with type: ${shareTab}`);
                    startSharing(shareTab);
                  }}
                  className="p-6 border-2 border-gray-200 hover:border-blue-300 rounded-lg transition-all hover:shadow-md text-left"
                >
                  <div className="flex items-center gap-4">
                    {getSourceIcon(shareTab)}
                    <div>
                      <h3 className="font-medium text-gray-800 capitalize">{shareTab === 'tab' ? 'Chrome Tab' : shareTab}</h3>
                      <p className="text-sm text-gray-600 mt-1">{getSourceDescription(shareTab)}</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  console.log('❌ Cancelled sharing');
                  setShowShareModal(false);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}