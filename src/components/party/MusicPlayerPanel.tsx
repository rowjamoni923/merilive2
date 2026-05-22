import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Music, Heart, Loader2, Upload, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getProxiedUrl } from "@/utils/r2ProxyUrl";

interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  cover_image_url?: string;
  duration_seconds?: number;
  category?: string;
  isLocal?: boolean; // Host uploaded music
}

interface MusicPlayerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  isHost: boolean;
  roomType?: 'party' | 'live';
}

export function MusicPlayerPanel({
  isOpen,
  onClose,
  roomId,
  isHost,
  roomType = 'party'
}: MusicPlayerPanelProps) {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [localTracks, setLocalTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [volume, setVolume] = useState([70]);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Combined tracks (admin library + host uploads)
  const allTracks = [...localTracks, ...tracks];

  useEffect(() => {
    if (!isOpen) return;
    fetchMusicTracks();
    const cleanup = subscribeToMusicSync();
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [isOpen, roomId]);


  useEffect(() => {
    // Create audio element
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
      audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
      audioRef.current.addEventListener('ended', handleTrackEnd);
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
        audioRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audioRef.current.removeEventListener('ended', handleTrackEnd);
      }
    };
  }, []);

  // Update volume when changed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume[0] / 100;
    }
  }, [volume, isMuted]);

  // Pkg81 LiveKit-Purist audit: REMOVED `music-sync-${roomId}` Supabase
  // postgres_changes channel on party_rooms / live_streams. Host->viewer
  // music sync now uses a low-frequency REST poll (15s) — music switches
  // are rare and viewers tolerate a few seconds of drift. Zero Realtime
  // subscriptions, satisfies LiveKit-Purist + $1400-rule (≥5s G1).
  const subscribeToMusicSync = () => {
    if (isHost) return () => {}; // host is the sender, no need to sync

    const table = roomType === 'party' ? 'party_rooms' : 'live_streams';

    const pull = async () => {
      try {
        const { data } = await supabase
          .from(table as any)
          .select('current_music_url, current_music_title, music_playing, music_started_at')
          .eq('id', roomId)
          .maybeSingle();
        if (!data) return;
        const d: any = data;
        if (d.current_music_url) {
          syncToHostMusic(d.current_music_url, d.current_music_title, d.music_playing, d.music_started_at);
        }
      } catch (err) {
        console.error('[MusicPlayerPanel] music sync pull failed:', err);
      }
    };

    pull();
    // guard-ok: 15s ≥ 5s floor, bounded single poll, no realtime channel
    const id = window.setInterval(pull, 15000);
    return () => window.clearInterval(id);
  };


  // Sync visitor's playback to host's music
  const syncToHostMusic = (url: string, title: string, playing: boolean, startedAt: string) => {
    if (!audioRef.current) return;

    // If URL changed, load new track
    if (audioRef.current.src !== url) {
      audioRef.current.src = url;
      setCurrentTrack({
        id: 'host-music',
        title: title || 'Host Music',
        artist: 'Host',
        audio_url: url,
        isLocal: true
      });
    }

    // Sync play/pause state
    if (playing && audioRef.current.paused) {
      // Calculate current position based on when it started
      if (startedAt) {
        const startTime = new Date(startedAt).getTime();
        const now = Date.now();
        const elapsedSeconds = (now - startTime) / 1000;
        audioRef.current.currentTime = elapsedSeconds;
      }
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    } else if (!playing && !audioRef.current.paused) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Fetch initial music state for visitors
  const fetchCurrentMusicState = async () => {
    if (isHost) return;

    const table = roomType === 'party' ? 'party_rooms' : 'live_streams';
    const { data, error } = await supabase
      .from(table)
      .select('current_music_url, current_music_title, music_playing, music_started_at')
      .eq('id', roomId)
      .single();

    if (!error && data?.current_music_url && data?.music_playing) {
      syncToHostMusic(
        data.current_music_url,
        data.current_music_title,
        data.music_playing,
        data.music_started_at
      );
    }
  };

  const fetchMusicTracks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_music_library')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      
      const formattedTracks: MusicTrack[] = (data || []).map(t => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        audio_url: t.audio_url,
        cover_image_url: t.cover_image_url,
        duration_seconds: t.duration_seconds,
        category: t.category
      }));
      
      setTracks(formattedTracks);
      
      // For visitors, fetch current music state
      if (!isHost) {
        await fetchCurrentMusicState();
      }
    } catch (error) {
      console.error('Error fetching music:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleTrackEnd = () => {
    // Auto play next track
    playNext();
  };

  // Handle file upload from phone
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('audio/')) {
      toast.error('Please select an audio file');
      return;
    }

    // Validate file size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      toast.error('File size must be under 20MB');
      return;
    }

    setIsUploading(true);

    try {
      // Create object URL for local playback
      const objectUrl = URL.createObjectURL(file);
      
      // Extract filename without extension as title
      const title = file.name.replace(/\.[^/.]+$/, '');
      
      // Create local track
      const newTrack: MusicTrack = {
        id: `local-${Date.now()}`,
        title: title,
        artist: 'My Music',
        audio_url: objectUrl,
        isLocal: true
      };

      setLocalTracks(prev => [...prev, newTrack]);
      toast.success(`Added: ${title}`);
      
      // Auto-select and play if no track selected
      if (!currentTrack) {
        setCurrentTrack(newTrack);
      }
    } catch (error) {
      console.error('Error uploading music:', error);
      toast.error('Failed to add music');
    } finally {
      setIsUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Remove local track
  const removeLocalTrack = (trackId: string) => {
    const track = localTracks.find(t => t.id === trackId);
    if (track?.audio_url) {
      URL.revokeObjectURL(track.audio_url);
    }
    setLocalTracks(prev => prev.filter(t => t.id !== trackId));
    
    // If removed track was playing, stop
    if (currentTrack?.id === trackId) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setCurrentTrack(null);
      setIsPlaying(false);
    }
  };

  const togglePlay = useCallback(async () => {
    if (!currentTrack || !audioRef.current) return;

    const table = roomType === 'party' ? 'party_rooms' : 'live_streams';

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      
      // Update room status (host only)
      if (isHost) {
        await supabase
          .from(table)
          .update({ music_playing: false } as any)
          .eq('id', roomId);
      }
    } else {
      // Load new source if needed
      const audioUrl = currentTrack.isLocal ? currentTrack.audio_url : getProxiedUrl(currentTrack.audio_url);
      if (audioRef.current.src !== audioUrl) {
        audioRef.current.src = audioUrl;
      }
      
      try {
        await audioRef.current.play();
        setIsPlaying(true);
        
        // Update room status for sync (host only)
        if (isHost) {
          await supabase
            .from(table)
            .update({ 
              current_music_url: audioUrl,
              current_music_title: currentTrack.title,
              music_playing: true,
              music_started_at: new Date().toISOString()
            } as any)
            .eq('id', roomId);
        }
      } catch (error) {
        console.error('Error playing audio:', error);
        toast.error("Failed to play music");
      }
    }
  }, [currentTrack, isPlaying, roomId, isHost, roomType]);

  const selectTrack = async (track: MusicTrack) => {
    setCurrentTrack(track);
    setProgress(0);
    
    if (audioRef.current) {
      const audioUrl = track.isLocal ? track.audio_url : getProxiedUrl(track.audio_url);
      audioRef.current.src = audioUrl;
      
      if (isPlaying) {
        try {
          await audioRef.current.play();
          
          // Update room status for sync (host only)
          if (isHost) {
            const table = roomType === 'party' ? 'party_rooms' : 'live_streams';
            await supabase
              .from(table)
              .update({ 
                current_music_url: audioUrl,
                current_music_title: track.title,
                music_started_at: new Date().toISOString()
              } as any)
              .eq('id', roomId);
          }
        } catch (error) {
          console.error('Error playing audio:', error);
        }
      }
    }
  };

  const playNext = () => {
    if (!currentTrack || allTracks.length === 0) return;
    
    const currentIndex = allTracks.findIndex(t => t.id === currentTrack.id);
    const nextIndex = (currentIndex + 1) % allTracks.length;
    selectTrack(allTracks[nextIndex]);
  };

  const playPrevious = () => {
    if (!currentTrack || allTracks.length === 0) return;
    
    const currentIndex = allTracks.findIndex(t => t.id === currentTrack.id);
    const prevIndex = currentIndex === 0 ? allTracks.length - 1 : currentIndex - 1;
    selectTrack(allTracks[prevIndex]);
  };

  const toggleFavorite = (trackId: string) => {
    setFavorites(prev =>
      prev.includes(trackId)
        ? prev.filter(id => id !== trackId)
        : [...prev, trackId]
    );
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setProgress(value[0]);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl overflow-hidden max-h-[80vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                  <Music className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Room Music</h3>
                  <p className="text-xs text-gray-500">
                    {isHost ? 'Add music for everyone' : 'Background music for everyone'}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Host: Add Music Button */}
            {isHost && (
              <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-pink-50">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-semibold shadow-lg shadow-purple-500/30 disabled:opacity-50"
                >
                  {isUploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Plus className="w-5 h-5" />
                  )}
                  <span>Add Music from Phone</span>
                </motion.button>
                <p className="text-xs text-center text-gray-500 mt-2">
                  MP3, M4A, WAV • Max 20MB • Everyone will hear it
                </p>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
              </div>
            ) : allTracks.length === 0 ? (
              <div className="p-8 text-center">
                <Music className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No music available</p>
                <p className="text-xs text-gray-400 mt-1">
                  {isHost ? 'Add music from your phone' : 'Host will add music soon'}
                </p>
              </div>
            ) : (
              <>
                {/* Current Track Player */}
                <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50">
                  <div className="flex items-center gap-4">
                    {/* Album Art */}
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center overflow-hidden shadow-lg">
                      {currentTrack?.cover_image_url ? (
                        <img
                          src={getProxiedUrl(currentTrack.cover_image_url)}
                          alt={currentTrack.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music className="w-8 h-8 text-white" />
                      )}
                    </div>

                    {/* Track Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-gray-900 truncate">
                        {currentTrack?.title || 'No track selected'}
                      </h4>
                      <p className="text-sm text-gray-500 truncate">
                        {currentTrack?.artist || '-'}
                      </p>
                      {currentTrack?.isLocal && (
                        <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full font-medium">
                          My Music
                        </span>
                      )}
                    </div>

                    {/* Favorite */}
                    {currentTrack && !currentTrack.isLocal && (
                      <button
                        onClick={() => toggleFavorite(currentTrack.id)}
                        className="p-2"
                      >
                        <Heart className={cn(
                          "w-6 h-6 transition-colors",
                          favorites.includes(currentTrack.id)
                            ? "text-red-500 fill-red-500"
                            : "text-gray-400"
                        )} />
                      </button>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="mt-4">
                    <Slider
                      value={[progress]}
                      onValueChange={handleSeek}
                      max={duration || 100}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>{formatTime(progress)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center justify-center gap-6 mt-4">
                    <button
                      onClick={playPrevious}
                      className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      <SkipBack className="w-6 h-6" />
                    </button>
                    <button
                      onClick={togglePlay}
                      disabled={!currentTrack}
                      className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-purple-500/30 disabled:opacity-50"
                    >
                      {isPlaying ? (
                        <Pause className="w-7 h-7" />
                      ) : (
                        <Play className="w-7 h-7 ml-1" />
                      )}
                    </button>
                    <button
                      onClick={playNext}
                      className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      <SkipForward className="w-6 h-6" />
                    </button>
                  </div>

                  {/* Volume */}
                  <div className="flex items-center gap-3 mt-4">
                    <button onClick={() => setIsMuted(!isMuted)}>
                      {isMuted ? (
                        <VolumeX className="w-5 h-5 text-gray-500" />
                      ) : (
                        <Volume2 className="w-5 h-5 text-gray-500" />
                      )}
                    </button>
                    <Slider
                      value={volume}
                      onValueChange={setVolume}
                      max={100}
                      step={1}
                      className="flex-1"
                    />
                  </div>
                </div>

                {/* Track List */}
                <div className="overflow-y-auto max-h-[35vh] pb-safe">
                  {/* My Music Section (Host uploads) */}
                  {localTracks.length > 0 && (
                    <div className="p-2">
                      <h4 className="px-2 py-2 text-sm font-semibold text-purple-600 flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        My Music ({localTracks.length})
                      </h4>
                      {localTracks.map((track, index) => (
                        <motion.div
                          key={track.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl transition-colors",
                            currentTrack?.id === track.id
                              ? "bg-purple-100"
                              : "hover:bg-gray-50"
                          )}
                        >
                          <button
                            onClick={() => selectTrack(track)}
                            className="flex-1 flex items-center gap-3"
                          >
                            {/* Icon */}
                            <div className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center",
                              currentTrack?.id === track.id
                                ? "bg-purple-500 text-white"
                                : "bg-purple-100 text-purple-500"
                            )}>
                              {currentTrack?.id === track.id && isPlaying ? (
                                <motion.div
                                  animate={{ scale: [1, 1.2, 1] }}
                                  transition={{ duration: 1, repeat: Infinity }}
                                >
                                  <Music className="w-5 h-5" />
                                </motion.div>
                              ) : (
                                <Music className="w-5 h-5" />
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 text-left min-w-0">
                              <h5 className={cn(
                                "font-medium truncate",
                                currentTrack?.id === track.id ? "text-purple-700" : "text-gray-900"
                              )}>
                                {track.title}
                              </h5>
                              <p className="text-sm text-gray-500 truncate">{track.artist}</p>
                            </div>
                          </button>

                          {/* Delete button (host only) */}
                          {isHost && (
                            <button
                              onClick={() => removeLocalTrack(track.id)}
                              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {/* Library Section */}
                  {tracks.length > 0 && (
                    <div className="p-2">
                      <h4 className="px-2 py-2 text-sm font-semibold text-gray-500">
                        Music Library ({tracks.length})
                      </h4>
                      {tracks.map((track, index) => (
                        <motion.button
                          key={track.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => selectTrack(track)}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-xl transition-colors",
                            currentTrack?.id === track.id
                              ? "bg-purple-100"
                              : "hover:bg-gray-50"
                          )}
                        >
                          {/* Icon */}
                          <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden",
                            currentTrack?.id === track.id
                              ? "bg-purple-500 text-white"
                              : "bg-gray-100 text-gray-500"
                          )}>
                            {track.cover_image_url ? (
                              <img
                                src={getProxiedUrl(track.cover_image_url)}
                                alt={track.title}
                                className="w-full h-full object-cover"
                              />
                            ) : currentTrack?.id === track.id && isPlaying ? (
                              <motion.div
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 1, repeat: Infinity }}
                              >
                                <Music className="w-5 h-5" />
                              </motion.div>
                            ) : (
                              <Music className="w-5 h-5" />
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 text-left min-w-0">
                            <h5 className={cn(
                              "font-medium truncate",
                              currentTrack?.id === track.id ? "text-purple-700" : "text-gray-900"
                            )}>
                              {track.title}
                            </h5>
                            <p className="text-sm text-gray-500 truncate">{track.artist}</p>
                          </div>

                          {/* Duration */}
                          <span className="text-sm text-gray-400">
                            {track.duration_seconds
                              ? formatTime(track.duration_seconds)
                              : '--:--'}
                          </span>
                        </motion.button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default MusicPlayerPanel;
