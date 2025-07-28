import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Monitor, 
  Users, 
  MessageCircle, 
  Settings, 
  Presentation, 
  Square, 
  Send, 
  Maximize, 
  Wifi, 
  WifiOff, 
  User, 
  X, 
  Chrome, 
  AppWindow as WindowIcon, 
  MonitorSpeaker,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  Copy,
  Check
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface Participant {
  id: string;
  name: string;
  isPresenting: boolean;
  stream?: MediaStream;
  videoElement?: HTMLVideoElement;
}

interface Message {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
}

interface ScreenShareSettings {
  fps: number;
  quality: number;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

export default function ScreenShareApp() {
  const [userId] = useState(() => uuidv4());
  const [userName, setUserName] = useState(() => `User ${Math.random().toString(36).substr(2, 4)}`);
  const [roomId, setRoomId] = useState('');
  const [isInRoom, setIsInRoom] = useState(false);
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isPresenting, setIsPresenting] = useState(false);
  const [currentPresenter, setCurrentPresenter] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareType, setShareType] = useState<'screen' | 'window' | 'tab'>('screen');
  const [isConnected, setIsConnected] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(true);
  const [copied, setCopied] = useState(false);
  
  const [settings, setSettings] = useState<ScreenShareSettings>({
    fps: 30,
    quality: 85,
    audioEnabled: true,
    videoEnabled: true
  });

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // WebRTC Configuration
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  // Simulated signaling server using localStorage for demo
  const sendSignal = useCallback((targetId: string, signal: any) => {
    const signals = JSON.parse(localStorage.getItem(`signals_${roomId}`) || '[]');
    signals.push({
      id: uuidv4(),
      from: userId,
      to: targetId,
      signal,
      timestamp: Date.now()
    });
    localStorage.setItem(`signals_${roomId}`, JSON.stringify(signals));
    
    // Trigger storage event for other tabs
    window.dispatchEvent(new StorageEvent('storage', {
      key: `signals_${roomId}`,
      newValue: JSON.stringify(signals)
    }));
  }, [roomId, userId]);

  const broadcastSignal = useCallback((signal: any) => {
    participants.forEach((_, participantId) => {
      if (participantId !== userId) {
        sendSignal(participantId, signal);
      }
    });
  }, [participants, userId, sendSignal]);

  // Handle incoming signals
  useEffect(() => {
    if (!roomId || !isInRoom) return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `signals_${roomId}` && e.newValue) {
        const signals = JSON.parse(e.newValue);
        const mySignals = signals.filter((s: any) => s.to === userId && !s.processed);
        
        mySignals.forEach(async (signalData: any) => {
          const { from, signal } = signalData;
          
          if (signal.type === 'offer') {
            await handleOffer(from, signal);
          } else if (signal.type === 'answer') {
            await handleAnswer(from, signal);
          } else if (signal.type === 'ice-candidate') {
            await handleIceCandidate(from, signal);
          } else if (signal.type === 'user-joined') {
            handleUserJoined(signal.user);
          } else if (signal.type === 'user-left') {
            handleUserLeft(from);
          } else if (signal.type === 'presentation-started') {
            setCurrentPresenter(from);
          } else if (signal.type === 'presentation-stopped') {
            setCurrentPresenter(null);
          } else if (signal.type === 'chat-message') {
            handleChatMessage(signal.message);
          }
          
          // Mark signal as processed
          signalData.processed = true;
        });
        
        // Update localStorage with processed signals
        localStorage.setItem(`signals_${roomId}`, JSON.stringify(signals));
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [roomId, isInRoom, userId]);

  const createPeerConnection = useCallback((participantId: string) => {
    console.log(`🔗 [WEBRTC] Creating peer connection for participant: ${participantId}`);
    const pc = new RTCPeerConnection(rtcConfig);
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 [ICE] Sending ICE candidate to ${participantId}:`, event.candidate.candidate);
        sendSignal(participantId, {
          type: 'ice-candidate',
          candidate: event.candidate
        });
      } else {
        console.log(`🧊 [ICE] ICE gathering complete for ${participantId}`);
      }
    };

    pc.ontrack = (event) => {
      console.log(`📺 [WEBRTC] Received remote stream from ${participantId}:`, {
        streams: event.streams.length,
        track: {
          kind: event.track.kind,
          label: event.track.label,
          enabled: event.track.enabled,
          readyState: event.track.readyState
        }
      });
      
      if (remoteVideoRef.current) {
        console.log(`🎥 [WEBRTC] Setting remote video srcObject for ${participantId}`);
        remoteVideoRef.current.srcObject = event.streams[0];
        remoteVideoRef.current.play().catch(error => {
          console.error(`❌ [WEBRTC] Failed to play remote video from ${participantId}:`, error);
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`🔗 [WEBRTC] Connection state changed for ${participantId}:`, pc.connectionState);
    };
    
    pc.oniceconnectionstatechange = () => {
      console.log(`🧊 [ICE] ICE connection state changed for ${participantId}:`, pc.iceConnectionState);
    };
    
    pc.onicegatheringstatechange = () => {
      console.log(`🧊 [ICE] ICE gathering state changed for ${participantId}:`, pc.iceGatheringState);
    };

    pc.ondatachannel = (event) => {
      console.log(`💬 [DATA_CHANNEL] Received data channel from ${participantId}`);
      const channel = event.channel;
      channel.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'chat') {
          console.log(`💬 [CHAT] Received message from ${participantId}:`, data.message.text);
          handleChatMessage(data.message);
        }
      };
      dataChannelsRef.current.set(participantId, channel);
    };

    peerConnectionsRef.current.set(participantId, pc);
    console.log(`✅ [WEBRTC] Peer connection created for ${participantId}`);
    return pc;
  }, [sendSignal]);

  const handleOffer = async (from: string, offer: RTCSessionDescriptionInit) => {
    console.log(`📥 [WEBRTC] Handling offer from ${from}`);
    const pc = createPeerConnection(from);
    await pc.setRemoteDescription(offer);
    console.log(`✅ [WEBRTC] Set remote description for ${from}`);
    
    if (localStreamRef.current) {
      console.log(`➕ [WEBRTC] Adding local stream tracks to peer connection for ${from}`);
      localStreamRef.current.getTracks().forEach(track => {
        console.log(`➕ [WEBRTC] Adding track: ${track.kind} - ${track.label}`);
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.log(`📤 [WEBRTC] Sending answer to ${from}`);
    sendSignal(from, { type: 'answer', ...answer });
  };

  const handleAnswer = async (from: string, answer: RTCSessionDescriptionInit) => {
    console.log(`📥 [WEBRTC] Handling answer from ${from}`);
    const pc = peerConnectionsRef.current.get(from);
    if (pc) {
      await pc.setRemoteDescription(answer);
      console.log(`✅ [WEBRTC] Set remote description (answer) for ${from}`);
    } else {
      console.error(`❌ [WEBRTC] No peer connection found for ${from} when handling answer`);
    }
  };

  const handleIceCandidate = async (from: string, candidateData: any) => {
    console.log(`🧊 [ICE] Handling ICE candidate from ${from}:`, candidateData.candidate.candidate);
    const pc = peerConnectionsRef.current.get(from);
    if (pc) {
      await pc.addIceCandidate(candidateData.candidate);
      console.log(`✅ [ICE] Added ICE candidate for ${from}`);
    } else {
      console.error(`❌ [ICE] No peer connection found for ${from} when handling ICE candidate`);
    }
  };

  const handleUserJoined = (user: Participant) => {
    console.log(`👤 [USER] User joined:`, user);
    setParticipants(prev => new Map(prev.set(user.id, user)));
    setIsConnected(true);
  };

  const handleUserLeft = (userId: string) => {
    console.log(`👤 [USER] User left: ${userId}`);
    setParticipants(prev => {
      const newMap = new Map(prev);
      newMap.delete(userId);
      return newMap;
    });
    
    // Clean up peer connection
    const pc = peerConnectionsRef.current.get(userId);
    if (pc) {
      console.log(`🔗 [WEBRTC] Closing peer connection for ${userId}`);
      pc.close();
      peerConnectionsRef.current.delete(userId);
    }
    
    dataChannelsRef.current.delete(userId);
  };

  const handleChatMessage = (message: Message) => {
    console.log(`💬 [CHAT] Adding message:`, message);
    setMessages(prev => [...prev, message]);
  };

  const joinRoom = async () => {
    if (!roomId.trim() || !userName.trim()) return;

    console.log(`🚪 [ROOM] Joining room: ${roomId} as ${userName}`);
    setIsInRoom(true);
    setShowJoinModal(false);
    setIsConnected(true);

    // Add self to participants
    const selfParticipant: Participant = {
      id: userId,
      name: userName,
      isPresenting: false
    };
    
    setParticipants(prev => new Map(prev.set(userId, selfParticipant)));
    console.log(`👤 [ROOM] Added self to participants`);

    // Announce joining to other participants
    console.log(`📢 [SIGNALING] Broadcasting user joined`);
    broadcastSignal({
      type: 'user-joined',
      user: selfParticipant
    });

    // Load existing participants from localStorage
    const existingParticipants = JSON.parse(localStorage.getItem(`participants_${roomId}`) || '[]');
    console.log(`👥 [ROOM] Found ${existingParticipants.length} existing participants`);
    existingParticipants.forEach((p: Participant) => {
      if (p.id !== userId) {
        console.log(`👤 [ROOM] Adding existing participant: ${p.name}`);
        setParticipants(prev => new Map(prev.set(p.id, p)));
      }
    });

    // Save self to localStorage
    const allParticipants = [...existingParticipants.filter((p: Participant) => p.id !== userId), selfParticipant];
    localStorage.setItem(`participants_${roomId}`, JSON.stringify(allParticipants));
    console.log(`💾 [ROOM] Saved participants to localStorage`);
  };

  const leaveRoom = () => {
    // Stop all streams
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // Close all peer connections
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    dataChannelsRef.current.clear();

    // Announce leaving
    broadcastSignal({
      type: 'user-left'
    });

    // Remove self from localStorage
    const existingParticipants = JSON.parse(localStorage.getItem(`participants_${roomId}`) || '[]');
    const filteredParticipants = existingParticipants.filter((p: Participant) => p.id !== userId);
    localStorage.setItem(`participants_${roomId}`, JSON.stringify(filteredParticipants));

    // Reset state
    setIsInRoom(false);
    setParticipants(new Map());
    setMessages([]);
    setIsPresenting(false);
    setCurrentPresenter(null);
    setIsConnected(false);
    setShowJoinModal(true);
  };

  const startScreenShare = async () => {
    console.log('🎬 [SCREEN_SHARE] Starting screen share process...');
    try {
      const constraints: DisplayMediaStreamConstraints = {
        video: {
          mediaSource: 'screen' as any,
          frameRate: settings.fps,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          cursor: 'always' as any,
          displaySurface: 'monitor' as any
        },
        audio: settings.audioEnabled
      };

      console.log('🎯 [SCREEN_SHARE] Requesting display media with constraints:', constraints);
      const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
      console.log('✅ [SCREEN_SHARE] Got display media stream:', {
        id: stream.id,
        active: stream.active,
        tracks: stream.getTracks().map(track => ({
          kind: track.kind,
          label: track.label,
          enabled: track.enabled,
          readyState: track.readyState,
          settings: track.getSettings()
        }))
      });
      
      // Additional debugging for video tracks
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        console.log('🎬 [SCREEN_SHARE] Video track details:', {
          label: videoTracks[0].label,
          enabled: videoTracks[0].enabled,
          readyState: videoTracks[0].readyState,
          muted: videoTracks[0].muted,
          settings: videoTracks[0].getSettings(),
          capabilities: videoTracks[0].getCapabilities()
        });
      } else {
        console.warn('⚠️ [SCREEN_SHARE] No video tracks found in stream');
      }
      
      localStreamRef.current = stream;

      // Set up video element with proper screen sharing configuration
      if (localVideoRef.current) {
        const video = localVideoRef.current;
        
        console.log('🎥 [SCREEN_SHARE] Setting up video element with stream...');
        console.log('🎬 [SCREEN_SHARE] Stream details:', {
          id: stream.id,
          active: stream.active,
          tracks: stream.getTracks().map(track => ({
            kind: track.kind,
            label: track.label,
            enabled: track.enabled,
            readyState: track.readyState,
            muted: track.muted
          }))
        });
        
        // Clear any existing source
        video.srcObject = null;
        video.load();
        
        // Wait a moment for the reset to complete
        setTimeout(() => {
          console.log('🔄 [SCREEN_SHARE] Assigning stream to video element...');
          
          // Force remove any existing srcObject
          video.srcObject = null;
          video.removeAttribute('src');
          
          // Wait for cleanup, then set new stream
          setTimeout(() => {
            // Modern approach - set srcObject directly
            if ('srcObject' in video) {
              video.srcObject = stream;
            } else {
              // Fallback for older browsers
              video.src = URL.createObjectURL(stream);
            }
            
            // Configure video properties immediately after setting source
            video.muted = true;
            video.autoplay = true;
            video.playsInline = true;
            video.controls = true;
            
            // Force video to reload with new stream
            video.load();
            
            console.log('✅ [SCREEN_SHARE] Stream assigned and video loaded');
          }, 50);
          
          console.log('⚙️ [SCREEN_SHARE] Video element configured:', {
            muted: video.muted,
            autoplay: video.autoplay,
            playsInline: video.playsInline,
            controls: video.controls,
            srcObject: !!video.srcObject
          });
          
          // Set up canvas drawing system to force display screen content
          const setupCanvasDisplay = () => {
            if (canvasRef.current) {
              const canvas = canvasRef.current;
              const ctx = canvas.getContext('2d');
              
              if (ctx) {
                console.log('🎨 [CANVAS] Setting up canvas display system');
                
                // Set canvas size to match video
                const updateCanvasSize = () => {
                  if (video.videoWidth > 0 && video.videoHeight > 0) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    console.log('📐 [CANVAS] Canvas size set to:', canvas.width, 'x', canvas.height);
                  }
                };
                
                // Continuous drawing loop
                let isDrawing = true;
                const drawFrame = () => {
                  if (!isDrawing) return;
                  
                  try {
                    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
                      updateCanvasSize();
                      
                      // Draw video frame to canvas
                      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                      
                      // Check if we're actually drawing content
                      const imageData = ctx.getImageData(0, 0, Math.min(canvas.width, 100), Math.min(canvas.height, 100));
                      const pixels = imageData.data;
                      let hasContent = false;
                      
                      for (let i = 0; i < pixels.length; i += 4) {
                        if (pixels[i] > 20 || pixels[i + 1] > 20 || pixels[i + 2] > 20) {
                          hasContent = true;
                          break;
                        }
                      }
                      
                      if (hasContent) {
                        console.log('✅ [CANVAS] Successfully drawing screen content to canvas');
                        // Hide video element, show canvas
                        video.style.display = 'none';
                        canvas.style.display = 'block';
                        isDrawing = false; // Stop continuous drawing once we confirm it's working
                        
                        // Set up periodic refresh
                        const refreshInterval = setInterval(() => {
                          if (video.readyState >= 2) {
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                          }
                        }, 1000 / 30); // 30 FPS
                        
                        // Clean up on stream end
                        stream.getTracks().forEach(track => {
                          track.addEventListener('ended', () => {
                            clearInterval(refreshInterval);
                            isDrawing = false;
                          });
                        });
                      }
                    }
                  } catch (error) {
                    console.error('❌ [CANVAS] Drawing error:', error);
                  }
                  
                  if (isDrawing) {
                    requestAnimationFrame(drawFrame);
                  }
                };
                
                // Start drawing after video is ready
                video.addEventListener('playing', () => {
                  console.log('🎬 [CANVAS] Video playing, starting canvas drawing');
                  setTimeout(drawFrame, 500);
                });
                
                // Also try starting immediately if video is already playing
                if (!video.paused && video.readyState >= 2) {
                  setTimeout(drawFrame, 500);
                }
              }
            }
          };
          
          // Set up canvas display system
          setupCanvasDisplay();
          
          // Handle different video events
          video.addEventListener('loadstart', () => {
            console.log('🔄 [SCREEN_SHARE] Video load started');
          });
          
          video.addEventListener('loadedmetadata', () => {
            console.log('🎥 [SCREEN_SHARE] Video metadata loaded:', {
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              duration: video.duration,
              readyState: video.readyState
            });
          });
          
          video.addEventListener('loadeddata', () => {
            console.log('📊 [SCREEN_SHARE] Video data loaded');
          });
          
          video.addEventListener('canplay', () => {
            console.log('✅ [SCREEN_SHARE] Video can play');
          });
          
          video.addEventListener('canplaythrough', () => {
            console.log('✅ [SCREEN_SHARE] Video can play through');
          });
          
          video.addEventListener('playing', () => {
            console.log('▶️ [SCREEN_SHARE] Video is now playing');
            console.log('🎬 [SCREEN_SHARE] Final video state:', {
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              currentTime: video.currentTime,
              paused: video.paused,
              readyState: video.readyState,
              networkState: video.networkState
            });
            
            // Additional check for actual video content
            setTimeout(() => {
              if (video.videoWidth > 0 && video.videoHeight > 0 && video.currentTime > 0) {
                console.log('✅ [SCREEN_SHARE] Video has dimensions and is playing');
                
                // Try to detect if there's actual content by creating a canvas
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  canvas.width = video.videoWidth;
                  canvas.height = video.videoHeight;
                  ctx.drawImage(video, 0, 0);
                  
                  // Check if we have non-black pixels
                  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                  const pixels = imageData.data;
                  let hasContent = false;
                  
                  for (let i = 0; i < pixels.length; i += 4) {
                    if (pixels[i] > 10 || pixels[i + 1] > 10 || pixels[i + 2] > 10) {
                      hasContent = true;
                      break;
                    }
                  }
                  
                  console.log('🎨 [SCREEN_SHARE] Canvas content check:', {
                    hasContent,
                    canvasWidth: canvas.width,
                    canvasHeight: canvas.height,
                    pixelDataLength: pixels.length
                  });
                  
                  if (!hasContent) {
                    console.warn('⚠️ [SCREEN_SHARE] Video appears to be black - screen capture may not be working');
                    console.log('🔧 [SCREEN_SHARE] Suggestion: Try selecting a different source or check if the application window is visible');
                    
                    // Force video element recreation
                    console.log('🔄 [SCREEN_SHARE] Attempting to recreate video element...');
                    const newVideo = document.createElement('video');
                    newVideo.srcObject = stream;
                    newVideo.autoplay = true;
                    newVideo.muted = true;
                    newVideo.playsInline = true;
                    newVideo.controls = true;
                    newVideo.className = video.className;
                    newVideo.style.cssText = video.style.cssText;
                    
                    // Replace the video element
                    if (video.parentNode) {
                      video.parentNode.replaceChild(newVideo, video);
                      console.log('✅ [SCREEN_SHARE] Video element recreated');
                      
                      // Update the ref to point to the new video
                      if (localVideoRef.current === video) {
                        localVideoRef.current = newVideo;
                      }
                    }
                  }
                }
              } else {
                console.warn('⚠️ [SCREEN_SHARE] Video element not showing proper dimensions or time');
              }
            }, 3000);
          });
          
          video.addEventListener('pause', () => {
            console.log('⏸️ [SCREEN_SHARE] Video paused');
          });
          
          video.addEventListener('error', (e) => {
            console.error('❌ [SCREEN_SHARE] Video error:', e);
            console.error('❌ [SCREEN_SHARE] Video error details:', {
              error: video.error,
              networkState: video.networkState,
              readyState: video.readyState
            });
          });
          
          // Force play attempt with multiple tries
          const forcePlay = async () => {
            try {
              await video.play();
              console.log('✅ [SCREEN_SHARE] Video play promise resolved');
              
              // Keep checking if video stays playing
              const checkPlaying = setInterval(() => {
                if (video.paused && !video.ended) {
                  console.log('⚠️ [SCREEN_SHARE] Video paused unexpectedly, trying to resume');
                  video.play().catch(err => {
                    console.error('❌ [SCREEN_SHARE] Resume play failed:', err);
                  });
                } else if (!video.paused && video.currentTime > 0) {
                  console.log('✅ [SCREEN_SHARE] Video is actively playing');
                  clearInterval(checkPlaying);
                }
              }, 1000);
              
              // Stop checking after 10 seconds
              setTimeout(() => clearInterval(checkPlaying), 10000);
              
            } catch (err) {
              console.error('❌ [SCREEN_SHARE] Video play promise rejected:', err);
            }
          };
          
          // Try playing immediately and after short delays
          forcePlay();
          setTimeout(forcePlay, 500);
          setTimeout(forcePlay, 1000);
          
          // Handle tab focus for Chrome bug
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden && video.paused) {
              console.log('👁️ [SCREEN_SHARE] Tab focused, trying to resume video');
              video.play().catch(err => {
                console.error('❌ [SCREEN_SHARE] Resume play failed:', err);
              });
            }
          });
          
          // Handle stream track ended
          stream.getVideoTracks().forEach(track => {
            track.addEventListener('ended', () => {
              console.log('🔚 [SCREEN_SHARE] Video track ended');
              video.srcObject = null;
            });
          });
          
          // Create a simple test video element to verify stream works
          console.log('🧪 [TEST] Creating test video element...');
          const testVideo = document.createElement('video');
          testVideo.srcObject = stream;
          testVideo.autoplay = true;
          testVideo.muted = true;
          testVideo.playsInline = true;
          testVideo.controls = true;
          testVideo.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 300px;
            height: 200px;
            z-index: 9999;
            border: 3px solid #00ff00;
            background: black;
          `;
          
          document.body.appendChild(testVideo);
          
          testVideo.play().then(() => {
            console.log('🧪 [TEST] Test video element is working');
            
            // Check if test video shows content after a delay
            setTimeout(() => {
              console.log('🧪 [TEST] Test video status:', {
                videoWidth: testVideo.videoWidth,
                videoHeight: testVideo.videoHeight,
                readyState: testVideo.readyState,
                paused: testVideo.paused,
                currentTime: testVideo.currentTime
              });
              
              // Always replace main video with test video if it has dimensions
              if (testVideo.videoWidth > 0 && testVideo.videoHeight > 0) {
                console.log('✅ [TEST] Test video has content - replacing main video');
                
                // Create new video element with same stream
                const newVideo = document.createElement('video');
                newVideo.srcObject = stream;
                newVideo.autoplay = true;
                newVideo.muted = true;
                newVideo.playsInline = true;
                newVideo.controls = true;
                newVideo.className = 'w-full h-full object-contain';
                newVideo.style.minHeight = '400px';
                newVideo.style.maxHeight = '500px';
                newVideo.style.background = '#1a1a1a';
                newVideo.style.border = '1px solid #333';
                newVideo.style.display = 'block';
                newVideo.style.visibility = 'visible';
                
                // Replace the main video element
                if (video.parentNode) {
                  video.parentNode.replaceChild(newVideo, video);
                  localVideoRef.current = newVideo;
                  console.log('✅ [TEST] Main video element replaced with working version');
                  
                  // Force play the new video
                  newVideo.play().then(() => {
                    console.log('✅ [TEST] New main video is playing');
                  }).catch(err => {
                    console.error('❌ [TEST] New main video play failed:', err);
                  });
                }
              } else {
                console.warn('⚠️ [TEST] Test video has no dimensions - stream may not be working');
              }
            }, 2000);
          }).catch(err => {
            console.error('❌ [TEST] Test video element failed:', err);
          });
          
          // Remove test video after 20 seconds
          setTimeout(() => {
            if (document.body.contains(testVideo)) {
              document.body.removeChild(testVideo);
              console.log('🧪 [TEST] Test video element removed');
            }
          }, 20000);
          
        }, 100); // Small delay to ensure clean state
      }

      // Add stream to all peer connections
      peerConnectionsRef.current.forEach(async (pc, participantId) => {
        console.log(`🔗 [WEBRTC] Adding stream to peer connection for participant: ${participantId}`);
        // Remove existing tracks
        const senders = pc.getSenders();
        console.log(`🗑️ [WEBRTC] Removing ${senders.length} existing senders`);
        senders.forEach(sender => {
          if (sender.track) {
            pc.removeTrack(sender);
          }
        });
        
        // Add new tracks
        stream.getTracks().forEach((track, index) => {
          console.log(`➕ [WEBRTC] Adding track ${index + 1}/${stream.getTracks().length}:`, {
            kind: track.kind,
            label: track.label,
            enabled: track.enabled,
            readyState: track.readyState
          });
          const sender = pc.addTrack(track, stream);
          console.log('✅ [WEBRTC] Track added, sender:', sender);
        });

        // Create new offer
        console.log(`📤 [WEBRTC] Creating offer for participant: ${participantId}`);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log(`📡 [WEBRTC] Sending offer to participant: ${participantId}`);
        sendSignal(participantId, { type: 'offer', ...offer });
      });

      setIsPresenting(true);
      setCurrentPresenter(userId);
      setShowShareModal(false);
      
      console.log('✅ [SCREEN_SHARE] Screen sharing setup complete');

      // Announce presentation start
      console.log('📢 [SIGNALING] Broadcasting presentation start');
      broadcastSignal({
        type: 'presentation-started'
      });

      // Handle stream end
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener('ended', () => {
          console.log('🛑 [SCREEN_SHARE] Video track ended, stopping share');
          stopScreenShare();
        });
      }
      
      // Add additional event listeners for debugging
      stream.getTracks().forEach((track, index) => {
        track.addEventListener('ended', () => {
          console.log(`🛑 [TRACK] Track ${index} (${track.kind}) ended`);
        });
        track.addEventListener('mute', () => {
          console.log(`🔇 [TRACK] Track ${index} (${track.kind}) muted`);
        });
        track.addEventListener('unmute', () => {
          console.log(`🔊 [TRACK] Track ${index} (${track.kind}) unmuted`);
        });
      });

    } catch (error) {
      console.error('❌ [SCREEN_SHARE] Failed to start screen sharing:', error);
      
      let errorMessage = 'Failed to start screen sharing. ';
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage += 'Permission denied. Please allow screen sharing and try again.';
        } else if (error.name === 'NotSupportedError') {
          errorMessage += 'Screen sharing is not supported in this browser.';
        } else if (error.name === 'NotFoundError') {
          errorMessage += 'No screen sharing source found.';
        } else {
          errorMessage += `Error: ${error.message}`;
        }
      }
      
      alert(errorMessage);
      setShowShareModal(false);
    }
  };

  const stopScreenShare = () => {
    console.log('🛑 [SCREEN_SHARE] Stopping screen share...');
    
    if (localStreamRef.current) {
      console.log('🛑 [SCREEN_SHARE] Stopping all tracks...');
      localStreamRef.current.getTracks().forEach((track, index) => {
        console.log(`🛑 [TRACK] Stopping track ${index}: ${track.kind} - ${track.label}`);
        track.stop();
      });
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      console.log('🎥 [SCREEN_SHARE] Clearing video element');
      localVideoRef.current.srcObject = null;
    }

    setIsPresenting(false);
    setCurrentPresenter(null);
    
    console.log('📢 [SIGNALING] Broadcasting presentation stop');

    // Announce presentation stop
    broadcastSignal({
      type: 'presentation-stopped'
    });
    
    console.log('✅ [SCREEN_SHARE] Screen sharing stopped successfully');
  };

  const sendChatMessage = () => {
    if (!messageInput.trim()) return;

    const message: Message = {
      id: uuidv4(),
      userId,
      userName,
      text: messageInput.trim(),
      timestamp: Date.now()
    };

    // Add to local messages
    setMessages(prev => [...prev, message]);

    // Send to all participants via data channels
    dataChannelsRef.current.forEach(channel => {
      if (channel.readyState === 'open') {
        channel.send(JSON.stringify({
          type: 'chat',
          message
        }));
      }
    });

    // Also broadcast via signaling for reliability
    broadcastSignal({
      type: 'chat-message',
      message
    });

    setMessageInput('');
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateRoomId = () => {
    const newRoomId = Math.random().toString(36).substr(2, 8).toUpperCase();
    setRoomId(newRoomId);
  };

  // Auto-scroll chat
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isInRoom) {
        leaveRoom();
      }
    };
  }, []);

  if (showJoinModal) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-white/20 max-w-md w-full">
          <div className="text-center mb-8">
            <Monitor className="w-12 h-12 text-indigo-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Screen Share Pro</h1>
            <p className="text-gray-600">Join or create a meeting room</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Room ID</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter room ID"
                />
                <button
                  onClick={generateRoomId}
                  className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                  title="Generate random room ID"
                >
                  🎲
                </button>
              </div>
            </div>

            <button
              onClick={joinRoom}
              disabled={!roomId.trim() || !userName.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white py-3 rounded-lg transition-colors font-medium"
            >
              Join Room
            </button>

            {roomId && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-blue-800">Share this Room ID:</span>
                  <button
                    onClick={copyRoomId}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div className="font-mono text-lg font-bold text-blue-900 mt-1">{roomId}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 mb-6 shadow-lg border border-white/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Monitor className="w-8 h-8 text-indigo-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Screen Share Pro</h1>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-sm text-gray-600">Room: <span className="font-mono font-bold">{roomId}</span></span>
                  <button
                    onClick={copyRoomId}
                    className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-sm"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">{userName}</span>
              </div>
              
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
                  isPresenting ? 'bg-green-100 text-green-800' : currentPresenter ? 'bg-gray-100 text-gray-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {isPresenting ? 'Presenting' : currentPresenter ? 'Viewing' : 'Ready'}
                </span>
              </div>
              
              <button
                onClick={leaveRoom}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
              >
                <Phone className="w-4 h-4" />
                Leave
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Video Area */}
          <div className="lg:col-span-3">
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
              <div className="relative bg-black rounded-xl overflow-hidden min-h-[400px] flex items-center justify-center">
                {isPresenting ? (
                  <div className="relative w-full h-full">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      controls
                      className="w-full h-full object-contain"
                      style={{ 
                        minHeight: '400px',
                        maxHeight: '500px',
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        display: 'block',
                        visibility: 'visible'
                      }}
                      onLoadedMetadata={() => console.log('🎥 [VIDEO] Local video metadata loaded')}
                      onPlay={() => console.log('▶️ [VIDEO] Local video started playing')}
                      onPause={() => console.log('⏸️ [VIDEO] Local video paused')}
                      onError={(e) => console.error('❌ [VIDEO] Local video error:', e)}
                      onLoadStart={() => console.log('🔄 [VIDEO] Local video load started')}
                      onCanPlay={() => console.log('✅ [VIDEO] Local video can play')}
                      onTimeUpdate={() => {
                        if (localVideoRef.current && localVideoRef.current.currentTime > 0) {
                          console.log('🎬 [VIDEO] Video is playing - time:', localVideoRef.current.currentTime);
                        }
                      }}
                      onClick={() => {
                        if (localVideoRef.current && localVideoRef.current.paused) {
                          console.log('🖱️ [VIDEO] Video clicked while paused, trying to play');
                          localVideoRef.current.play().catch(err => {
                            console.error('❌ [VIDEO] Click play failed:', err);
                          });
                        }
                      }}
                    />
                    <canvas
                      ref={canvasRef}
                      className="absolute inset-0 w-full h-full object-contain"
                      style={{ 
                        display: 'block',
                        minHeight: '400px',
                        maxHeight: '500px',
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        zIndex: 10
                      }}
                    />
                    <div className="absolute bottom-2 left-2 text-white text-xs bg-black bg-opacity-50 px-2 py-1 rounded">
                      {localVideoRef.current?.videoWidth}x{localVideoRef.current?.videoHeight} | 
                      Status: {localVideoRef.current?.readyState === 4 ? 'Ready' : 'Loading'}
                    </div>
                  </div>
                ) : currentPresenter ? (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                    style={{ minHeight: '400px' }}
                    onLoadedMetadata={() => console.log('🎥 [VIDEO] Remote video metadata loaded')}
                    onPlay={() => console.log('▶️ [VIDEO] Remote video started playing')}
                    onPause={() => console.log('⏸️ [VIDEO] Remote video paused')}
                    onError={(e) => console.error('❌ [VIDEO] Remote video error:', e)}
                    onLoadStart={() => console.log('🔄 [VIDEO] Remote video load started')}
                    onCanPlay={() => console.log('✅ [VIDEO] Remote video can play')}
                  />
                ) : (
                  <div className="text-gray-400 text-center">
                    <Monitor className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg">No screen being shared</p>
                    <p className="text-sm mt-2">Click "Present Screen" to share your screen</p>
                  </div>
                )}
                
                {(isPresenting || currentPresenter) && (
                  <button 
                    onClick={() => {
                      const video = isPresenting ? localVideoRef.current : remoteVideoRef.current;
                      if (video) {
                        if (!document.fullscreenElement) {
                          video.requestFullscreen();
                        } else {
                          document.exitFullscreen();
                        }
                      }
                    }}
                    className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg transition-colors"
                  >
                    <Maximize className="w-5 h-5" />
                  </button>
                )}
              </div>
              
              {/* Controls */}
              <div className="flex gap-3 mt-6">
                {!isPresenting ? (
                  <button
                    onClick={() => setShowShareModal(true)}
                    disabled={currentPresenter !== null && currentPresenter !== userId}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg transition-colors font-medium"
                  >
                    <Presentation className="w-5 h-5" />
                    Present Screen
                  </button>
                ) : (
                  <button
                    onClick={stopScreenShare}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg transition-colors font-medium"
                  >
                    <Square className="w-5 h-5" />
                    Stop Presenting
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Participants */}
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-gray-800">Participants ({participants.size})</h3>
              </div>
              
              <div className="space-y-2">
                {Array.from(participants.values()).map((participant) => (
                  <div key={participant.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-700">
                      {participant.name} {participant.id === userId && '(You)'}
                    </span>
                    {participant.id === currentPresenter && (
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
                {messages.map((msg) => (
                  <div key={msg.id} className="text-sm">
                    <span className="font-medium text-indigo-600">{msg.userName}:</span>
                    <span className="ml-2 text-gray-700">{msg.text}</span>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  maxLength={200}
                />
                <button
                  onClick={sendChatMessage}
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
                    onChange={(e) => setSettings(prev => ({ ...prev, fps: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  >
                    <option value={15}>15 FPS</option>
                    <option value={30}>30 FPS</option>
                    <option value={60}>60 FPS</option>
                  </select>
                </div>
                
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Include Audio</label>
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, audioEnabled: !prev.audioEnabled }))}
                    className={`p-2 rounded-lg transition-colors ${
                      settings.audioEnabled ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {settings.audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Share Screen Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800">Choose what to share</h2>
                <button
                  onClick={() => setShowShareModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Select what you'd like to share with everyone in the meeting
              </p>
            </div>

            <div className="flex border-b border-gray-200">
              {(['screen', 'window', 'tab'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setShareType(type)}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                    shareType === type
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {type === 'tab' ? 'Chrome Tab' : type}
                </button>
              ))}
            </div>

            <div className="p-6">
              <button
                onClick={startScreenShare}
                className="w-full p-6 border-2 border-gray-200 hover:border-blue-300 rounded-lg transition-all hover:shadow-md text-left"
              >
                <div className="flex items-center gap-4">
                  {shareType === 'screen' && <MonitorSpeaker className="w-12 h-12 text-blue-600" />}
                  {shareType === 'window' && <WindowIcon className="w-12 h-12 text-blue-600" />}
                  {shareType === 'tab' && <Chrome className="w-12 h-12 text-blue-600" />}
                  <div>
                    <h3 className="font-medium text-gray-800 capitalize">
                      {shareType === 'tab' ? 'Chrome Tab' : shareType}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {shareType === 'screen' && 'Share your entire screen'}
                      {shareType === 'window' && 'Share a specific application window'}
                      {shareType === 'tab' && 'Share a Chrome browser tab'}
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowShareModal(false)}
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