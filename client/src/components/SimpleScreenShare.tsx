import React, { useState, useRef, useEffect } from 'react';
import { 
  Monitor, 
  Square, 
  Users, 
  MessageCircle, 
  Send,
  Copy,
  Check,
  Settings,
  Mic,
  MicOff,
  Video,
  VideoOff
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

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
}

export default function SimpleScreenShare() {
  const [userId] = useState(() => uuidv4());
  const [userName, setUserName] = useState(() => `User ${Math.random().toString(36).substr(2, 4)}`);
  const [roomId, setRoomId] = useState('');
  const [isInRoom, setIsInRoom] = useState(false);
  const [isPresenting, setIsPresenting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [copied, setCopied] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Auto-scroll chat messages
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages]);

  const generateRoomId = () => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(id);
  };

  const copyRoomId = async () => {
    if (roomId) {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const joinRoom = () => {
    if (!roomId.trim() || !userName.trim()) return;
    
    setIsInRoom(true);
    setShowJoinModal(false);
    
    // Add self to participants
    const selfParticipant: Participant = {
      id: userId,
      name: userName,
      isPresenting: false
    };
    setParticipants([selfParticipant]);
    
    // Add welcome message
    const welcomeMessage: Message = {
      id: uuidv4(),
      userId: 'system',
      userName: 'System',
      text: `Welcome to room ${roomId}! You can now start screen sharing.`,
      timestamp: Date.now()
    };
    setMessages([welcomeMessage]);
  };

  const leaveRoom = () => {
    // Stop screen sharing if active
    if (isPresenting) {
      stopScreenShare();
    }
    
    // Reset state
    setIsInRoom(false);
    setParticipants([]);
    setMessages([]);
    setShowJoinModal(true);
  };

  const startScreenShare = async () => {
    try {
      console.log('🎬 Starting screen share...');
      
      const constraints: DisplayMediaStreamConstraints = {
        video: {
          frameRate: { ideal: 30, max: 60 },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          cursor: 'always' as any
        },
        audio: audioEnabled
      };

      const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
      console.log('✅ Got screen share stream:', {
        id: stream.id,
        active: stream.active,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length
      });
      
      localStreamRef.current = stream;
      
      if (localVideoRef.current) {
        const video = localVideoRef.current;
        
        // Clear any existing stream
        video.srcObject = null;
        
        // Wait a moment then set the new stream
        setTimeout(() => {
          video.srcObject = stream;
          video.muted = true;
          video.autoplay = true;
          video.playsInline = true;
          video.controls = true;
          
          console.log('🎥 Video element configured with stream');
          
          // Force play with multiple attempts
          const attemptPlay = async (attempts = 0) => {
            try {
              await video.play();
              console.log('✅ Video playing successfully');
              
              // Verify video is actually showing content
              setTimeout(() => {
                console.log('📊 Video status after play:', {
                  videoWidth: video.videoWidth,
                  videoHeight: video.videoHeight,
                  currentTime: video.currentTime,
                  paused: video.paused,
                  readyState: video.readyState
                });
                
                // If video has no dimensions, try recreating it
                if (video.videoWidth === 0 || video.videoHeight === 0) {
                  console.log('⚠️ Video has no dimensions, recreating...');
                  recreateVideoElement(stream);
                }
              }, 2000);
              
            } catch (error) {
              console.error(`❌ Video play attempt ${attempts + 1} failed:`, error);
              if (attempts < 3) {
                setTimeout(() => attemptPlay(attempts + 1), 1000);
              } else {
                console.log('🔄 All play attempts failed, recreating video element...');
                recreateVideoElement(stream);
              }
            }
          };
          
          attemptPlay();
          
          // Set up event listeners
          video.addEventListener('loadedmetadata', () => {
            console.log('📊 Video metadata loaded:', {
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight
            });
          });
          
          video.addEventListener('playing', () => {
            console.log('▶️ Video started playing');
          });
          
          video.addEventListener('error', (e) => {
            console.error('❌ Video error:', e);
            recreateVideoElement(stream);
          });
          
        }, 100);
      }

      setIsPresenting(true);
      
      // Update participant status
      setParticipants(prev => 
        prev.map(p => 
          p.id === userId ? { ...p, isPresenting: true } : { ...p, isPresenting: false }
        )
      );

      // Add system message
      const message: Message = {
        id: uuidv4(),
        userId: 'system',
        userName: 'System',
        text: `${userName} started screen sharing`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, message]);

      // Start canvas rendering system as backup
      setTimeout(() => startCanvasRender(stream), 3000);

      // Handle stream ending
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        console.log('🔚 Screen share ended');
        stopScreenShare();
      });

    } catch (error) {
      console.error('❌ Failed to start screen share:', error);
      alert('Failed to start screen sharing. Please make sure you grant permission and try again.');
    }
  };

  const recreateVideoElement = (stream: MediaStream) => {
    console.log('🔄 Recreating video element...');
    
    if (localVideoRef.current && localVideoRef.current.parentNode) {
      const parent = localVideoRef.current.parentNode;
      const newVideo = document.createElement('video');
      
      // Configure new video element
      newVideo.srcObject = stream;
      newVideo.autoplay = true;
      newVideo.muted = true;
      newVideo.playsInline = true;
      newVideo.controls = true;
      newVideo.className = 'w-full h-full max-h-[500px] object-contain';
      newVideo.style.backgroundColor = '#000';
      
      // Replace the old video
      parent.replaceChild(newVideo, localVideoRef.current);
      localVideoRef.current = newVideo;
      
      console.log('✅ Video element recreated');
      
      // Try to play the new video
      newVideo.play().then(() => {
        console.log('✅ Recreated video is playing');
      }).catch(error => {
        console.error('❌ Recreated video play failed:', error);
      });
      
      // Monitor for content
      setTimeout(() => {
        console.log('📊 Recreated video status:', {
          videoWidth: newVideo.videoWidth,
          videoHeight: newVideo.videoHeight,
          currentTime: newVideo.currentTime,
          paused: newVideo.paused
        });
      }, 2000);
    }
  };

  // Canvas rendering system for more reliable display
  const startCanvasRender = (stream: MediaStream) => {
    if (!canvasRef.current || !localVideoRef.current) return;
    
    const canvas = canvasRef.current;
    const video = localVideoRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    console.log('🎨 Starting canvas rendering system...');
    
    let animationId: number;
    let isRendering = true;
    
    const render = () => {
      if (!isRendering) return;
      
      try {
        // Check if video has valid dimensions and is playing
        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
          // Set canvas size to match video
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            console.log(`📐 Canvas resized to: ${canvas.width}x${canvas.height}`);
          }
          
          // Draw current video frame to canvas
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Check if we're actually drawing meaningful content
          const imageData = ctx.getImageData(0, 0, Math.min(100, canvas.width), Math.min(100, canvas.height));
          const pixels = imageData.data;
          let hasContent = false;
          
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i] > 30 || pixels[i + 1] > 30 || pixels[i + 2] > 30) {
              hasContent = true;
              break;
            }
          }
          
          if (hasContent) {
            // Show canvas instead of video if we have content
            canvas.style.display = 'block';
            video.style.display = 'none';
            console.log('✅ Canvas displaying content, hiding video element');
          } else {
            // Show video element if canvas has no content
            canvas.style.display = 'none';
            video.style.display = 'block';
          }
        }
      } catch (error) {
        console.error('❌ Canvas render error:', error);
      }
      
      animationId = requestAnimationFrame(render);
    };
    
    // Start rendering after a delay to let video load
    setTimeout(() => render(), 1000);
    
    // Stop rendering when stream ends
    stream.getVideoTracks().forEach(track => {
      track.addEventListener('ended', () => {
        console.log('🔚 Stream ended, stopping canvas render');
        isRendering = false;
        if (animationId) {
          cancelAnimationFrame(animationId);
        }
      });
    });
  };

  const stopScreenShare = () => {
    console.log('🛑 Stopping screen share...');
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    setIsPresenting(false);
    
    // Update participant status
    setParticipants(prev => 
      prev.map(p => 
        p.id === userId ? { ...p, isPresenting: false } : p
      )
    );

    // Add system message
    const message: Message = {
      id: uuidv4(),
      userId: 'system',
      userName: 'System',
      text: `${userName} stopped screen sharing`,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, message]);
  };

  const sendMessage = () => {
    if (!messageInput.trim()) return;

    const message: Message = {
      id: uuidv4(),
      userId,
      userName,
      text: messageInput.trim(),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, message]);
    setMessageInput('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Join Modal
  if (showJoinModal) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
          <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Join Screen Share</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Your Name
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter your name"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Room ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Enter room ID"
                />
                <button
                  onClick={generateRoomId}
                  className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors"
                >
                  Generate
                </button>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={joinRoom}
                disabled={!roomId.trim() || !userName.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md transition-colors"
              >
                Join Room
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Monitor className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Screen Share Pro</h1>
            <div className="flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900 rounded-full">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm text-green-700 dark:text-green-300">Room: {roomId}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={copyRoomId}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Room ID'}
            </button>
            <button
              onClick={leaveRoom}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
            >
              Leave Room
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Screen Share Area */}
        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Screen Share</h2>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAudioEnabled(!audioEnabled)}
                  className={`p-2 rounded-md transition-colors ${
                    audioEnabled 
                      ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400'
                  }`}
                >
                  {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setVideoEnabled(!videoEnabled)}
                  className={`p-2 rounded-md transition-colors ${
                    videoEnabled 
                      ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400'
                  }`}
                >
                  {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </button>
                {!isPresenting ? (
                  <button
                    onClick={startScreenShare}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                  >
                    <Monitor className="w-4 h-4" />
                    Start Sharing
                  </button>
                ) : (
                  <button
                    onClick={stopScreenShare}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                  >
                    <Square className="w-4 h-4" />
                    Stop Sharing
                  </button>
                )}
                {isPresenting && (
                  <button
                    onClick={() => {
                      if (localStreamRef.current) {
                        console.log('🔍 Debug info:', {
                          stream: localStreamRef.current,
                          video: localVideoRef.current,
                          canvas: canvasRef.current,
                          streamActive: localStreamRef.current.active,
                          videoTracks: localStreamRef.current.getVideoTracks().length,
                          videoElement: {
                            videoWidth: localVideoRef.current?.videoWidth,
                            videoHeight: localVideoRef.current?.videoHeight,
                            readyState: localVideoRef.current?.readyState,
                            paused: localVideoRef.current?.paused,
                            currentTime: localVideoRef.current?.currentTime
                          }
                        });
                        
                        // Force canvas render
                        if (localStreamRef.current) {
                          startCanvasRender(localStreamRef.current);
                        }
                      }
                    }}
                    className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md transition-colors text-sm"
                  >
                    Debug
                  </button>
                )}
              </div>
            </div>
            
            {/* Video Container */}
            <div className="relative bg-gray-900 rounded-lg overflow-hidden min-h-[400px] flex items-center justify-center">
              {isPresenting ? (
                <div className="relative w-full h-full">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    controls
                    className="w-full h-full max-h-[500px] object-contain bg-black"
                    style={{ minHeight: '400px' }}
                  />
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{ display: 'none', minHeight: '400px' }}
                  />
                  <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 rounded text-xs">
                    🔴 LIVE
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-400">
                  <Monitor className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">No screen share active</p>
                  <p className="text-sm opacity-75">Click "Start Sharing" to begin</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Participants */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Participants ({participants.length})
              </h3>
            </div>
            <div className="space-y-2">
              {participants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center gap-3 p-2 rounded-md bg-gray-50 dark:bg-gray-700"
                >
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                    {participant.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {participant.name}
                      {participant.id === userId && ' (You)'}
                    </p>
                    {participant.isPresenting && (
                      <p className="text-xs text-green-600 dark:text-green-400">Presenting</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chat */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-4">
              <MessageCircle className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Chat</h3>
            </div>
            
            <div
              ref={chatMessagesRef}
              className="h-64 overflow-y-auto border rounded-md p-3 mb-3 bg-gray-50 dark:bg-gray-700"
            >
              {messages.map((message) => (
                <div key={message.id} className="mb-2">
                  <div className="flex items-start gap-2">
                    <span className={`text-xs font-medium ${
                      message.userId === 'system' 
                        ? 'text-blue-600 dark:text-blue-400'
                        : message.userId === userId
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {message.userName}:
                    </span>
                  </div>
                  <p className="text-sm text-gray-900 dark:text-white ml-2">{message.text}</p>
                </div>
              ))}
            </div>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <button
                onClick={sendMessage}
                disabled={!messageInput.trim()}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}