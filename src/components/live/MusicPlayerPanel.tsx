import { useState, useRef, useEffect } from "react";
import { X, Play, Pause, SkipBack, SkipForward, Music, Volume2, VolumeX, Upload, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface Track {
  id: string;
  name: string;
  file: File;
  url: string;
  duration: number;
}

interface MusicPlayerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
  onAudioStream?: (stream: MediaStream | null) => void;
}

export const MusicPlayerPanel = ({
  isOpen,
  onClose,
  isHost,
  onAudioStream,
}: MusicPlayerPanelProps) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Stop all audio on unmount (when leaving live stream)
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
        audioContextRef.current = null;
      }
      sourceNodeRef.current = null;
      destinationRef.current = null;
    };
  }, []);

  // Setup audio context for streaming
  useEffect(() => {
    if (!audioRef.current || !isHost) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
      destinationRef.current = audioContextRef.current.createMediaStreamDestination();
      
      // Connect to both speakers and stream destination
      const gainNode = audioContextRef.current.createGain();
      sourceNodeRef.current.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination); // For host to hear
      gainNode.connect(destinationRef.current); // For streaming
    }

    return () => {
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, [isHost]);

  // Send audio stream to parent when playing
  useEffect(() => {
    if (onAudioStream && destinationRef.current) {
      if (isPlaying && currentTrack) {
        onAudioStream(destinationRef.current.stream);
      } else {
        onAudioStream(null);
      }
    }
  }, [isPlaying, currentTrack, onAudioStream]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("audio/")) {
        toast.error(`${file.name} is not an audio file`);
        return;
      }

      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      
      audio.addEventListener("loadedmetadata", () => {
        const newTrack: Track = {
          id: `${Date.now()}-${Math.random()}`,
          name: file.name.replace(/\.[^/.]+$/, ""),
          file,
          url,
          duration: audio.duration,
        };
        setTracks((prev) => [...prev, newTrack]);
      });
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const playTrack = (track: Track) => {
    if (audioRef.current) {
      if (currentTrack?.id === track.id) {
        // Toggle play/pause for same track
        if (isPlaying) {
          audioRef.current.pause();
          setIsPlaying(false);
        } else {
          audioRef.current.play();
          setIsPlaying(true);
        }
      } else {
        // Play new track
        audioRef.current.src = track.url;
        audioRef.current.play();
        setCurrentTrack(track);
        setIsPlaying(true);
      }
    }
  };

  const togglePlayPause = () => {
    if (!audioRef.current || !currentTrack) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const playNext = () => {
    if (!currentTrack || tracks.length === 0) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack.id);
    const nextIndex = (currentIndex + 1) % tracks.length;
    playTrack(tracks[nextIndex]);
  };

  const playPrevious = () => {
    if (!currentTrack || tracks.length === 0) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack.id);
    const prevIndex = currentIndex === 0 ? tracks.length - 1 : currentIndex - 1;
    playTrack(tracks[prevIndex]);
  };

  const removeTrack = (trackId: string) => {
    if (currentTrack?.id === trackId) {
      audioRef.current?.pause();
      setCurrentTrack(null);
      setIsPlaying(false);
    }
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0]);
    if (audioRef.current) {
      audioRef.current.volume = value[0] / 100;
    }
    if (value[0] > 0) setIsMuted(false);
  };

  const toggleMute = () => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.volume = volume / 100;
        setIsMuted(false);
      } else {
        audioRef.current.volume = 0;
        setIsMuted(true);
      }
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleEnded = () => {
    playNext();
  };

  return (
    <>
      {/* Audio element lives OUTSIDE AnimatePresence so it persists when panel closes */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25 }}
              className="absolute bottom-0 left-0 right-0 bg-gradient-to-b from-background to-background/95 rounded-t-3xl max-h-[80vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Music className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-bold">Music Player</h2>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Current Track & Controls */}
              {currentTrack && (
                <div className="p-4 bg-gradient-to-r from-primary/10 to-purple-500/10 border-b border-border/50">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
                      <Music className="w-8 h-8 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{currentTrack.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <Slider
                    value={[currentTime]}
                    max={duration || 100}
                    step={0.1}
                    onValueChange={handleSeek}
                    className="mb-4"
                  />

                  {/* Controls */}
                  <div className="flex items-center justify-center gap-4">
                    <Button variant="ghost" size="icon" onClick={playPrevious}>
                      <SkipBack className="w-5 h-5" />
                    </Button>
                    <Button
                      size="icon"
                      className="w-14 h-14 rounded-full bg-gradient-to-r from-primary to-purple-500"
                      onClick={togglePlayPause}
                    >
                      {isPlaying ? (
                        <Pause className="w-6 h-6 text-white" />
                      ) : (
                        <Play className="w-6 h-6 text-white ml-1" />
                      )}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={playNext}>
                      <SkipForward className="w-5 h-5" />
                    </Button>
                  </div>

                  {/* Volume */}
                  <div className="flex items-center gap-3 mt-4">
                    <Button variant="ghost" size="icon" onClick={toggleMute}>
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
              )}

              {/* Add Music Button */}
              {isHost && (
                <div className="p-4 border-b border-border/50">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full bg-gradient-to-r from-primary to-purple-500"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Add Music from Phone
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
              )}

              {/* Track List */}
              <ScrollArea className="h-[300px]">
                {tracks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                    <Music className="w-12 h-12 mb-2 opacity-50" />
                    <p>No music added</p>
                    {isHost && (
                      <p className="text-sm">Click the button above to add music</p>
                    )}
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {tracks.map((track, index) => (
                      <motion.div
                        key={track.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`flex items-center gap-3 p-3 rounded-xl transition-colors cursor-pointer ${
                          currentTrack?.id === track.id
                            ? "bg-primary/20"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => playTrack(track)}
                      >
                        {/* Track Number / Play Icon */}
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                          {currentTrack?.id === track.id && isPlaying ? (
                            <div className="flex items-center gap-0.5">
                              <span className="w-0.5 h-3 bg-primary rounded-full animate-pulse" />
                              <span className="w-0.5 h-4 bg-primary rounded-full animate-pulse delay-75" />
                              <span className="w-0.5 h-2 bg-primary rounded-full animate-pulse delay-150" />
                            </div>
                          ) : (
                            <span className="text-xs font-medium text-muted-foreground">
                              {index + 1}
                            </span>
                          )}
                        </div>

                        {/* Track Info */}
                        <div className="flex-1 min-w-0">
                          <p
                            className={`font-medium truncate text-sm ${
                              currentTrack?.id === track.id ? "text-primary" : ""
                            }`}
                          >
                            {track.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTime(track.duration)}
                          </p>
                        </div>

                        {/* Delete Button */}
                        {isHost && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-8 h-8 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeTrack(track.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
