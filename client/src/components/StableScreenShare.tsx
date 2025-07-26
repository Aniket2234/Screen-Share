import React, { useState, useRef, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Monitor, StopCircle, Video, VideoOff, Users, Settings, Mic, MicOff } from 'lucide-react';

export default function StableScreenShare() {
  // Initialize with minimal state
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState('1');
  const [user, setUser] = useState({ id: 'user123', name: 'User' });
  const [participants, setParticipants] = useState<any[]>([]);
  const [isInRoom, setIsInRoom] = useState(false);
  
  // Initialize socket on component mount
  useEffect(() => {
    const newSocket = io('http://localhost:5000');
    setSocket(newSocket);
    
    newSocket.on('connect', () => {
      console.log('Connected to server');
      // Auto-join room for testing
      newSocket.emit('join-room', { roomId: '1', user: { id: 'user123', name: 'User' } });
      setIsInRoom(true);
    });
    
    newSocket.on('room-joined', (data) => {
      setParticipants(data.participants);
    });
    
    newSocket.on('participant-joined', (data) => {
      setParticipants(prev => [...prev, data.participant]);
    });
    
    return () => {
      newSocket.close();
    };
  }, []);
  
  if (!socket || !isInRoom) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Monitor className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Connecting to room...</p>
        </div>
      </div>
    );
  }
  const [isPresenting, setIsPresenting] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'failed'>('disconnected');
  const [streamError, setStreamError] = useState<string | null>(null);
  
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const socketRef = useRef<Socket>(socket);

  // Simplified WebRTC configuration
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { 
      urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];

  // Simple peer connection creation
  const createPeerConnection = (peerId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10
    });

    // Simple connection state monitoring
    pc.onconnectionstatechange = () => {
      console.log(`🔗 Connection ${peerId}:`, pc.connectionState);
      if (pc.connectionState === 'connected') {
        setConnectionStatus('connected');
        console.log(`✅ Connected to ${peerId}`);
      } else if (pc.connectionState === 'connecting') {
        setConnectionStatus('connecting');
      } else if (pc.connectionState === 'failed') {
        console.log(`❌ Connection failed to ${peerId}`);
        setConnectionStatus('failed');
      }
    };

    // ICE candidate handling
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('webrtc-ice-candidate', {
          roomId,
          candidate: event.candidate,
          targetId: peerId
        });
      }
    };

    // Stream handling for viewers
    pc.ontrack = (event) => {
      console.log('🎥 Received stream from:', peerId);
      const remoteStream = event.streams[0];
      setRemoteStreams(prev => new Map(prev.set(peerId, remoteStream)));
      
      // IMMEDIATE video display for viewers
      if (!isPresenting && videoContainerRef.current) {
        console.log('🎯 CREATING FORCED VIDEO FOR VIEWER');
        
        const videoEl = document.createElement('video');
        videoEl.srcObject = remoteStream;
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        videoEl.muted = true;
        videoEl.style.cssText = `
          width: 100% !important;
          height: 100% !important;
          object-fit: contain !important;
          background-color: #000 !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          z-index: 999 !important;
        `;
        
        videoContainerRef.current.innerHTML = '';
        videoContainerRef.current.appendChild(videoEl);
        
        videoEl.play().then(() => {
          console.log('✅ VIEWER VIDEO PLAYING');
          setTimeout(() => { videoEl.muted = false; }, 1000);
        }).catch(() => {
          console.log('🔄 Retrying video play...');
          setTimeout(() => videoEl.play(), 100);
        });
      }
    };

    return pc;
  };

  // Start screen sharing
  const startScreenShare = async () => {
    try {
      console.log('🎬 Starting screen share...');
      
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, width: 1920, height: 1080 },
        audio: true
      });
      
      setLocalStream(stream);
      setIsPresenting(true);
      
      // Show local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      // Create connections to all participants
      participants.forEach(participant => {
        if (participant.id !== user.id) {
          const pc = createPeerConnection(participant.socketId);
          peerConnectionsRef.current.set(participant.socketId, pc);
          
          // Add tracks
          stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
          });
          
          // Create and send offer
          pc.createOffer().then(offer => {
            pc.setLocalDescription(offer);
            socketRef.current.emit('webrtc-offer', {
              roomId,
              offer,
              targetId: participant.socketId
            });
          });
        }
      });
      
      // Emit presenter started
      socketRef.current.emit('presenter-started', { roomId, userId: user.id });
      
    } catch (error) {
      console.error('❌ Screen share failed:', error);
      setStreamError('Failed to start screen sharing');
    }
  };

  // Stop screen sharing
  const stopScreenShare = () => {
    console.log('🛑 Stopping screen share...');
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    
    setIsPresenting(false);
    setConnectionStatus('disconnected');
    
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    
    socketRef.current.emit('presenter-stopped', { roomId });
  };

  // Socket event handlers
  useEffect(() => {
    const handlePresenterStarted = (data: any) => {
      console.log('👥 Presenter started:', data.userId);
      if (data.userId !== user.id) {
        setConnectionStatus('connecting');
      }
    };

    const handleWebRTCOffer = async (data: any) => {
      console.log('📞 Received offer from:', data.senderId);
      
      const pc = createPeerConnection(data.senderId);
      peerConnectionsRef.current.set(data.senderId, pc);
      
      await pc.setRemoteDescription(data.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socketRef.current.emit('webrtc-answer', {
        roomId,
        answer,
        targetId: data.senderId
      });
    };

    const handleWebRTCAnswer = async (data: any) => {
      console.log('📞 Received answer from:', data.senderId);
      const pc = peerConnectionsRef.current.get(data.senderId);
      if (pc) {
        await pc.setRemoteDescription(data.answer);
      }
    };

    const handleICECandidate = (data: any) => {
      const pc = peerConnectionsRef.current.get(data.senderId);
      if (pc) {
        pc.addIceCandidate(data.candidate);
      }
    };

    socketRef.current.on('presenter-started', handlePresenterStarted);
    socketRef.current.on('webrtc-offer', handleWebRTCOffer);
    socketRef.current.on('webrtc-answer', handleWebRTCAnswer);
    socketRef.current.on('webrtc-ice-candidate', handleICECandidate);

    return () => {
      socketRef.current.off('presenter-started', handlePresenterStarted);
      socketRef.current.off('webrtc-offer', handleWebRTCOffer);
      socketRef.current.off('webrtc-answer', handleWebRTCAnswer);
      socketRef.current.off('webrtc-ice-candidate', handleICECandidate);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Screen Share Pro - Stable
              </CardTitle>
              <div className="flex gap-2">
                <Badge variant="secondary">Room: {roomId}</Badge>
                <Badge variant="outline">Free & Unlimited</Badge>
                <Badge variant={connectionStatus === 'connected' ? 'default' : 'secondary'}>
                  {connectionStatus}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-4">
              {!isPresenting ? (
                <Button onClick={startScreenShare} className="bg-green-600 hover:bg-green-700">
                  <Monitor className="h-4 w-4 mr-2" />
                  Share Screen
                </Button>
              ) : (
                <Button onClick={stopScreenShare} variant="destructive">
                  <StopCircle className="h-4 w-4 mr-2" />
                  Stop Screen
                </Button>
              )}
              <Button onClick={onLeaveRoom} variant="outline">
                Leave Room
              </Button>
            </div>
            
            {streamError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {streamError}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Area */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Screen Share</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                  {isPresenting && (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-contain"
                    />
                  )}
                  
                  <div ref={videoContainerRef} className="absolute inset-0" />
                  
                  {!isPresenting && remoteStreams.size === 0 && (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      <div className="text-center">
                        <Monitor className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No screen sharing active</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Participants */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Participants ({participants.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {participants.map(participant => (
                    <div key={participant.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                      <span className="font-medium">{participant.name}</span>
                      {participant.id === user.id && (
                        <Badge variant="secondary">You</Badge>
                      )}
                      {isPresenting && participant.id === user.id && (
                        <Badge variant="default">Presenting</Badge>
                      )}
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
}