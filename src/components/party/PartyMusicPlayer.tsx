import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Upload,
  X,
  Shuffle,
  Repeat,
  ListMusic,
  Disc3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Track {
  id: string;
  name: string;
  file: File;
  url: string;
  duration?: number;
}

interface PartyMusicPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
}

export const PartyMusicPlayer = ({ isOpen, onClose, isHost }: PartyMusicPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);

  const currentTrack = currentTrackIndex !== null ? tracks[currentTrackIndex] : null;

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newTracks: Track[] = Array.from(files)
      .filter(file => file.type.startsWith('audio/'))
      .map(file => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        file,
        url: URL.createObjectURL(file)
      }));

    if (newTracks.length === 0) {
      toast.error("No audio files selected");
      return;
    }

    setTracks(prev => [...prev, ...newTracks]);
    toast.success(`${newTracks.length} track${newTracks.length > 1 ? 's' : ''} added`);
    
    // Auto-play first track if none is playing
    if (currentTrackIndex === null && newTracks.length > 0) {
      setCurrentTrackIndex(tracks.length);
    }
  };

  // Play/Pause toggle
  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Next track
  const nextTrack = () => {
    if (tracks.length === 0) return;
    
    if (isShuffled) {
      const randomIndex = Math.floor(Math.random() * tracks.length);
      setCurrentTrackIndex(randomIndex);
    } else {
      setCurrentTrackIndex(prev => 
        prev === null ? 0 : (prev + 1) % tracks.length
      );
    }
  };

  // Previous track
  const prevTrack = () => {
    if (tracks.length === 0) return;
    
    setCurrentTrackIndex(prev => 
      prev === null ? tracks.length - 1 : (prev - 1 + tracks.length) % tracks.length
    );
  };

  // Select specific track
  const selectTrack = (index: number) => {
    setCurrentTrackIndex(index);
    setIsPlaying(true);
  };

  // Remove track
  const removeTrack = (index: number) => {
    const track = tracks[index];
    URL.revokeObjectURL(track.url);
    
    setTracks(prev => prev.filter((_, i) => i !== index));
    
    if (currentTrackIndex === index) {
      setCurrentTrackIndex(null);
      setIsPlaying(false);
    } else if (currentTrackIndex !== null && currentTrackIndex > index) {
      setCurrentTrackIndex(currentTrackIndex - 1);
    }
  };

  // Volume change
  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume / 100;
    }
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  // Toggle mute
  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
    }
    setIsMuted(!isMuted);
  };

  // Seek
  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration || 0);
    const handleEnded = () => {
      if (isRepeat) {
        audio.currentTime = 0;
        audio.play();
      } else {
        nextTrack();
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [isRepeat]);

  // Auto-play when track changes
  useEffect(() => {
    if (audioRef.current && currentTrack) {
      audioRef.current.load();
      if (isPlaying) {
        audioRef.current.play().catch(console.error);
      }
    }
  }, [currentTrackIndex, currentTrack?.url]);

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      tracks.forEach(track => URL.revokeObjectURL(track.url));
    };
  }, []);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 100 }}
      className="fixed inset-x-0 bottom-0 z-50 safe-area-bottom"
    >
      <div className="bg-gradient-to-t from-black via-black/95 to-black/90 backdrop-blur-xl rounded-t-3xl border-t border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
              <Music className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-semibold text-sm">Music Player</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 rounded-full text-white/70 hover:text-white hover:bg-white/10"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Now Playing */}
        <div className="px-4 py-4">
          {currentTrack ? (
            <div className="flex items-center gap-4">
              {/* Album Art Placeholder */}
              <motion.div
                animate={{ rotate: isPlaying ? 360 : 0 }}
                transition={{ duration: 3, repeat: isPlaying ? Infinity : 0, ease: "linear" }}
                className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center shadow-lg shadow-purple-500/30"
              >
                <Disc3 className="w-8 h-8 text-white" />
              </motion.div>
              
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{currentTrack.name}</p>
                <p className="text-white/50 text-xs">From your device</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center">
                <Music className="w-8 h-8 text-white/30" />
              </div>
              <div>
                <p className="text-white/50 font-medium text-sm">No track selected</p>
                <p className="text-white/30 text-xs">Add music from your device</p>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {currentTrack && (
            <div className="mt-4 space-y-2">
              <Slider
                value={[currentTime]}
                max={duration || 100}
                step={1}
                onValueChange={handleSeek}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-white/50">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-center gap-4">
            {/* Shuffle */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "w-10 h-10 rounded-full",
                isShuffled ? "text-purple-400" : "text-white/50 hover:text-white"
              )}
              onClick={() => setIsShuffled(!isShuffled)}
            >
              <Shuffle className="w-5 h-5" />
            </Button>

            {/* Previous */}
            <Button
              variant="ghost"
              size="icon"
              className="w-12 h-12 rounded-full text-white hover:bg-white/10"
              onClick={prevTrack}
              disabled={tracks.length === 0}
            >
              <SkipBack className="w-6 h-6" />
            </Button>

            {/* Play/Pause */}
            <Button
              size="icon"
              className="w-14 h-14 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg shadow-purple-500/30"
              onClick={togglePlay}
              disabled={!currentTrack}
            >
              {isPlaying ? (
                <Pause className="w-7 h-7 text-white" />
              ) : (
                <Play className="w-7 h-7 text-white ml-1" />
              )}
            </Button>

            {/* Next */}
            <Button
              variant="ghost"
              size="icon"
              className="w-12 h-12 rounded-full text-white hover:bg-white/10"
              onClick={nextTrack}
              disabled={tracks.length === 0}
            >
              <SkipForward className="w-6 h-6" />
            </Button>

            {/* Repeat */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "w-10 h-10 rounded-full",
                isRepeat ? "text-purple-400" : "text-white/50 hover:text-white"
              )}
              onClick={() => setIsRepeat(!isRepeat)}
            >
              <Repeat className="w-5 h-5" />
            </Button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-3 mt-4 px-2">
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-white/70 hover:text-white"
              onClick={toggleMute}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </Button>
            <Slider
              value={[isMuted ? 0 : volume]}
              max={100}
              step={1}
              onValueChange={handleVolumeChange}
              className="flex-1"
            />
          </div>
        </div>

        {/* Playlist */}
        <div className="border-t border-white/10">
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-white/50" />
              <span className="text-white/70 text-xs font-medium">Playlist ({tracks.length})</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-purple-400 hover:text-purple-300 text-xs gap-1.5"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5" />
              Add Music
            </Button>
          </div>
          
          <ScrollArea className="h-32">
            {tracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-white/30">
                <Music className="w-8 h-8 mb-2" />
                <p className="text-xs">No tracks added yet</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-purple-400 hover:text-purple-300 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Add from device
                </Button>
              </div>
            ) : (
              <div className="px-2 pb-2 space-y-1">
                {tracks.map((track, index) => (
                  <motion.button
                    key={track.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left",
                      currentTrackIndex === index
                        ? "bg-purple-500/20 border border-purple-500/30"
                        : "hover:bg-white/5"
                    )}
                    onClick={() => selectTrack(index)}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                      currentTrackIndex === index
                        ? "bg-gradient-to-r from-purple-500 to-pink-500"
                        : "bg-white/10"
                    )}>
                      {currentTrackIndex === index && isPlaying ? (
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 1 }}
                        >
                          <Music className="w-4 h-4 text-white" />
                        </motion.div>
                      ) : (
                        <Music className={cn(
                          "w-4 h-4",
                          currentTrackIndex === index ? "text-white" : "text-white/50"
                        )} />
                      )}
                    </div>
                    <span className={cn(
                      "flex-1 text-sm truncate",
                      currentTrackIndex === index ? "text-white font-medium" : "text-white/70"
                    )}>
                      {track.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 text-white/30 hover:text-red-400 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTrack(index);
                      }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </motion.button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Hidden audio element */}
        <audio ref={audioRef} src={currentTrack?.url} />
      </div>
    </motion.div>
  );
};
