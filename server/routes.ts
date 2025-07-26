import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { storage } from "./storage";
import jwt from 'jsonwebtoken';

interface Participant {
  id: string;
  name: string;
  isPresenting: boolean;
  joinedAt: number;
  connectionStatus?: 'connecting' | 'connected' | 'failed' | 'offline';
}

interface Room {
  id: string;
  participants: Map<string, Participant>;
  messages: Array<{
    id: string;
    userId: string;
    userName: string;
    text: string;
    timestamp: number;
  }>;
}

const rooms = new Map<string, Room>();

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Add network detection API endpoint
  app.get('/api/ping', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Stream.io API key endpoint for frontend
  app.get('/api/stream-config', (req, res) => {
    const apiKey = process.env.STREAM_API_KEY?.trim();
    
    if (!apiKey) {
      return res.status(400).json({ error: 'Stream.io API key not configured' });
    }

    res.json({ apiKey });
  });

  // Stream.io token generation endpoint
  app.post('/api/stream-token', async (req, res) => {
    const { userId, userName } = req.body;
    
    if (!userId || !userName) {
      return res.status(400).json({ error: 'userId and userName are required' });
    }

    try {
      const apiKey = process.env.STREAM_API_KEY?.trim();
      const secret = process.env.STREAM_API_SECRET?.trim();
      
      if (!apiKey || !secret) {
        return res.status(400).json({ error: 'Stream.io API credentials not configured' });
      }

      // Generate proper JWT token for Stream.io
      const issuedAt = Math.floor(Date.now() / 1000);
      const expiration = issuedAt + (24 * 60 * 60); // 24 hours

      const payload = {
        user_id: userId,
        iss: apiKey,
        sub: userId,
        iat: issuedAt,
        exp: expiration
      };

      const token = jwt.sign(payload, secret, { algorithm: 'HS256' });
      
      res.json({ 
        token,
        userId,
        userName,
        expiresAt: expiration * 1000
      });
    } catch (error) {
      console.error('Error generating Stream.io token:', error);
      res.status(500).json({ error: 'Failed to generate token' });
    }
  });
  
  // Initialize Socket.IO
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (data: { roomId: string; userName: string }) => {
      const { roomId, userName } = data;
      
      // Create room if it doesn't exist
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          id: roomId,
          participants: new Map(),
          messages: []
        });
      }

      const room = rooms.get(roomId)!;
      
      // Add participant to room
      const participant: Participant = {
        id: socket.id,
        name: userName,
        isPresenting: false,
        joinedAt: Date.now(),
        connectionStatus: 'connected'
      };
      
      room.participants.set(socket.id, participant);
      socket.join(roomId);

      // Notify all participants in the room
      const participantsList = Array.from(room.participants.values());
      io.to(roomId).emit('participants-updated', participantsList);

      // Send system message
      const joinMessage = {
        id: `${Date.now()}-system-${Math.random().toString(36).substr(2, 9)}`,
        userId: 'system',
        userName: 'System',
        text: `${userName} joined the room`,
        timestamp: Date.now()
      };
      room.messages.push(joinMessage);
      io.to(roomId).emit('new-message', joinMessage);

      console.log(`${userName} joined room ${roomId}`);
    });

    socket.on('start-presenting', (data: { roomId: string; userName: string }) => {
      const { roomId, userName } = data;
      const room = rooms.get(roomId);
      
      if (room && room.participants.has(socket.id)) {
        // Update participant status
        const participant = room.participants.get(socket.id)!;
        participant.isPresenting = true;

        // Notify all participants
        const participantsList = Array.from(room.participants.values());
        io.to(roomId).emit('participants-updated', participantsList);

        // Send system message
        const presentMessage = {
          id: `${Date.now()}-system-${Math.random().toString(36).substr(2, 9)}`,
          userId: 'system',
          userName: 'System',
          text: `${userName} started screen sharing`,
          timestamp: Date.now()
        };
        room.messages.push(presentMessage);
        io.to(roomId).emit('new-message', presentMessage);

        // Notify other participants to request stream
        socket.to(roomId).emit('presenter-started', { presenterId: socket.id, presenterName: userName });
      }
    });

    socket.on('stop-presenting', (data: { roomId: string; userName: string }) => {
      const { roomId, userName } = data;
      const room = rooms.get(roomId);
      
      if (room && room.participants.has(socket.id)) {
        // Update participant status
        const participant = room.participants.get(socket.id)!;
        participant.isPresenting = false;

        // Notify all participants
        const participantsList = Array.from(room.participants.values());
        io.to(roomId).emit('participants-updated', participantsList);

        // Send system message
        const stopMessage = {
          id: `${Date.now()}-system-${Math.random().toString(36).substr(2, 9)}`,
          userId: 'system',
          userName: 'System',
          text: `${userName} stopped screen sharing`,
          timestamp: Date.now()
        };
        room.messages.push(stopMessage);
        io.to(roomId).emit('new-message', stopMessage);

        // Notify other participants that presenting stopped
        socket.to(roomId).emit('presenter-stopped', { presenterId: socket.id });
      }
    });

    // REMOVED: Old duplicate send-message handler to prevent dual messaging system

    socket.on('leave-room', (data: { roomId: string; userName: string }) => {
      const { roomId, userName } = data;
      const room = rooms.get(roomId);
      
      if (room && room.participants.has(socket.id)) {
        room.participants.delete(socket.id);
        socket.leave(roomId);

        // Notify remaining participants
        const participantsList = Array.from(room.participants.values());
        io.to(roomId).emit('participants-updated', participantsList);

        // Send system message
        const leaveMessage = {
          id: `${Date.now()}-system-${Math.random().toString(36).substr(2, 9)}`,
          userId: 'system',
          userName: 'System',
          text: `${userName} left the room`,
          timestamp: Date.now()
        };
        room.messages.push(leaveMessage);
        io.to(roomId).emit('new-message', leaveMessage);

        // Clean up empty rooms
        if (room.participants.size === 0) {
          rooms.delete(roomId);
        }
      }
    });

    // Handle sending messages
    socket.on('send-message', (data: { roomId: string; message: string; userName: string; userId?: string }) => {
      const { roomId, message, userName, userId: messageUserId } = data;
      const room = rooms.get(roomId);
      
      if (room) {
        const newMessage = {
          id: `${Date.now()}-${socket.id}-${Math.random().toString(36).substr(2, 9)}`,
          userId: messageUserId || socket.id,
          userName: userName,
          text: message,
          timestamp: Date.now()
        };
        
        room.messages.push(newMessage);
        // Send to all participants in the room
        io.to(roomId).emit('new-message', newMessage);
        
        console.log(`Message from ${userName} in room ${roomId}: ${message}`);
      }
    });

    // WebRTC signaling
    socket.on('webrtc-offer', (data: { roomId: string; offer: any; targetId: string }) => {
      socket.to(data.targetId).emit('webrtc-offer', {
        offer: data.offer,
        senderId: socket.id
      });
    });

    socket.on('webrtc-answer', (data: { roomId: string; answer: any; targetId: string }) => {
      socket.to(data.targetId).emit('webrtc-answer', {
        answer: data.answer,
        senderId: socket.id
      });
    });

    socket.on('webrtc-ice-candidate', (data: { roomId: string; candidate: any; targetId: string }) => {
      socket.to(data.targetId).emit('webrtc-ice-candidate', {
        candidate: data.candidate,
        senderId: socket.id
      });
    });

    // Connection status updates
    socket.on('connection-status-update', (data: { roomId: string; status: 'connecting' | 'connected' | 'failed' | 'offline' }) => {
      const { roomId, status } = data;
      const room = rooms.get(roomId);
      
      if (room && room.participants.has(socket.id)) {
        const participant = room.participants.get(socket.id)!;
        participant.connectionStatus = status;
        
        // Notify all participants of status update
        const participantsList = Array.from(room.participants.values());
        io.to(roomId).emit('participants-updated', participantsList);
      }
    });

    // Stream refresh mechanism for black screen recovery
    socket.on('request-stream-refresh', (data: { roomId: string; requesterId: string }) => {
      const { roomId, requesterId } = data;
      const room = rooms.get(roomId);
      
      if (room) {
        // Find presenter in the room
        const presenter = Array.from(room.participants.values()).find(p => p.isPresenting);
        
        if (presenter) {
          // Notify presenter to refresh stream for this viewer
          socket.to(presenter.id).emit('refresh-stream-for-viewer', {
            viewerId: requesterId,
            roomId: roomId
          });
          
          console.log(`Stream refresh requested for viewer ${requesterId} from presenter ${presenter.id}`);
        }
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      
      // Remove from all rooms
      for (const [roomId, room] of rooms.entries()) {
        if (room.participants.has(socket.id)) {
          const participant = room.participants.get(socket.id)!;
          room.participants.delete(socket.id);

          // Notify remaining participants
          const participantsList = Array.from(room.participants.values());
          io.to(roomId).emit('participants-updated', participantsList);

          // Send system message
          const disconnectMessage = {
            id: `${Date.now()}-system-${Math.random().toString(36).substr(2, 9)}`,
            userId: 'system',
            userName: 'System',
            text: `${participant.name} disconnected`,
            timestamp: Date.now()
          };
          room.messages.push(disconnectMessage);
          io.to(roomId).emit('new-message', disconnectMessage);

          // Notify about presenter disconnection
          if (participant.isPresenting) {
            socket.to(roomId).emit('presenter-stopped', { presenterId: socket.id });
          }

          // Clean up empty rooms
          if (room.participants.size === 0) {
            rooms.delete(roomId);
          }
        }
      }
    });
  });

  return httpServer;
}
