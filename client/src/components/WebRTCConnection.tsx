import { useRef, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface WebRTCConnectionProps {
  roomId: string;
  userName: string;
  onStreamReceived: (stream: MediaStream, peerId: string) => void;
  onConnectionStateChange: (state: 'connecting' | 'connected' | 'disconnected' | 'failed') => void;
}

export const WebRTCConnection = ({ 
  roomId, 
  userName, 
  onStreamReceived, 
  onConnectionStateChange 
}: WebRTCConnectionProps) => {
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const [isPresenter, setIsPresenter] = useState(false);

  // Enhanced ICE servers with proven TURN servers
  const getICEServers = () => [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
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

  const createPeerConnection = (peerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({
      iceServers: getICEServers(),
      iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    // Enhanced connection state monitoring
    pc.onconnectionstatechange = () => {
      console.log(`🔗 Connection state for ${peerId}:`, pc.connectionState);
      onConnectionStateChange(pc.connectionState as any);
      
      if (pc.connectionState === 'failed') {
        console.log(`❌ Connection failed for ${peerId} - attempting TURN-only retry`);
        pc.close();
        peerConnectionsRef.current.delete(peerId);
        
        // Retry with TURN-only
        setTimeout(() => {
          const turnOnlyPC = createTurnOnlyConnection(peerId);
          peerConnectionsRef.current.set(peerId, turnOnlyPC);
        }, 1000);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE connection state for ${peerId}:`, pc.iceConnectionState);
      
      if (pc.iceConnectionState === 'checking') {
        // Set timeout for checking state
        setTimeout(() => {
          if (pc.iceConnectionState === 'checking') {
            console.log(`⏰ ICE checking timeout for ${peerId} - forcing TURN-only`);
            pc.close();
            peerConnectionsRef.current.delete(peerId);
            
            const turnOnlyPC = createTurnOnlyConnection(peerId);
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
        // Protect tracks from being muted/ended
        stream.getTracks().forEach(track => {
          track.enabled = true;
          
          // Prevent track from being ended
          const originalStop = track.stop;
          track.stop = () => {
            console.log(`🔒 Blocking ${track.kind} track stop for ${peerId}`);
          };
        });
        
        onStreamReceived(stream, peerId);
      }
    };

    return pc;
  };

  const createTurnOnlyConnection = (peerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({
      iceServers: getICEServers().filter(server => server.urls.includes('turn')),
      iceTransportPolicy: 'relay', // TURN-only
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    // Same event handlers as regular connection
    pc.onconnectionstatechange = () => {
      console.log(`🔗 TURN-only connection state for ${peerId}:`, pc.connectionState);
      onConnectionStateChange(pc.connectionState as any);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        console.log(`🧊 Sending TURN-only ICE candidate for ${peerId}`);
        socketRef.current.emit('webrtc-ice-candidate', {
          roomId,
          candidate: event.candidate,
          targetId: peerId
        });
      }
    };

    pc.ontrack = (event) => {
      console.log(`🎥 Received TURN-only track from ${peerId}:`, event.track.kind);
      const [stream] = event.streams;
      if (stream) {
        // Protect tracks
        stream.getTracks().forEach(track => {
          track.enabled = true;
          const originalStop = track.stop;
          track.stop = () => console.log(`🔒 Blocking TURN-only ${track.kind} track stop`);
        });
        
        onStreamReceived(stream, peerId);
      }
    };

    return pc;
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 60 },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: true
      });

      localStreamRef.current = stream;
      setIsPresenter(true);

      // Notify server
      if (socketRef.current) {
        socketRef.current.emit('presenter-started', { roomId, userName });
      }

      // Add tracks to all peer connections
      peerConnectionsRef.current.forEach((pc, peerId) => {
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });
      });

      return stream;
    } catch (error) {
      console.error('❌ Failed to start screen share:', error);
      throw error;
    }
  };

  const stopScreenShare = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    setIsPresenter(false);
    
    if (socketRef.current) {
      socketRef.current.emit('presenter-stopped', { roomId });
    }
  };

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io('/', {
      transports: ['websocket'],
      upgrade: false
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('🔌 Connected to server');
      socket.emit('join-room', { roomId, userName });
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

    return () => {
      socket.disconnect();
      peerConnectionsRef.current.forEach(pc => pc.close());
      peerConnectionsRef.current.clear();
    };
  }, [roomId, userName, isPresenter]);

  return {
    startScreenShare,
    stopScreenShare,
    isPresenter
  };
};