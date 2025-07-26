import { useState, useRef, useEffect } from 'react';
import { Monitor, Square, Users, Video, RotateCcw } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface Participant {
  id: string;
  name: string;
}

export const BulletproofScreenShare = () => {
  const [isSharing, setIsSharing] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'failed'>('disconnected');
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('1');
  const [isPresenter, setIsPresenter] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Enhanced ICE servers with multiple TURN options
  const getICEServers = (turnOnly = false) => {
    const servers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { 
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ];

    return turnOnly ? servers.filter(s => s.urls.includes('turn')) : servers;
  };

  const createPeerConnection = (peerId: string, turnOnly = false): RTCPeerConnection => {
    console.log(`🔄 Creating ${turnOnly ? 'TURN-only' : 'hybrid'} connection for ${peerId}`);
    
    const pc = new RTCPeerConnection({
      iceServers: getICEServers(turnOnly),
      iceTransportPolicy: turnOnly ? 'relay' : 'all',
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    // Enhanced connection monitoring
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`🔗 Connection state for ${peerId}:`, state);
      setConnectionStatus(state as any);
      
      if (state === 'failed' && !turnOnly) {
        console.log(`❌ Connection failed for ${peerId} - retrying with TURN-only`);
        pc.close();
        peerConnectionsRef.current.delete(peerId);
        
        // Retry with TURN-only
        setTimeout(() => {
          const turnOnlyPC = createPeerConnection(peerId, true);
          peerConnectionsRef.current.set(peerId, turnOnlyPC);
        }, 1000);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      console.log(`🧊 ICE state for ${peerId}:`, iceState);
      
      if (iceState === 'checking') {
        // Set timeout for checking state
        setTimeout(() => {
          if (pc.iceConnectionState === 'checking') {
            console.log(`⏰ ICE timeout for ${peerId} - forcing TURN-only`);
            pc.close();
            peerConnectionsRef.current.delete(peerId);
            
            const turnOnlyPC = createPeerConnection(peerId, true);
            peerConnectionsRef.current.set(peerId, turnOnlyPC);
          }
        }, 5000);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        console.log(`🧊 Sending ICE candidate for ${peerId}`);
        socketRef.current.emit('webrtc-ice-candidate', {
          roomId,
          candidate: event.candidate,
          targetId: peerId
        });
      }
    };

    pc.ontrack = (event) => {
      console.log(`🎥 Received track from ${peerId}:`, event.track.kind);
      const [stream] = event.streams;
      if (stream) {
        // Bulletproof track protection
        stream.getTracks().forEach(track => {
          track.enabled = true;
          
          // Prevent track from being stopped
          const originalStop = track.stop;
          track.stop = () => {
            console.log(`🔒 Blocking ${track.kind} track stop for ${peerId}`);
          };
        });
        
        // Update remote streams
        setRemoteStreams(prev => new Map(prev).set(peerId, stream));
        
        // Display video immediately
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play().catch(e => {
            console.error('❌ Remote video play failed:', e);
            // Retry
            setTimeout(() => {
              if (remoteVideoRef.current) {
                remoteVideoRef.current.load();
                remoteVideoRef.current.play();
              }
            }, 100);
          });
        }
      }
    };

    return pc;
  };

  const startScreenShare = async () => {
    try {
      setConnectionStatus('connecting');
      
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 60 },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: true
      });

      localStreamRef.current = stream;
      setIsSharing(true);
      setIsPresenter(true);

      // Display local video
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Notify server
      if (socketRef.current) {
        socketRef.current.emit('presenter-started', { roomId, userName });
      }

      // Add tracks to existing connections
      peerConnectionsRef.current.forEach((pc, peerId) => {
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });
      });

      setConnectionStatus('connected');
    } catch (error) {
      console.error('❌ Failed to start screen share:', error);
      setConnectionStatus('failed');
    }
  };

  const stopScreenShare = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    setIsSharing(false);
    setIsPresenter(false);
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    if (socketRef.current) {
      socketRef.current.emit('presenter-stopped', { roomId });
    }
    
    setConnectionStatus('disconnected');
  };

  const joinRoom = () => {
    if (!userName.trim()) return;
    
    // Initialize socket
    socketRef.current = io('/', {
      transports: ['websocket'],
      upgrade: false
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('🔌 Connected to server');
      socket.emit('join-room', { roomId, userName });
    });

    socket.on('room-users', (users) => {
      setParticipants(users.filter((u: any) => u.id !== socket.id));
    });

    socket.on('webrtc-offer', async (data) => {
      console.log('📞 Received offer from:', data.senderId);
      
      const pc = createPeerConnection(data.senderId);
      peerConnectionsRef.current.set(data.senderId, pc);
      
      try {
        await pc.setRemoteDescription(data.offer);
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('webrtc-answer', {
          roomId,
          answer,
          targetId: data.senderId
        });
      } catch (error) {
        console.error('❌ Failed to handle offer:', error);
      }
    });

    socket.on('webrtc-answer', async (data) => {
      console.log('📞 Received answer from:', data.senderId);
      
      const pc = peerConnectionsRef.current.get(data.senderId);
      if (pc) {
        try {
          await pc.setRemoteDescription(data.answer);
        } catch (error) {
          console.error('❌ Failed to set remote description:', error);
        }
      }
    });

    socket.on('webrtc-ice-candidate', (data) => {
      console.log('🧊 Received ICE candidate from:', data.senderId);
      
      const pc = peerConnectionsRef.current.get(data.senderId);
      if (pc) {
        pc.addIceCandidate(data.candidate).catch(error => {
          console.error('❌ Failed to add ICE candidate:', error);
        });
      }
    });

    socket.on('presenter-started', (data) => {
      console.log('👥 Presenter started:', data.userName);
      
      if (data.userId !== socket.id) {
        // Create connection to presenter
        const pc = createPeerConnection(data.userId);
        peerConnectionsRef.current.set(data.userId, pc);
      }
    });

    socket.on('user-joined', async (data) => {
      console.log('👤 User joined:', data.userName);
      
      if (isPresenter && localStreamRef.current) {
        // Send offer to new user
        const pc = createPeerConnection(data.userId);
        peerConnectionsRef.current.set(data.userId, pc);
        
        // Add tracks
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current!);
        });
        
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          
          socket.emit('webrtc-offer', {
            roomId,
            offer,
            targetId: data.userId
          });
        } catch (error) {
          console.error('❌ Failed to create offer:', error);
        }
      }
    });

    setConnectionStatus('connected');
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'failed': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  if (!socketRef.current) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-md mx-auto mt-20">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="w-6 h-6" />
                Bulletproof Screen Share
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Your Name</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Enter your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Room ID</label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Enter room ID"
                />
              </div>
              <Button 
                onClick={joinRoom}
                disabled={!userName.trim() || !roomId.trim()}
                className="w-full"
              >
                Join Room
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Monitor className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Bulletproof Screen Share</h1>
            <Badge variant="outline" className="ml-2">
              Room {roomId}
            </Badge>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
              <span className="text-sm text-gray-600 capitalize">{connectionStatus}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-600" />
              <span className="text-sm text-gray-600">{participants.length + 1} participants</span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Video Area */}
          <div className="lg:col-span-3">
            <Card className="h-[600px]">
              <CardContent className="p-0 h-full">
                <div className="relative h-full bg-black rounded-lg overflow-hidden">
                  {/* Local Video (Presenter) */}
                  {isPresenter && (
                    <video
                      ref={videoRef}
                      className="w-full h-full object-contain"
                      autoPlay
                      playsInline
                      muted
                    />
                  )}
                  
                  {/* Remote Video (Viewer) */}
                  {!isPresenter && (
                    <video
                      ref={remoteVideoRef}
                      className="w-full h-full object-contain"
                      autoPlay
                      playsInline
                    />
                  )}
                  
                  {/* No Video State */}
                  {!isSharing && remoteStreams.size === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center text-white">
                        <Video className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">No screen sharing active</p>
                        <p className="text-sm opacity-75">Click "Start Screen Share" to begin</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Status Indicators */}
                  {isPresenter && (
                    <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                      Presenting
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Controls */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!isSharing ? (
                  <Button 
                    onClick={startScreenShare}
                    className="w-full"
                    disabled={connectionStatus !== 'connected'}
                  >
                    <Monitor className="w-4 h-4 mr-2" />
                    Start Screen Share
                  </Button>
                ) : (
                  <Button 
                    onClick={stopScreenShare}
                    variant="destructive"
                    className="w-full"
                  >
                    <Square className="w-4 h-4 mr-2" />
                    Stop Sharing
                  </Button>
                )}
                
                <Button 
                  onClick={() => window.location.reload()}
                  variant="outline"
                  className="w-full"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Refresh Connection
                </Button>
              </CardContent>
            </Card>

            {/* Participants */}
            <Card>
              <CardHeader>
                <CardTitle>Participants ({participants.length + 1})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium">{userName} (You)</span>
                    {isPresenter && (
                      <Badge variant="secondary" className="text-xs">Presenter</Badge>
                    )}
                  </div>
                  
                  {participants.map((participant) => (
                    <div key={participant.id} className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gray-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                        {participant.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm">{participant.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};