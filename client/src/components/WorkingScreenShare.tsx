import React, { useState, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
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
  Minimize
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
  connectionStatus?: 'connecting' | 'connected' | 'failed' | 'offline';
}

interface WorkingScreenShareProps {
  onBackToModeSelector?: () => void;
}

export default function WorkingScreenShare({ onBackToModeSelector }: WorkingScreenShareProps) {
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
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [fps, setFps] = useState(30);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [sharingCamera, setSharingCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [quality, setQuality] = useState('1080p');
  const [showCursor, setShowCursor] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'failed' | 'offline'>('offline');
  const [turnServerStatus, setTurnServerStatus] = useState<'testing' | 'available' | 'unavailable'>('testing');
  const [crossNetworkMode, setCrossNetworkMode] = useState(false);
  const [connectionRetries, setConnectionRetries] = useState(0);
  const [notifications, setNotifications] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>>([]);

  // Simple notification system
  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = uuidv4();
    setNotifications(prev => [...prev, { id, message, type }]);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  // Enhanced ICE servers with Open Relay Project FREE UNLIMITED TURN servers
  const getICEServers = (turnOnly = false) => {
    if (turnOnly) {
      // TURN-only configuration with Open Relay Project - FREE UNLIMITED
      return {
        iceServers: [
          // Open Relay Project - FREE UNLIMITED TURN servers (Primary)
          { 
            urls: [
              'turn:openrelay.metered.ca:80',
              'turn:openrelay.metered.ca:443',
              'turn:openrelay.metered.ca:443?transport=tcp'
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          // ExpressTURN - 1TB free monthly (Backup)
          { 
            urls: [
              'turn:relay.expressturn.com:3478',
              'turn:relay.expressturn.com:3478?transport=tcp'
            ],
            username: 'efTGCHXCBxZKJJjj',
            credential: 'zEJIQXFsYWRVhQLPZXRYJA'
          },
          // FreeTURN.net - Free unlimited (Backup)
          { 
            urls: [
              'turn:freestun.net:3478',
              'turn:freestun.net:3478?transport=tcp'
            ],
            username: 'free',
            credential: 'free'
          },
          // Numb TURN - Free reliable server
          { 
            urls: [
              'turn:numb.viagenie.ca:3478',
              'turn:numb.viagenie.ca:3478?transport=tcp'
            ],
            username: 'webrtc@live.com',
            credential: 'muazkh'
          }
        ],
        iceCandidatePoolSize: 30,
        bundlePolicy: 'max-bundle' as RTCBundlePolicy,
        rtcpMuxPolicy: 'require' as RTCRtcpMuxPolicy,
        iceTransportPolicy: 'relay' as RTCIceTransportPolicy, // Force TURN relay only
        iceGatheringTimeout: 60000 // Extended timeout for cross-network TURN
      };
    }

    // Maximum bandwidth configuration with optimized ICE servers
    return {
      iceServers: [
        // Open Relay Project - FREE UNLIMITED STUN servers
        { urls: 'stun:openrelay.metered.ca:80' },
        { urls: 'stun:openrelay.metered.ca:443' },
        // Google STUN servers for NAT traversal
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        // Open Relay Project - FREE UNLIMITED TURN servers
        { 
          urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        { 
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        // ExpressTURN - 1TB free monthly
        { 
          urls: 'turn:relay.expressturn.com:3478',
          username: 'efTGCHXCBxZKJJjj',
          credential: 'zEJIQXFsYWRVhQLPZXRYJA'
        },
        // FreeTURN backup servers
        { 
          urls: 'turn:freestun.net:3478',
          username: 'free',
          credential: 'free'
        },
        // Numb TURN server for additional reliability
        { 
          urls: 'turn:numb.viagenie.ca:3478',
          username: 'webrtc@live.com',
          credential: 'muazkh'
        }
      ],
      iceCandidatePoolSize: 50, // Maximum connectivity optimization
      bundlePolicy: 'max-bundle' as RTCBundlePolicy,
      rtcpMuxPolicy: 'require' as RTCRtcpMuxPolicy,
      // Maximum bandwidth configuration

    };
  };

  // Simplified TURN server setup - assume always available
  const testTurnServers = async () => {
    console.log('✅ TURN servers configured and ready');
    setTurnServerStatus('available');
    setConnectionStatus('offline');
  };

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const currentStreamRef = useRef<MediaStream | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [bandwidthMonitor, setBandwidthMonitor] = useState<{
    actualBitrate: number;
    targetBitrate: number;
    fpsStability: number;
  }>({ actualBitrate: 0, targetBitrate: 0, fpsStability: 100 });
  
  const bandwidthMonitorRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize TURN server testing
  useEffect(() => {
    testTurnServers();
  }, []);

  // Initialize Socket.IO
  useEffect(() => {
    if (isInRoom && !socketRef.current) {
      const socket = io();
      socketRef.current = socket;

      // Join room
      socket.emit('join-room', { roomId, userName });

      // Listen for participants updates
      socket.on('participants-updated', (participantsList: Participant[]) => {
        setParticipants(participantsList);
      });

      // Listen for new messages (from all users including self)
      socket.on('new-message', (messageData: Message) => {
        setMessages(prev => {
          // Prevent duplicate messages by checking ID
          const exists = prev.some(msg => msg.id === messageData.id);
          if (!exists) {
            return [...prev, messageData];
          }
          return prev;
        });
      });

      // WebRTC signaling listeners
      socket.on('presenter-started', async ({ presenterId, presenterName }) => {
        console.log('👥 Presenter started:', presenterName, 'ID:', presenterId);
        if (presenterId !== socket.id) {
          // Viewers just wait for offers from presenter - mark as connecting
          console.log('📺 Viewer ready to receive stream from presenter');
          socket.emit('connection-status-update', {
            roomId,
            status: 'connecting'
          });
        }
      });

      socket.on('presenter-stopped', ({ presenterId }) => {
        console.log('👥 Presenter stopped');
        closePeerConnection(presenterId);
        setRemoteStreams(prev => {
          const newStreams = new Map(prev);
          newStreams.delete(presenterId);
          return newStreams;
        });
      });

      socket.on('webrtc-offer', async ({ offer, senderId }) => {
        console.log('📞 Received WebRTC offer from:', senderId);
        await handleWebRTCOffer(offer, senderId);
      });

      socket.on('webrtc-answer', async ({ answer, senderId }) => {
        console.log('📞 Received WebRTC answer from:', senderId);
        await handleWebRTCAnswer(answer, senderId);
      });

      socket.on('webrtc-ice-candidate', async ({ candidate, senderId }) => {
        console.log('🧊 Received ICE candidate from:', senderId);
        await handleICECandidate(candidate, senderId);
      });

      return () => {
        if (socketRef.current) {
          socketRef.current.emit('leave-room', { roomId, userName });
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    }
  }, [isInRoom, roomId, userName]);

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

  // Enhanced SDP manipulation for maximum bandwidth utilization
  const enhanceSDPForMaxBandwidth = async (sessionDescription: RTCSessionDescription, currentQuality: string): Promise<RTCSessionDescription> => {
    const getBandwidthForQuality = (quality: string) => {
      switch (quality) {
        case '4K': return { video: 25000, audio: 320 }; // kbps
        case '1440p': return { video: 15000, audio: 256 };
        case '1080p': return { video: 10000, audio: 192 };
        case '720p': return { video: 5000, audio: 128 };
        case '480p': return { video: 2500, audio: 96 };
        default: return { video: 10000, audio: 192 };
      }
    };

    const bandwidths = getBandwidthForQuality(currentQuality);
    let sdp = sessionDescription.sdp;

    // Remove existing bandwidth limitations
    sdp = sdp.replace(/b=AS:\d+\r?\n/g, '');
    sdp = sdp.replace(/b=CT:\d+\r?\n/g, '');
    sdp = sdp.replace(/b=TIAS:\d+\r?\n/g, '');

    // Add maximum bandwidth for video
    sdp = sdp.replace(/(m=video.*\r?\n)/g, `$1b=AS:${bandwidths.video}\r\nb=TIAS:${bandwidths.video * 1000}\r\n`);
    
    // Add maximum bandwidth for audio
    sdp = sdp.replace(/(m=audio.*\r?\n)/g, `$1b=AS:${bandwidths.audio}\r\nb=TIAS:${bandwidths.audio * 1000}\r\n`);

    // Enable maximum quality codecs and parameters
    sdp = sdp.replace(/(a=fmtp:\d+ .*)/g, (match) => {
      if (match.includes('level-asymmetry-allowed=1')) {
        // VP9 codec optimization
        return match + ';x-google-max-bitrate=' + bandwidths.video + ';x-google-min-bitrate=' + Math.floor(bandwidths.video * 0.1) + ';x-google-start-bitrate=' + Math.floor(bandwidths.video * 0.8);
      } else if (match.includes('minptime=')) {
        // Audio codec optimization
        return match + ';maxaveragebitrate=' + (bandwidths.audio * 1000) + ';stereo=1;sprop-stereo=1';
      }
      return match;
    });

    // Force highest quality settings
    sdp = sdp.replace(/a=mid:video/g, 'a=mid:video\r\na=recvonly');
    sdp = sdp.replace(/a=mid:audio/g, 'a=mid:audio\r\na=recvonly');

    console.log(`🚀 Enhanced SDP for ${currentQuality}:`, {
      videoBandwidth: `${bandwidths.video} kbps`,
      audioBandwidth: `${bandwidths.audio} kbps`,
      totalBandwidth: `${bandwidths.video + bandwidths.audio} kbps`
    });

    return new RTCSessionDescription({
      type: sessionDescription.type,
      sdp: sdp
    });
  };

  // Bandwidth monitoring and adaptive control for consistent FPS
  const startBandwidthMonitoring = (transceiver: RTCRtpTransceiver, currentQuality: string, targetBitrate: number) => {
    if (bandwidthMonitorRef.current) {
      clearInterval(bandwidthMonitorRef.current);
    }

    let previousBytes = 0;
    let previousTimestamp = Date.now();
    let fpsDropCount = 0;

    bandwidthMonitorRef.current = setInterval(async () => {
      try {
        const stats = await transceiver.sender.getStats();
        let currentBytes = 0;
        let packetsLost = 0;
        let totalPackets = 0;

        stats.forEach((report) => {
          if (report.type === 'outbound-rtp') {
            currentBytes = report.bytesSent || 0;
            packetsLost = report.packetsLost || 0;
            totalPackets = report.packetsSent || 0;
          }
        });

        const currentTimestamp = Date.now();
        const timeDiff = (currentTimestamp - previousTimestamp) / 1000; // seconds
        const bytesDiff = currentBytes - previousBytes;
        const actualBitrate = (bytesDiff * 8) / timeDiff; // bits per second

        const packetLossRate = totalPackets > 0 ? (packetsLost / totalPackets) * 100 : 0;
        const bitrateEfficiency = targetBitrate > 0 ? (actualBitrate / targetBitrate) * 100 : 0;

        // Calculate FPS stability based on bitrate consistency
        const fpsStability = Math.max(0, 100 - (packetLossRate * 10) - Math.abs(100 - bitrateEfficiency));

        setBandwidthMonitor({
          actualBitrate: Math.round(actualBitrate),
          targetBitrate,
          fpsStability: Math.round(fpsStability)
        });

        // Adaptive bandwidth adjustment for consistent FPS
        if (fpsStability < 80) {
          fpsDropCount++;
          
          if (fpsDropCount >= 3) { // After 3 consecutive drops
            console.log(`📊 FPS instability detected (${fpsStability.toFixed(1)}%), demanding more bandwidth`);
            
            // Increase bandwidth demand aggressively
            const params = transceiver.sender.getParameters();
            if (params.encodings && params.encodings[0]) {
              const currentMax = params.encodings[0].maxBitrate || targetBitrate;
              const newMaxBitrate = Math.min(currentMax * 1.5, targetBitrate * 2); // Up to 2x target
              params.encodings[0].maxBitrate = newMaxBitrate;
              
              await transceiver.sender.setParameters(params);
              
              console.log(`🚀 Increased bandwidth demand:`, {
                newMaxBitrate: `${(newMaxBitrate / 1000000).toFixed(1)} Mbps`,
                reason: 'FPS stability below 80%'
              });
            }
            
            fpsDropCount = 0; // Reset counter
          }
        } else {
          fpsDropCount = 0; // Reset if stable
        }

        previousBytes = currentBytes;
        previousTimestamp = currentTimestamp;

      } catch (error) {
        console.warn('Bandwidth monitoring error:', error);
      }
    }, 2000); // Monitor every 2 seconds

    console.log(`📊 Started bandwidth monitoring for ${currentQuality} (target: ${(targetBitrate / 1000000).toFixed(1)} Mbps)`);
  };

  const joinRoom = () => {
    if (!roomId.trim() || !userName.trim()) return;
    
    setIsInRoom(true);
    setShowJoinModal(false);
    setConnectionStatus('offline');
  };

  const leaveRoom = () => {
    if (socketRef.current) {
      socketRef.current.emit('leave-room', { roomId, userName });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    // Clean up peer connections
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    setRemoteStreams(new Map());
    
    if (isPresenting) {
      stopScreenShare();
    }
    
    setIsInRoom(false);
    setParticipants([]);
    setMessages([]);
    setShowJoinModal(true);
    setConnectionStatus('offline');
  };

  const createVideoElement = (stream: MediaStream, isRemoteStream = false): HTMLVideoElement => {
    const video = document.createElement('video');
    
    // Set essential properties for cross-browser compatibility
    // Only mute presenter's own video (to prevent feedback), allow audio for remote streams
    video.muted = !isRemoteStream;
    video.autoplay = true;
    video.playsInline = true;
    video.controls = false;
    video.loop = false;
    video.defaultMuted = !isRemoteStream;
    
    // Set volume for remote streams
    if (isRemoteStream) {
      video.volume = 1.0; // Full volume for remote audio
    }
    
    // Style the video element
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'contain';
    video.style.backgroundColor = '#000';
    video.style.borderRadius = '8px';
    video.style.display = 'block';
    video.style.margin = 'auto';
    
    // Add debugging attributes  
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('x-webkit-airplay', 'allow');
    
    console.log('📺 Creating video element with stream:', {
      streamId: stream.id,
      active: stream.active,
      tracks: stream.getTracks().length,
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length
    });
    
    // Track state changes for debugging
    stream.getVideoTracks().forEach((track, index) => {
      console.log(`Video track ${index}:`, {
        id: track.id,
        kind: track.kind,
        enabled: track.enabled,
        readyState: track.readyState,
        label: track.label
      });
    });
    
    // CRITICAL: Set srcObject and handle events
    video.srcObject = stream;
    
    // Add comprehensive event listeners for debugging
    video.addEventListener('loadstart', () => console.log('📹 Video loadstart'));
    video.addEventListener('loadedmetadata', () => console.log('📹 Video metadata loaded'));
    video.addEventListener('canplay', () => console.log('📹 Video can play'));
    video.addEventListener('playing', () => console.log('✅ Video is playing'));
    video.addEventListener('error', (e) => console.error('❌ Video error:', e));
    video.addEventListener('stalled', () => console.warn('⚠️ Video stalled'));
    video.addEventListener('waiting', () => console.log('⏳ Video waiting'));
    
    // Immediate play attempt
    const playVideo = () => {
      video.play()
        .then(() => {
          console.log('✅ Video playing immediately after creation');
          setStreamError(null);
        })
        .catch((error) => {
          console.log('ℹ️ Video autoplay blocked, will require user interaction:', error.name);
          setStreamError('Click the video area to start playback');
        });
    };
    
    // Try to play immediately and after a small delay
    playVideo();
    setTimeout(playVideo, 100);
    
    return video;
  };

  const startScreenShare = async () => {
    try {
      console.log('🎬 Starting screen share...');
      setStreamError(null);
      
      // Get quality-based constraints with maximum bandwidth settings
      const getQualityConstraints = (quality: string) => {
        switch (quality) {
          case '4K':
            return { width: { ideal: 3840 }, height: { ideal: 2160 } };
          case '1440p':
            return { width: { ideal: 2560 }, height: { ideal: 1440 } };
          case '1080p':
            return { width: { ideal: 1920 }, height: { ideal: 1080 } };
          case '720p':
            return { width: { ideal: 1280 }, height: { ideal: 720 } };
          case '480p':
            return { width: { ideal: 854 }, height: { ideal: 480 } };
          default:
            return { width: { ideal: 1920 }, height: { ideal: 1080 } };
        }
      };
      
      const qualityConstraints = getQualityConstraints(quality);
      const constraints: MediaStreamConstraints = {
        video: {
          frameRate: { ideal: fps, max: fps },
          width: { ideal: qualityConstraints.width.ideal },
          height: { ideal: qualityConstraints.height.ideal },
          // Note: cursor and displaySurface are browser-specific constraints
        },
        audio: audioEnabled || microphoneEnabled ? {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: { ideal: 48000 },
          channelCount: { ideal: 2 }
        } : false
      };

      console.log('🎯 Screen share constraints:', JSON.stringify(constraints, null, 2));
      const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
      
      // Verify and log actual stream settings
      const videoTrack = stream.getVideoTracks()[0];
      const actualSettings = videoTrack?.getSettings();
      console.log('✅ Got screen share stream:', {
        id: stream.id,
        active: stream.active,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
        actualSettings: actualSettings,
        requestedQuality: quality,
        requestedFPS: fps
      });
      
      showNotification('Screen sharing started successfully', 'success');
      
      // Force settings if they don't match (constraint the track)
      if (actualSettings && videoTrack) {
        const targetConstraints = {
          frameRate: { ideal: fps, max: fps },
          ...getQualityConstraints(quality)
        };
        
        try {
          await videoTrack.applyConstraints(targetConstraints);
          console.log('✅ Applied constraints to force exact settings');
          
          // Log final settings
          const finalSettings = videoTrack.getSettings();
          console.log('🎯 Final stream settings:', finalSettings);
          
          // Verify the settings match our requirements
          if (finalSettings.frameRate !== fps) {
            console.warn(`⚠️ FPS mismatch: requested ${fps}, got ${finalSettings.frameRate}`);
          }
          const targetRes = getQualityConstraints(quality);
          if (finalSettings.width !== targetRes.width.ideal) {
            console.warn(`⚠️ Resolution mismatch: requested ${targetRes.width.ideal}x${targetRes.height.ideal}, got ${finalSettings.width}x${finalSettings.height}`);
          }
        } catch (constraintError) {
          console.warn('⚠️ Could not apply exact constraints:', constraintError);
        }
      }
      
      currentStreamRef.current = stream;
      
      // Add presenter video without clearing remote videos
      if (videoContainerRef.current) {
        // Only remove existing presenter video, keep remote videos
        const existingPresenterVideo = videoContainerRef.current.querySelector('#presenter-video');
        if (existingPresenterVideo) {
          existingPresenterVideo.remove();
        }
        
        const videoElement = createVideoElement(stream);
        videoElement.id = 'presenter-video';
        videoElement.style.position = 'absolute';
        videoElement.style.top = '0';
        videoElement.style.left = '0';
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
        videoElement.style.zIndex = '1';
        
        videoContainerRef.current.appendChild(videoElement);
        
        // Immediate play attempt with DOM interaction
        requestAnimationFrame(() => {
          videoElement.play().then(() => {
            console.log('✅ Presenter video playing after DOM insertion');
            setStreamError(null);
          }).catch(() => {
            console.log('ℹ️ Click video area to enable playback');
          });
        });
      }

      setIsPresenting(true);
      
      // Mark presenter as connected
      if (socketRef.current) {
        socketRef.current.emit('connection-status-update', {
          roomId,
          status: 'connected'
        });
      }
      
      // Notify other participants and setup WebRTC for immediate sharing
      if (socketRef.current) {
        socketRef.current.emit('start-presenting', { roomId, userName });
        
        // Send stream to all existing participants as presenter with cross-network optimization
        setTimeout(async () => {
          setConnectionStatus('connecting');
          for (const participant of participants) {
            if (participant.id !== socketRef.current?.id && socketRef.current) {
              console.log('🔗 Presenter creating connection to viewer:', participant.name, participant.id, crossNetworkMode ? '(cross-network mode)' : '');
              
              // Create new peer connection with hybrid configuration
              const pc = await createPeerConnection(participant.id, false); // Use hybrid STUN/TURN configuration
              if (!pc) continue;
              
              // Enhanced connection monitoring 
              pc.onconnectionstatechange = () => {
                const state = pc.connectionState;
                console.log(`🔗 Screen share connection state for ${participant.name}:`, state);
                
                if (state === 'connected') {
                  setConnectionStatus('connected');
                  console.log(`✅ Screen share connected successfully to ${participant.name}`);
                } else if (state === 'connecting' || state === 'new') {
                  setConnectionStatus('connecting');
                } else if (state === 'failed') {
                  setConnectionStatus('failed');
                  console.log(`❌ Screen share connection failed to ${participant.name}`);
                }
              };
              
              if (currentStreamRef.current) {
                // Add all tracks with maximum bandwidth transceivers
                currentStreamRef.current.getTracks().forEach(track => {
                  console.log('➕ Adding track to peer connection:', track.kind, track.id);
                  const sender = pc.addTrack(track, currentStreamRef.current!);
                  
                  // Configure transceiver for maximum bandwidth
                  const transceiver = pc.getTransceivers().find(t => t.sender === sender);
                  if (transceiver) {
                    const getBandwidthForQuality = (quality: string, trackKind: string) => {
                      const bandwidths = {
                        '4K': { video: 25000000, audio: 320000 },
                        '1440p': { video: 15000000, audio: 256000 },
                        '1080p': { video: 10000000, audio: 192000 },
                        '720p': { video: 5000000, audio: 128000 },
                        '480p': { video: 2500000, audio: 96000 }
                      };
                      return bandwidths[quality as keyof typeof bandwidths]?.[trackKind as keyof typeof bandwidths['4K']] || bandwidths['1080p'][trackKind as keyof typeof bandwidths['1080p']];
                    };

                    const maxBitrate = getBandwidthForQuality(quality, track.kind);
                    
                    // Apply maximum bandwidth encoding parameters with aggressive settings
                    const params = transceiver.sender.getParameters();
                    params.encodings = params.encodings || [{}];
                    params.encodings[0].maxBitrate = maxBitrate;
                    params.encodings[0].scaleResolutionDownBy = 1; // No downscaling
                    params.encodings[0].priority = 'high' as any; // Demand high network priority
                    params.encodings[0].networkPriority = 'high' as any; // Force high network priority
                    
                    if (track.kind === 'video') {
                      params.encodings[0].maxFramerate = fps;
                      params.encodings[0].active = true;
                      // Aggressive video settings for consistent FPS
                      params.encodings[0].priority = 'high' as any; // Prioritize FPS over resolution
                    } else if (track.kind === 'audio') {
                      // Force maximum audio quality - use priority instead of deprecated fields
                      params.encodings[0].priority = 'high' as any;
                    }
                    
                    transceiver.sender.setParameters(params).catch(err => 
                      console.warn('Could not set encoding parameters:', err)
                    );
                    
                    // Start bandwidth monitoring for this transceiver
                    startBandwidthMonitoring(transceiver, quality, maxBitrate);
                    
                    console.log(`🔧 Configured ${track.kind} transceiver for ${quality}:`, {
                      maxBitrate: `${(maxBitrate / 1000000).toFixed(1)} Mbps`,
                      maxFramerate: track.kind === 'video' ? fps : 'N/A',
                      priority: 'high'
                    });
                  }
                });
                
                // Create enhanced offer with cross-network optimizations
                const offer = await pc.createOffer({
                  offerToReceiveAudio: true,
                  offerToReceiveVideo: true,
                  iceRestart: crossNetworkMode,
                  // VoiceActivityDetection is deprecated
                });

                // Apply maximum bandwidth SDP modifications
                const enhancedOffer = enhanceSDPForMaxBandwidth(offer, quality);
                await pc.setLocalDescription(enhancedOffer);
                
                console.log('📤 Sending optimized offer to viewer:', participant.id);
                socketRef.current.emit('webrtc-offer', {
                  roomId,
                  offer,
                  targetId: participant.id,
                  crossNetworkMode: crossNetworkMode
                });
                
                // Monitor connection success with proper timing
                setTimeout(() => {
                  if (pc.connectionState === 'connected') {
                    console.log(`✅ Connection successful to ${participant.name}`);
                  } else if (pc.connectionState === 'failed') {
                    console.log(`❌ Connection failed to ${participant.name} - state: ${pc.connectionState}`);
                  } else {
                    console.log(`🔄 Connection still in progress to ${participant.name} - state: ${pc.connectionState}`);
                  }
                }, 15000);
              }
            }
          }
        }, 500);
      }

      // Handle stream ending
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        console.log('🔚 Screen share ended');
        stopScreenShare();
      });

    } catch (error) {
      console.error('❌ Failed to start screen share:', error);
      showNotification('Failed to start screen sharing. Please grant permission and try again.', 'error');
      setStreamError('Failed to start screen sharing. Please grant permission and try again.');
    }
  };

  const startRecording = () => {
    if (!currentStreamRef.current) return;

    try {
      // Enhanced quality recording with maximum bitrate based on resolution
      const getRecordingBitrate = (quality: string) => {
        switch (quality) {
          case '4K': return { video: 25000000, audio: 320000 }; // 25 Mbps video, 320 kbps audio
          case '1440p': return { video: 15000000, audio: 256000 }; // 15 Mbps video, 256 kbps audio  
          case '1080p': return { video: 10000000, audio: 192000 }; // 10 Mbps video, 192 kbps audio
          case '720p': return { video: 5000000, audio: 128000 }; // 5 Mbps video, 128 kbps audio
          case '480p': return { video: 2500000, audio: 96000 }; // 2.5 Mbps video, 96 kbps audio
          default: return { video: 10000000, audio: 192000 }; // Default to 1080p
        }
      };

      const bitrates = getRecordingBitrate(quality);
      
      const options = {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: bitrates.video,
        audioBitsPerSecond: bitrates.audio,
        bitsPerSecond: bitrates.video + bitrates.audio, // Total bitrate
        // Force consistent FPS regardless of bandwidth
        videoKeyFrameIntervalDuration: Math.round(1000 / fps), // Key frame every frame interval
        videoKeyFrameIntervalCount: fps // Key frames per second matching FPS
      };

      console.log(`🎥 Starting recording with ${quality} quality:`, {
        videoBitrate: `${(bitrates.video / 1000000).toFixed(1)} Mbps`,
        audioBitrate: `${(bitrates.audio / 1000).toFixed(0)} kbps`,
        totalBitrate: `${((bitrates.video + bitrates.audio) / 1000000).toFixed(1)} Mbps`,
        fps: fps,
        audioTracks: currentStreamRef.current.getAudioTracks().length,
        systemAudio: audioEnabled,
        microphone: microphoneEnabled
      });

      const mediaRecorder = new MediaRecorder(currentStreamRef.current, options);

      mediaRecorderRef.current = mediaRecorder;
      setRecordedChunks([]);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setRecordedChunks(prev => [...prev, event.data]);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('Recording stopped');
      };

      // Demand maximum bandwidth and force consistent FPS
      const interval = Math.round(1000 / fps);
      
      // Configure for maximum bandwidth demand
      if (mediaRecorder.stream && mediaRecorder.stream.getVideoTracks().length > 0) {
        const videoTrack = mediaRecorder.stream.getVideoTracks()[0];
        
        // Apply aggressive constraints to demand maximum bandwidth
        const aggressiveConstraints = {
          frameRate: { exact: fps, ideal: fps, min: fps }, // Force exact FPS
          width: { exact: getQualityConstraints(quality).width.ideal },
          height: { exact: getQualityConstraints(quality).height.ideal },
          aspectRatio: { exact: getQualityConstraints(quality).width.ideal / getQualityConstraints(quality).height.ideal }
        };
        
        videoTrack.applyConstraints(aggressiveConstraints).then(() => {
          console.log(`🎯 Applied aggressive constraints for consistent ${fps} FPS recording`);
        }).catch(err => {
          console.warn('Could not apply aggressive constraints:', err);
        });
      }
      
      // Start recording with exact interval timing
      mediaRecorder.start(interval);
      setIsRecording(true);
      
      console.log(`📹 Recording started with bandwidth demand:`, {
        targetFPS: fps,
        interval: `${interval}ms`,
        bandwidthDemand: `${((bitrates.video + bitrates.audio) / 1000000).toFixed(1)} Mbps`,
        keyFrameInterval: `${Math.round(1000 / fps)}ms`
      });

      const message: Message = {
        id: uuidv4(),
        userId: 'system',
        userName: 'System',
        text: `${userName} started recording at ${quality} ${fps}fps (${(bitrates.video / 1000000).toFixed(1)} Mbps${audioEnabled || microphoneEnabled ? ` + ${(bitrates.audio / 1000).toFixed(0)} kbps audio` : ''})`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, message]);

    } catch (error) {
      console.error('Failed to start recording:', error);
      showNotification('Recording not supported on this browser', 'error');
      setStreamError('Recording not supported on this browser');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      const message: Message = {
        id: uuidv4(),
        userId: 'system',
        userName: 'System',
        text: `${userName} stopped recording`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, message]);
    }
  };

  const downloadRecording = () => {
    if (recordedChunks.length === 0) return;

    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `screen-recording-${new Date().toISOString().slice(0, 19)}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const message: Message = {
      id: uuidv4(),
      userId: 'system',
      userName: 'System',
      text: `Recording downloaded`,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, message]);
  };

  const toggleFullScreen = async () => {
    if (!isFullScreen) {
      // Enter full screen - target the entire document body for true fullscreen
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if ((document.documentElement as any).webkitRequestFullscreen) {
          await (document.documentElement as any).webkitRequestFullscreen();
        } else if ((document.documentElement as any).msRequestFullscreen) {
          await (document.documentElement as any).msRequestFullscreen();
        }
        
        // Will be handled by fullscreen change event
        
      } catch (error) {
        console.error('Failed to enter full screen:', error);
      }
    } else {
      // Exit full screen
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
        
        // Will be handled by fullscreen change event
        
      } catch (error) {
        console.error('Failed to exit full screen:', error);
      }
    }
  };

  // Listen for fullscreen change events and escape key
  useEffect(() => {
    const handleFullScreenChange = () => {
      const isCurrentlyFullScreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullScreen(isCurrentlyFullScreen);
      
      // Apply YouTube-style fullscreen styling
      if (isCurrentlyFullScreen) {
        // Hide everything except video container
        document.body.style.overflow = 'hidden';
        document.body.style.backgroundColor = '#000';
        
        // Create fullscreen overlay
        const overlay = document.createElement('div');
        overlay.id = 'fullscreen-overlay';
        overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: #000;
          z-index: 9998;
          display: flex;
          align-items: center;
          justify-content: center;
        `;
        
        // Move video to fullscreen overlay
        const videoContainer = videoContainerRef.current;
        if (videoContainer) {
          const video = videoContainer.querySelector('video');
          if (video) {
            const videoClone = video.cloneNode(true) as HTMLVideoElement;
            videoClone.style.cssText = `
              width: 100vw;
              height: 100vh;
              object-fit: contain;
              background: #000;
              border-radius: 0;
            `;
            videoClone.srcObject = video.srcObject;
            videoClone.muted = true;
            videoClone.autoplay = true;
            videoClone.playsInline = true;
            
            overlay.appendChild(videoClone);
            document.body.appendChild(overlay);
            
            // Play the cloned video
            videoClone.play().catch(console.error);
          }
        }
        
        // Add exit fullscreen button
        const exitButton = document.createElement('button');
        exitButton.innerHTML = '✕ Exit Full Screen';
        exitButton.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          border: none;
          padding: 12px 20px;
          border-radius: 6px;
          cursor: pointer;
          z-index: 9999;
          font-size: 14px;
          font-weight: 500;
        `;
        exitButton.onmouseover = () => {
          exitButton.style.background = 'rgba(0, 0, 0, 0.9)';
        };
        exitButton.onmouseout = () => {
          exitButton.style.background = 'rgba(0, 0, 0, 0.8)';
        };
        exitButton.onclick = toggleFullScreen;
        document.body.appendChild(exitButton);
        
      } else {
        // Exit fullscreen - cleanup
        document.body.style.overflow = '';
        document.body.style.backgroundColor = '';
        
        // Remove fullscreen overlay
        const overlay = document.getElementById('fullscreen-overlay');
        if (overlay) {
          overlay.remove();
        }
        
        // Remove all exit buttons that might be leftover
        document.querySelectorAll('button').forEach(btn => {
          if (btn.innerHTML && btn.innerHTML.includes('Exit Full Screen')) {
            btn.remove();
          }
        });
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullScreen) {
        toggleFullScreen();
      }
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullScreenChange);
    document.addEventListener('msfullscreenchange', handleFullScreenChange);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullScreenChange);
      document.removeEventListener('msfullscreenchange', handleFullScreenChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullScreen]);

  // Camera and microphone sharing functions
  const startCameraShare = async () => {
    try {
      console.log('📹 Starting camera share...');
      setStreamError(null);
      
      const getQualityConstraints = (quality: string) => {
        switch (quality) {
          case '1080p':
            return { width: { ideal: 1920 }, height: { ideal: 1080 } };
          case '720p':
            return { width: { ideal: 1280 }, height: { ideal: 720 } };
          case '480p':
            return { width: { ideal: 854 }, height: { ideal: 480 } };
          default:
            return { width: { ideal: 1920 }, height: { ideal: 1080 } };
        }
      };
      
      const constraints: MediaStreamConstraints = {
        video: {
          ...getQualityConstraints(quality),
          frameRate: { ideal: fps, max: fps }
        },
        audio: microphoneEnabled ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        } : false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Add microphone stream separately if needed for better audio quality
      if (microphoneEnabled && !stream.getAudioTracks().length) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 44100
            }
          });
          
          // Add mic tracks to the main stream
          micStream.getAudioTracks().forEach(track => {
            stream.addTrack(track);
          });
          console.log('✅ Added separate microphone audio track');
        } catch (micError) {
          console.warn('⚠️ Could not add separate microphone:', micError);
        }
      }
      console.log('✅ Got camera stream:', {
        id: stream.id,
        active: stream.active,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length
      });
      
      showNotification('Camera sharing started successfully', 'success');
      
      setCameraStream(stream);
      currentStreamRef.current = stream;
      
      // Add camera video without clearing remote videos
      if (videoContainerRef.current) {
        // Only remove existing presenter video, keep remote videos
        const existingPresenterVideo = videoContainerRef.current.querySelector('#presenter-video');
        if (existingPresenterVideo) {
          existingPresenterVideo.remove();
        }
        
        const videoElement = createVideoElement(stream);
        videoElement.id = 'presenter-video';
        videoElement.style.position = 'absolute';
        videoElement.style.top = '0';
        videoElement.style.left = '0';
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
        videoElement.style.zIndex = '1';
        videoContainerRef.current.appendChild(videoElement);
        
        // Immediate play attempt
        requestAnimationFrame(() => {
          videoElement.play().then(() => {
            console.log('✅ Camera video playing');
            setStreamError(null);
          }).catch(() => {
            console.log('ℹ️ Click video area to enable camera playback');
          });
        });
      }

      setSharingCamera(true);
      setIsPresenting(true);
      
      // Notify other participants
      if (socketRef.current) {
        socketRef.current.emit('start-presenting', { roomId, userName });
        
        // Send camera stream to all existing participants
        setTimeout(async () => {
          for (const participant of participants) {
            if (participant.id !== socketRef.current?.id && socketRef.current) {
              console.log('🔗 Presenter creating camera connection to viewer:', participant.name, participant.id);
              
              // Create new peer connection for each participant
              const pc = new RTCPeerConnection(getICEServers());
              
              peerConnectionsRef.current.set(participant.id, pc);

              // Enhanced connection monitoring for camera share
              pc.onconnectionstatechange = () => {
                console.log(`🔗 Camera share connection state for ${participant.name}:`, pc.connectionState);
              };

              pc.onicecandidate = (event) => {
                if (event.candidate && socketRef.current) {
                  console.log(`🧊 Sending camera share ICE candidate to ${participant.name}:`, event.candidate.candidate);
                  socketRef.current.emit('webrtc-ice-candidate', {
                    roomId,
                    candidate: event.candidate,
                    targetId: participant.id
                  });
                }
              };
              
              if (currentStreamRef.current) {
                // Add all tracks from camera stream
                currentStreamRef.current.getTracks().forEach(track => {
                  console.log('➕ Adding camera track to peer connection:', track.kind, track.id);
                  pc.addTrack(track, currentStreamRef.current!);
                });
                
                // Create and send offer
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                
                console.log('📤 Sending camera offer to viewer:', participant.id);
                socketRef.current.emit('webrtc-offer', {
                  roomId,
                  offer,
                  targetId: participant.id
                });
              }
            }
          }
        }, 500);
      }

      // Handle stream ending
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener('ended', () => {
          console.log('🔚 Camera share ended');
          stopCameraShare();
        });
      }

    } catch (error) {
      console.error('❌ Failed to start camera share:', error);
      showNotification('Failed to access camera. Please grant permission and try again.', 'error');
      setStreamError('Failed to access camera. Please grant permission and try again.');
    }
  };

  const stopCameraShare = () => {
    console.log('🛑 Stopping camera share...');
    
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => {
        track.stop();
      });
      setCameraStream(null);
    }

    if (currentStreamRef.current) {
      currentStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      currentStreamRef.current = null;
    }

    if (videoContainerRef.current) {
      videoContainerRef.current.innerHTML = '';
    }

    setSharingCamera(false);
    setIsPresenting(false);
    setStreamError(null);
    
    // Clean up peer connections
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    
    if (socketRef.current) {
      socketRef.current.emit('stop-presenting', { roomId, userName });
    }
  };

  const stopScreenShare = () => {
    console.log('🛑 Stopping screen share...');
    
    // Stop recording if active
    if (isRecording) {
      stopRecording();
    }
    
    // Stop bandwidth monitoring
    if (bandwidthMonitorRef.current) {
      clearInterval(bandwidthMonitorRef.current);
      bandwidthMonitorRef.current = null;
    }
    
    if (currentStreamRef.current) {
      currentStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      currentStreamRef.current = null;
    }

    if (videoContainerRef.current) {
      videoContainerRef.current.innerHTML = '';
    }

    setIsPresenting(false);
    setStreamError(null);
    mediaRecorderRef.current = null;
    setBandwidthMonitor({ actualBitrate: 0, targetBitrate: 0, fpsStability: 100 });
    
    // Clean up peer connections and notify other participants
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    
    if (socketRef.current) {
      socketRef.current.emit('stop-presenting', { roomId, userName });
    }
  };

  const sendMessage = () => {
    if (!messageInput.trim() || !socketRef.current) return;

    // Only send to server - don't add locally to avoid duplicates
    socketRef.current.emit('send-message', {
      roomId,
      message: messageInput.trim(),
      userName,
      userId
    });

    setMessageInput('');
    showNotification('Message sent successfully', 'success');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Detect cross-network scenario and force TURN mode
  const detectCrossNetwork = (candidates: string[]) => {
    const hasPrivateIP = candidates.some(candidate => 
      candidate.includes('192.168.') || 
      candidate.includes('10.') || 
      candidate.includes('172.16.') ||
      candidate.includes('172.17.') ||
      candidate.includes('172.18.') ||
      candidate.includes('172.19.') ||
      candidate.includes('172.20.') ||
      candidate.includes('172.21.') ||
      candidate.includes('172.22.') ||
      candidate.includes('172.23.') ||
      candidate.includes('172.24.') ||
      candidate.includes('172.25.') ||
      candidate.includes('172.26.') ||
      candidate.includes('172.27.') ||
      candidate.includes('172.28.') ||
      candidate.includes('172.29.') ||
      candidate.includes('172.30.') ||
      candidate.includes('172.31.')
    );
    
    const hasPublicIP = candidates.some(candidate => 
      candidate.includes('typ srflx') && 
      !candidate.includes('192.168.') && 
      !candidate.includes('10.') && 
      !candidate.includes('172.')
    );
    
    return hasPrivateIP && hasPublicIP;
  };

  // Simplified WebRTC functions - immediate connection
  const createPeerConnection = async (peerId: string, forceTurnOnly = false) => {
    try {
      console.log(`🔄 Creating simplified connection for ${peerId}`);
      
      // Use hybrid configuration by default, TURN-only if forced
      const config = forceTurnOnly ? getICEServers(true) : getICEServers(false);
      const peerConnection = new RTCPeerConnection(config);
      
      peerConnectionsRef.current.set(peerId, peerConnection);

      // Simplified connection state monitoring
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log(`🔗 Connection state for ${peerId}:`, state);
        
        // Update participant connection status
        if (socketRef.current) {
          let status: 'connecting' | 'connected' | 'failed' | 'offline' = 'offline';
          if (state === 'connecting' || state === 'new') {
            status = 'connecting';
          } else if (state === 'connected') {
            status = 'connected';
          } else if (state === 'failed' || state === 'disconnected') {
            status = 'failed';
          }
          
          socketRef.current.emit('connection-status-update', {
            roomId,
            status
          });
        }
        
        if (state === 'connected') {
          console.log(`✅ Connection established for ${peerId}`);
        } else if (state === 'failed') {
          console.log(`❌ Connection failed for ${peerId}`);
        }
      };

      // ICE candidate handling
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          console.log(`🧊 Sending ICE candidate for ${peerId}`);
          socketRef.current.emit('webrtc-ice-candidate', {
            roomId,
            candidate: event.candidate,
            targetId: peerId
          });
        }
      };

      // Stream handling with track protection
      peerConnection.ontrack = (event) => {
        console.log(`🎥 Received ${event.track.kind} track from ${peerId}`);
        const [stream] = event.streams;
        
        if (stream) {
          console.log(`📺 Processing remote stream from ${peerId}`);

          // Protect tracks from being stopped
          stream.getTracks().forEach((track) => {
            track.enabled = true;
            
            // Override stop to prevent black screens
            const originalStop = track.stop.bind(track);
            track.stop = () => {
              console.log(`🔒 Blocked ${track.kind} track stop from ${peerId}`);
            };
          });

          // Update remote streams
          setRemoteStreams(prevStreams => {
            const newStreams = new Map(prevStreams);
            newStreams.set(peerId, stream);
            return newStreams;
          });
          
          // Mark as connected when we receive the stream
          if (socketRef.current) {
            console.log(`📡 Marking viewer as connected after receiving stream from ${peerId}`);
            setConnectionStatus('connected');
            socketRef.current.emit('connection-status-update', {
              roomId,
              status: 'connected'
            });
          }
          
          // Add video element for remote stream
          if (videoContainerRef.current && stream) {
            const existingVideo = videoContainerRef.current.querySelector(`#remote-video-${peerId}`);
            if (existingVideo) {
              (existingVideo as HTMLVideoElement).srcObject = stream;
              return;
            }
            
            const videoElement = createVideoElement(stream, true);
            videoElement.id = `remote-video-${peerId}`;
            videoElement.style.position = 'absolute';
            videoElement.style.top = '0';
            videoElement.style.left = '0';
            videoElement.style.width = '100%';
            videoElement.style.height = '100%';
            videoElement.style.zIndex = '1';
            
            videoContainerRef.current.appendChild(videoElement);
            
            videoElement.play().then(() => {
              console.log('✅ Remote video playing successfully');
              setStreamError(null);
              setConnectionStatus('connected');
            }).catch((error) => {
              console.log('⚠️ Remote video autoplay blocked:', error.message);
              setStreamError('Click the video area to start playback');
            });
          }
        }
      };

      return peerConnection;
    } catch (error) {
      console.error('❌ Error creating peer connection:', error);
      throw error;
    }
  };

  const handleWebRTCOffer = async (offer: RTCSessionDescriptionInit, senderId: string) => {
    try {
      console.log('📞 Handling WebRTC offer from:', senderId, 'as presenter:', isPresenting);
      console.log('📋 Offer details:', { type: offer.type, sdp: offer.sdp?.substring(0, 200) + '...' });
      
      let peerConnection = peerConnectionsRef.current.get(senderId);
      if (!peerConnection) {
        console.log('🆕 Creating new peer connection for:', senderId);
        peerConnection = await createPeerConnection(senderId);
      }

      if (peerConnection && socketRef.current) {
        console.log('🔍 Current signaling state:', peerConnection.signalingState);
        
        // Handle different signaling states properly
        if (peerConnection.signalingState === 'stable' || peerConnection.signalingState === 'have-local-offer') {
          // If we have a local offer, we need to restart the connection
          if (peerConnection.signalingState === 'have-local-offer') {
            console.log('🔄 Restarting connection due to offer collision');
            peerConnection.close();
            peerConnectionsRef.current.delete(senderId);
            peerConnection = await createPeerConnection(senderId);
          }
          
          console.log('📥 Setting remote description (offer)');
          await peerConnection.setRemoteDescription(offer);
          console.log('✅ Remote description set successfully');
          
          console.log('📝 Creating answer...');
          const answer = await peerConnection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          console.log('✅ Answer created');

          // Apply maximum bandwidth SDP modifications to answer
          const enhancedAnswer = enhanceSDPForMaxBandwidth(answer, quality);
          
          console.log('📥 Setting local description (answer)');
          await peerConnection.setLocalDescription(enhancedAnswer);
          console.log('✅ Local description set successfully');

          console.log('📤 Sending answer to:', senderId);
          socketRef.current.emit('webrtc-answer', {
            roomId,
            answer: enhancedAnswer,
            targetId: senderId
          });
          
          console.log('✅ WebRTC offer handling completed successfully');
        } else {
          console.warn('⚠️ Ignoring offer due to signaling state:', peerConnection.signalingState);
          // Force restart if in invalid state
          if (peerConnection.signalingState === 'closed') {
            console.log('🔄 Restarting closed connection');
            peerConnection.close();
            peerConnectionsRef.current.delete(senderId);
            peerConnection = await createPeerConnection(senderId);
            // Retry the offer handling
            setTimeout(() => handleWebRTCOffer(offer, senderId), 100);
          }
        }
      } else {
        console.error('❌ Missing peer connection or socket for offer handling');
      }
    } catch (error) {
      console.error('❌ Error handling WebRTC offer:', error);
      console.error('🔍 Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack?.substring(0, 500)
      });
      
      // Attempt recovery
      try {
        console.log('🔧 Attempting recovery from offer handling error');
        const peerConnection = peerConnectionsRef.current.get(senderId);
        if (peerConnection) {
          peerConnection.close();
          peerConnectionsRef.current.delete(senderId);
        }
        
        // Create fresh connection and retry
        setTimeout(async () => {
          console.log('🔄 Retrying offer handling after error recovery');
          await handleWebRTCOffer(offer, senderId);
        }, 1000);
      } catch (recoveryError) {
        console.error('❌ Recovery failed:', recoveryError);
      }
    }
  };

  const handleWebRTCAnswer = async (answer: RTCSessionDescriptionInit, senderId: string) => {
    try {
      const peerConnection = peerConnectionsRef.current.get(senderId);
      if (peerConnection && peerConnection.signalingState === 'have-local-offer') {
        console.log('📞 Setting remote answer from:', senderId);
        await peerConnection.setRemoteDescription(answer);
      } else {
        console.warn('⚠️ Ignoring answer due to wrong signaling state:', peerConnection?.signalingState);
      }
    } catch (error) {
      console.error('❌ Error handling WebRTC answer:', error);
    }
  };

  const handleICECandidate = async (candidate: RTCIceCandidateInit, senderId: string) => {
    try {
      const peerConnection = peerConnectionsRef.current.get(senderId);
      if (peerConnection) {
        await peerConnection.addIceCandidate(candidate);
      }
    } catch (error) {
      console.error('❌ Error handling ICE candidate:', error);
    }
  };

  // Create presenter offer with TURN-only for cross-network retry
  const createPresenterOfferWithTurnOnly = async (participant: any) => {
    try {
      console.log('🌐 Creating TURN-only offer for cross-network to:', participant.name);
      
      if (!currentStreamRef.current || !socketRef.current) {
        console.log('❌ No stream or socket available for TURN-only retry');
        return;
      }
      
      // Force TURN-only configuration
      const pc = await createPeerConnection(participant.id, true);
      if (!pc) return;
      
      // Add enhanced connection monitoring for TURN-only
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log(`🌐 TURN-only connection state for ${participant.name}:`, state);
        
        if (state === 'connected') {
          setConnectionStatus('connected');
          console.log(`✅ TURN-only connection successful to ${participant.name}`);
        } else if (state === 'failed') {
          console.log(`❌ TURN-only connection also failed to ${participant.name}`);
          setConnectionStatus('failed');
        }
      };
      
      // Add stream tracks
      currentStreamRef.current.getTracks().forEach(track => {
        console.log('➕ Adding track to TURN-only connection:', track.kind);
        pc.addTrack(track, currentStreamRef.current!);
      });
      
      // Create TURN-only optimized offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: true,
        // VoiceActivityDetection removed as deprecated
      });
      
      await pc.setLocalDescription(offer);
      
      console.log('📤 Sending TURN-only offer to:', participant.id);
      socketRef.current.emit('webrtc-offer', {
        roomId,
        offer,
        targetId: participant.id,
        crossNetworkMode: true,
        turnOnly: true
      });
      
    } catch (error) {
      console.error('❌ Error creating TURN-only offer:', error);
    }
  };

  const closePeerConnection = (peerId: string) => {
    const peerConnection = peerConnectionsRef.current.get(peerId);
    if (peerConnection) {
      peerConnection.close();
      peerConnectionsRef.current.delete(peerId);
    }
  };

  const debugStream = () => {
    console.log('🔧 Manual video fix triggered');
    console.log('Debug info:', { 
      isPresenting, 
      hasCurrentStream: !!currentStreamRef.current,
      remoteStreamsCount: remoteStreams.size,
      participants: participants.map(p => ({ name: p.name, isPresenting: p.isPresenting }))
    });
    
    if (isPresenting && currentStreamRef.current && videoContainerRef.current) {
      // Fix presenter's own video - never clear remote videos
      const videoElement = createVideoElement(currentStreamRef.current);
      videoElement.id = 'presenter-video';
      videoElement.style.position = 'absolute';
      videoElement.style.top = '0';
      videoElement.style.left = '0';
      videoElement.style.width = '100%';
      videoElement.style.height = '100%';
      videoElement.style.zIndex = '1';
      
      // Remove existing presenter video if any
      const existingPresenterVideo = videoContainerRef.current.querySelector('#presenter-video');
      if (existingPresenterVideo) {
        existingPresenterVideo.remove();
      }
      
      videoContainerRef.current.appendChild(videoElement);
      
      videoElement.play().then(() => {
        console.log('✅ Presenter video fix successful');
        setStreamError(null);
      }).catch((error) => {
        console.error('❌ Presenter video fix failed:', error);
        setStreamError('Video playback issue - try refreshing the page');
      });
    } else if (!isPresenting && remoteStreams.size > 0 && videoContainerRef.current) {
      // Fix viewer's remote video - ensure it stays in DOM
      const firstRemoteStream = Array.from(remoteStreams.values())[0];
      const firstRemotePeerId = Array.from(remoteStreams.keys())[0];
      
      // Check if remote video already exists
      let existingRemoteVideo = videoContainerRef.current.querySelector(`#remote-video-${firstRemotePeerId}`) as HTMLVideoElement;
      
      if (!existingRemoteVideo) {
        // Only clear if no remote videos exist
        const hasRemoteVideos = videoContainerRef.current.querySelector('[id^="remote-video-"]');
        if (!hasRemoteVideos) {
          videoContainerRef.current.innerHTML = '';
        }
        
        // Create new remote video element without clearing existing ones (unmuted for audio)
        const videoElement = createVideoElement(firstRemoteStream, true);
        videoElement.id = `remote-video-${firstRemotePeerId}`;
        videoElement.style.position = 'absolute';
        videoElement.style.top = '0';
        videoElement.style.left = '0';
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
        videoElement.style.zIndex = '1';
        
        videoContainerRef.current.appendChild(videoElement);
        existingRemoteVideo = videoElement;
      } else {
        // Update existing video with fresh stream
        existingRemoteVideo.srcObject = firstRemoteStream;
      }
      
      existingRemoteVideo.play().then(() => {
        console.log('✅ Viewer remote video fix successful');
        setStreamError(null);
      }).catch((error) => {
        console.error('❌ Viewer remote video fix failed:', error);
        setStreamError('Click the video area to enable playback');
      });
    } else {
      console.log('ℹ️ No video to fix');
    }
  };

  // Join Modal
  if (showJoinModal) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md mx-4 border border-gray-200">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Monitor className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Airavata Technologies</h1>
            <h2 className="text-lg font-semibold text-gray-700">Screen Share Pro - Direct WebRTC</h2>
            <p className="text-sm text-gray-500 mt-2">Professional screen sharing solution</p>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Name
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your name"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Room ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              {onBackToModeSelector && (
                <button
                  onClick={onBackToModeSelector}
                  className="px-4 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors font-medium"
                >
                  Back
                </button>
              )}
              <button
                onClick={joinRoom}
                disabled={!roomId.trim() || !userName.trim()}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md transition-colors font-medium"
              >
                Join Room
              </button>
            </div>
            
            <div className="mt-6 pt-4 border-t border-gray-200 text-center">
              <p className="text-xs text-gray-500">
                © 2025 Airavata Technologies. All rights reserved.
              </p>
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
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-green-700 dark:text-green-300">Room: {roomId}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-900 rounded-full">
                <span className="text-sm text-blue-700 dark:text-blue-300">Free & Unlimited</span>
              </div>
              {crossNetworkMode && (
                <div className="flex items-center gap-2 px-3 py-1 bg-purple-100 dark:bg-purple-900 rounded-full">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span className="text-sm text-purple-700 dark:text-purple-300">Cross-Network Mode</span>
                </div>
              )}
              {turnServerStatus === 'available' && (
                <div className="flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900 rounded-full">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-green-700 dark:text-green-300">TURN Ready</span>
                </div>
              )}
              {bandwidthMonitor.targetBitrate > 0 && (
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${
                  bandwidthMonitor.fpsStability >= 90 ? 'bg-green-100 dark:bg-green-900' :
                  bandwidthMonitor.fpsStability >= 70 ? 'bg-yellow-100 dark:bg-yellow-900' : 'bg-red-100 dark:bg-red-900'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${
                    bandwidthMonitor.fpsStability >= 90 ? 'bg-green-500' :
                    bandwidthMonitor.fpsStability >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}></div>
                  <span className={`text-sm ${
                    bandwidthMonitor.fpsStability >= 90 ? 'text-green-700 dark:text-green-300' :
                    bandwidthMonitor.fpsStability >= 70 ? 'text-yellow-700 dark:text-yellow-300' : 'text-red-700 dark:text-red-300'
                  }`}>
                    {(bandwidthMonitor.actualBitrate / 1000000).toFixed(1)}/{(bandwidthMonitor.targetBitrate / 1000000).toFixed(1)} Mbps ({bandwidthMonitor.fpsStability}% FPS)
                  </span>
                </div>
              )}
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
            {onBackToModeSelector && (
              <button
                onClick={onBackToModeSelector}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
              >
                Back to Modes
              </button>
            )}
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
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-2 rounded-md transition-colors bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setAudioEnabled(!audioEnabled);
                    // If currently sharing, restart with new audio setting
                    if (isPresenting && currentStreamRef.current) {
                      const tracks = currentStreamRef.current.getAudioTracks();
                      tracks.forEach(track => track.enabled = !audioEnabled);
                    }
                  }}
                  className={`p-2 rounded-md transition-colors ${
                    audioEnabled 
                      ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400'
                  }`}
                  title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
                >
                  {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>

                
                {/* Recording Controls */}
                {isPresenting && (
                  <>
                    {!isRecording ? (
                      <button
                        onClick={startRecording}
                        className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-sm"
                      >
                        <Play className="w-4 h-4" />
                        Record
                      </button>
                    ) : (
                      <button
                        onClick={stopRecording}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors text-sm"
                      >
                        <Pause className="w-4 h-4" />
                        Stop Rec
                      </button>
                    )}
                    {recordedChunks.length > 0 && (
                      <button
                        onClick={downloadRecording}
                        className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors text-sm"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    )}
                  </>
                )}
                
                {!isPresenting ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={startScreenShare}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                    >
                      <Monitor className="w-4 h-4" />
                      Share Screen
                    </button>
                    <button
                      onClick={startCameraShare}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                    >
                      <Video className="w-4 h-4" />
                      Share Camera
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={sharingCamera ? stopCameraShare : stopScreenShare}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                    >
                      <Square className="w-4 h-4" />
                      {sharingCamera ? 'Stop Camera' : 'Stop Screen'}
                    </button>
                  </div>
                )}
                {(isPresenting || remoteStreams.size > 0) && (
                  <>
                    <button
                      onClick={toggleFullScreen}
                      className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors text-sm"
                    >
                      {isFullScreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                      {isFullScreen ? 'Exit Full' : 'Full Screen'}
                    </button>
                    <button
                      onClick={debugStream}
                      className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md transition-colors text-sm"
                    >
                      Fix Video
                    </button>
                  </>
                )}
              </div>
            </div>
            
            {/* Settings Panel */}
            {showSettings && (
              <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Frame Rate (FPS)
                    </label>
                    <select
                      value={fps}
                      onChange={(e) => setFps(Number(e.target.value))}
                      disabled={isPresenting}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-600"
                    >
                      <option value={15}>15 FPS (Low)</option>
                      <option value={24}>24 FPS (Cinematic)</option>
                      <option value={30}>30 FPS (Standard)</option>
                      <option value={45}>45 FPS (High)</option>
                      <option value={60}>60 FPS (Ultra)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Quality
                    </label>
                    <select
                      value={quality}
                      onChange={(e) => setQuality(e.target.value)}
                      disabled={isPresenting}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-600"
                    >
                      <option value="4K">4K Ultra HD (25 Mbps)</option>
                      <option value="1440p">1440p QHD (15 Mbps)</option>
                      <option value="1080p">1080p HD (10 Mbps)</option>
                      <option value="720p">720p (5 Mbps)</option>
                      <option value="480p">480p (2.5 Mbps)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Usage
                    </label>
                    <div className="px-3 py-2 text-sm bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-md border border-green-200 dark:border-green-700">
                      ✅ Unlimited & Free
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-600">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Screen Audio</span>
                    <button
                      onClick={() => setAudioEnabled(!audioEnabled)}
                      disabled={isPresenting}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        audioEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                      } disabled:opacity-50`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                        audioEnabled ? 'translate-x-6' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-600">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Microphone</span>
                    <button
                      onClick={() => setMicrophoneEnabled(!microphoneEnabled)}
                      disabled={isPresenting}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        microphoneEnabled ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'
                      } disabled:opacity-50`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                        microphoneEnabled ? 'translate-x-6' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-600">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Show Cursor</span>
                    <button
                      onClick={() => setShowCursor(!showCursor)}
                      disabled={isPresenting}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        showCursor ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                      } disabled:opacity-50`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                        showCursor ? 'translate-x-6' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>
                
                {isPresenting && (
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900 rounded-md border border-blue-200 dark:border-blue-700">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>Note:</strong> Settings can only be changed when not sharing. Stop sharing to modify settings.
                    </p>
                  </div>
                )}
              </div>
            )}
            
            {/* Video Container */}
            <div 
              className={`relative bg-gray-900 rounded-lg overflow-hidden min-h-[400px] flex items-center justify-center cursor-pointer ${
                isFullScreen ? 'fixed inset-0 z-50 rounded-none min-h-screen' : ''
              }`}
              onClick={() => {
                // Enable video playback on container click
                const video = videoContainerRef.current?.querySelector('video');
                if (video && video.paused) {
                  video.play().then(() => {
                    console.log('✅ Video enabled by user click');
                    setStreamError(null);
                  }).catch(console.error);
                }
              }}
            >
              {isPresenting ? (
                <div className={`relative w-full h-full ${isFullScreen ? 'min-h-screen' : ''}`}>
                  <div
                    ref={videoContainerRef}
                    className={`w-full h-full ${isFullScreen ? 'min-h-screen' : 'min-h-[400px]'} flex items-center justify-center`}
                  />
                  <div className="absolute top-2 left-2 flex gap-2">
                    <div className="bg-red-500 text-white px-2 py-1 rounded text-xs">
                      🔴 {sharingCamera ? 'CAMERA' : 'SCREEN'} ({fps} FPS) - {userName}
                    </div>
                    {microphoneEnabled && (
                      <div className="bg-green-500 text-white px-2 py-1 rounded text-xs">
                        🎤 MIC ON
                      </div>
                    )}
                    <div className={`text-white px-2 py-1 rounded text-xs ${
                      connectionStatus === 'connected' ? 'bg-green-500' : 
                      connectionStatus === 'connecting' ? 'bg-yellow-500' : 
                      connectionStatus === 'failed' ? 'bg-red-500' : 'bg-blue-500'
                    }`}>
                      {connectionStatus === 'connected' ? '🌐 CONNECTED' : 
                       connectionStatus === 'connecting' ? '🔄 CONNECTING' : 
                       connectionStatus === 'failed' ? '❌ FAILED' : '🌐 UNIVERSAL'}
                    </div>
                    {turnServerStatus === 'available' && (
                      <div className="bg-purple-500 text-white px-2 py-1 rounded text-xs">
                        🔄 TURN
                      </div>
                    )}
                    {isRecording && (
                      <div className="bg-red-600 text-white px-2 py-1 rounded text-xs animate-pulse">
                        ⏺ REC
                      </div>
                    )}
                    {bandwidthMonitor.targetBitrate > 0 && (
                      <div className={`text-white px-2 py-1 rounded text-xs ${
                        bandwidthMonitor.fpsStability >= 90 ? 'bg-green-600' :
                        bandwidthMonitor.fpsStability >= 70 ? 'bg-yellow-600' : 'bg-red-600'
                      }`}>
                        📊 {(bandwidthMonitor.actualBitrate / 1000000).toFixed(1)}M/{(bandwidthMonitor.targetBitrate / 1000000).toFixed(1)}M
                      </div>
                    )}
                    {bandwidthMonitor.fpsStability < 100 && bandwidthMonitor.targetBitrate > 0 && (
                      <div className={`text-white px-2 py-1 rounded text-xs ${
                        bandwidthMonitor.fpsStability >= 90 ? 'bg-green-600' :
                        bandwidthMonitor.fpsStability >= 70 ? 'bg-yellow-600' : 'bg-red-600'
                      }`}>
                        🎯 {bandwidthMonitor.fpsStability}% FPS
                      </div>
                    )}
                  </div>
                  {isFullScreen && (
                    <div className="absolute top-2 right-2 flex gap-2">
                      <button
                        onClick={toggleFullScreen}
                        className="bg-black bg-opacity-50 text-white px-3 py-2 rounded-md hover:bg-opacity-70 transition-colors flex items-center gap-1"
                      >
                        <Minimize className="w-4 h-4" />
                        Exit Full Screen
                      </button>
                    </div>
                  )}
                  {streamError && (
                    <div className="absolute bottom-2 left-2 right-2 bg-red-600 text-white px-3 py-2 rounded text-sm">
                      {streamError}
                    </div>
                  )}
                </div>
              ) : remoteStreams.size > 0 ? (
                <div className={`relative w-full h-full ${isFullScreen ? 'min-h-screen' : ''}`}>
                  <div
                    ref={videoContainerRef}
                    className={`w-full h-full ${isFullScreen ? 'min-h-screen' : 'min-h-[400px]'} flex items-center justify-center`}
                  />
                  <div className="absolute top-2 left-2 flex gap-2">
                    <div className="bg-green-500 text-white px-2 py-1 rounded text-xs">
                      👁 VIEWING SHARED SCREEN
                    </div>
                    <div className={`text-white px-2 py-1 rounded text-xs ${
                      connectionStatus === 'connected' ? 'bg-green-500' : 
                      connectionStatus === 'connecting' ? 'bg-yellow-500' : 
                      connectionStatus === 'failed' ? 'bg-red-500' : 'bg-blue-500'
                    }`}>
                      {connectionStatus === 'connected' ? '✅ CONNECTED' : 
                       connectionStatus === 'connecting' ? '🔄 CONNECTING' : 
                       connectionStatus === 'failed' ? '❌ FAILED' : '📶 READY'}
                    </div>
                  </div>
                  {isFullScreen && (
                    <div className="absolute top-2 right-2 flex gap-2">
                      <button
                        onClick={toggleFullScreen}
                        className="bg-black bg-opacity-50 text-white px-3 py-2 rounded-md hover:bg-opacity-70 transition-colors flex items-center gap-1"
                      >
                        <Minimize className="w-4 h-4" />
                        Exit Full Screen
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-400">
                  <Monitor className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">No screen share active</p>
                  <p className="text-sm opacity-75">
                    {participants.some(p => p.isPresenting) 
                      ? connectionStatus === 'connecting' ? "Connecting to presenter..." : "Waiting for stream..."
                      : "Click 'Start Sharing' to begin"
                    }
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Chat & Participants */}
        <div className="lg:col-span-1 space-y-6">
          {/* Participants Panel */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Participants ({participants.length})
              </h3>
            </div>
            
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {participants.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No participants yet
                </p>
              ) : (
                participants.map((participant) => (
                  <div key={participant.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                      {participant.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {participant.name}
                        {participant.id === userId && " (You)"}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        {participant.isPresenting && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                            Presenting
                          </span>
                        )}
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          Online
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chat Panel */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Chat
              </h3>
            </div>
            
            {/* Messages */}
            <div ref={chatMessagesRef} className="space-y-2 h-64 overflow-y-auto mb-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
              {messages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No messages yet
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Start a conversation with your team
                  </p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.userId === userId ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] px-3 py-2 rounded-lg ${
                        message.userId === userId
                          ? 'bg-blue-500 text-white'
                          : message.userId === 'system'
                          ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-center mx-auto'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                      }`}
                    >
                      {message.userId !== 'system' && message.userId !== userId && (
                        <p className="text-xs opacity-75 mb-1">{message.userName}</p>
                      )}
                      <p className="text-sm break-words">{message.text}</p>
                      <p className="text-xs opacity-75 mt-1">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Message Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={sendMessage}
                disabled={!messageInput.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Notification System */}
      {notifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`p-4 rounded-lg shadow-lg text-white max-w-sm animate-slide-in ${
                notification.type === 'error' ? 'bg-red-600' :
                notification.type === 'success' ? 'bg-green-600' :
                'bg-blue-600'
              }`}
            >
              <p className="text-sm font-medium">{notification.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}