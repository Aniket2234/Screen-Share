import { useEffect, useRef } from 'react';

interface VideoDisplayProps {
  stream: MediaStream | null;
  isPresenter: boolean;
  className?: string;
}

export const VideoDisplay = ({ stream, isPresenter, className = "" }: VideoDisplayProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!stream || !videoRef.current) return;

    const videoElement = videoRef.current;
    
    // Enhanced video setup for bulletproof playback
    videoElement.srcObject = stream;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.muted = isPresenter; // Mute presenter to avoid feedback
    videoElement.controls = false;
    
    // Track protection - prevent muting/ending
    stream.getVideoTracks().forEach(track => {
      if (track.kind === 'video') {
        // Prevent track from being muted
        Object.defineProperty(track, 'enabled', {
          get: () => true,
          set: () => {}, // Block any attempts to disable
          configurable: false
        });
        
        // Prevent track from being ended
        const originalStop = track.stop;
        track.stop = () => {
          console.log('🔒 Blocking video track stop attempt');
        };
      }
    });
    
    // Multiple play attempts with different strategies
    const playVideo = async () => {
      try {
        await videoElement.play();
        console.log(`✅ ${isPresenter ? 'Presenter' : 'Viewer'} video playing successfully`);
      } catch (error) {
        console.error(`❌ ${isPresenter ? 'Presenter' : 'Viewer'} video play failed:`, error);
        // Retry with load
        videoElement.load();
        setTimeout(() => {
          videoElement.play().catch(e => console.error('Retry failed:', e));
        }, 100);
      }
    };

    // Event handlers for better reliability
    videoElement.onloadedmetadata = () => {
      console.log(`📹 ${isPresenter ? 'Presenter' : 'Viewer'} video metadata loaded`);
      playVideo();
    };
    
    videoElement.oncanplay = () => {
      console.log(`📹 ${isPresenter ? 'Presenter' : 'Viewer'} video can play`);
      playVideo();
    };
    
    videoElement.onplaying = () => {
      console.log(`✅ ${isPresenter ? 'Presenter' : 'Viewer'} video is playing`);
    };
    
    videoElement.onerror = (error) => {
      console.error(`❌ ${isPresenter ? 'Presenter' : 'Viewer'} video error:`, error);
      // Recreate video element on error
      setTimeout(() => {
        videoElement.load();
        playVideo();
      }, 1000);
    };

    // Immediate play attempt
    playVideo();
    
    // Retry attempts at different intervals
    setTimeout(playVideo, 100);
    setTimeout(playVideo, 500);
    setTimeout(playVideo, 1000);
    
    // Cleanup
    return () => {
      videoElement.srcObject = null;
    };
  }, [stream, isPresenter]);

  if (!stream) {
    return (
      <div className={`bg-black flex items-center justify-center ${className}`}>
        <div className="text-white text-center">
          <div className="text-lg font-medium">No Video Stream</div>
          <div className="text-sm opacity-75">Waiting for connection...</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative bg-black ${className}`}>
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        playsInline
        muted={isPresenter}
      />
      {isPresenter && (
        <div className="absolute top-4 left-4 bg-red-500 text-white px-2 py-1 rounded text-sm">
          Presenting
        </div>
      )}
    </div>
  );
};