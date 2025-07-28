// Singleton Socket.io connection manager to prevent duplicate connections
import { io, Socket } from 'socket.io-client';

class SocketManager {
  private static instance: SocketManager;
  private socket: Socket | null = null;
  private isConnecting = false;
  private messageHandlers = new Set<(message: any) => void>();
  private participantHandlers = new Set<(participants: any[]) => void>();

  private constructor() {}

  static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  connect(): Socket {
    if (this.socket && this.socket.connected) {
      console.log('🔌 Reusing existing Socket.io connection');
      return this.socket;
    }

    if (this.isConnecting) {
      console.log('🔌 Connection already in progress, waiting...');
      return this.socket!;
    }

    this.isConnecting = true;
    console.log('🔌 Creating new singleton Socket.io connection');

    // Disconnect existing socket if any
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io();
    
    // Set up event handlers once
    this.socket.on('new-message', (message: any) => {
      console.log('📨 Singleton received message:', message.id);
      this.messageHandlers.forEach(handler => handler(message));
    });

    this.socket.on('participants-updated', (participants: any[]) => {
      console.log('👥 Singleton received participants update');
      this.participantHandlers.forEach(handler => handler(participants));
    });

    this.socket.on('connect', () => {
      console.log('✅ Singleton socket connected');
      this.isConnecting = false;
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Singleton socket disconnected');
      this.isConnecting = false;
    });

    return this.socket;
  }

  addMessageHandler(handler: (message: any) => void) {
    this.messageHandlers.add(handler);
  }

  removeMessageHandler(handler: (message: any) => void) {
    this.messageHandlers.delete(handler);
  }

  addParticipantHandler(handler: (participants: any[]) => void) {
    this.participantHandlers.add(handler);
  }

  removeParticipantHandler(handler: (participants: any[]) => void) {
    this.participantHandlers.delete(handler);
  }

  emit(event: string, data: any) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.messageHandlers.clear();
    this.participantHandlers.clear();
    this.isConnecting = false;
  }
}

export default SocketManager;