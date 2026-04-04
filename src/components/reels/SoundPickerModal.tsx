import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Music,
  TrendingUp,
  Play,
  Pause,
  Check,
  X,
  Disc3,
  Sparkles,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Sound {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  cover_image_url?: string;
  duration_seconds: number;
  genre?: string;
  use_count?: number;
  is_trending?: boolean;
  category?: string;
}

interface SoundPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSound: (sound: Sound | null) => void;
  selectedSound?: Sound | null;
}

const tabs = [
  { id: "trending", label: "Trending", icon: TrendingUp },
  { id: "music", label: "Music", icon: Music },
  { id: "recent", label: "Recent", icon: Clock },
];

export const SoundPickerModal = ({
  isOpen,
  onClose,
  onSelectSound,
  selectedSound,
}: SoundPickerModalProps) => {
  const [activeTab, setActiveTab] = useState("trending");
  const [searchQuery, setSearchQuery] = useState("");
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchSounds();
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [isOpen, activeTab]);

  const fetchSounds = async () => {
    setLoading(true);
    try {
      // Fetch from admin music library
      let query = supabase
        .from("admin_music_library")
        .select("*")
        .eq("is_active", true);

      if (activeTab === "trending") {
        query = query.order("display_order", { ascending: true }).limit(20);
      } else if (activeTab === "music") {
        query = query.eq("category", "music").order("created_at", { ascending: false });
      } else {
        query = query.order("created_at", { ascending: false }).limit(20);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSounds(data || []);
    } catch (error) {
      console.error("Error fetching sounds:", error);
      // Use sample data if no sounds in database
      setSounds([
        { id: "1", title: "Trending Beat", artist: "DJ Mix", audio_url: "", duration_seconds: 30, is_trending: true },
        { id: "2", title: "Chill Vibes", artist: "LoFi Studio", audio_url: "", duration_seconds: 45, category: "music" },
        { id: "3", title: "Dance Pop", artist: "Pop Stars", audio_url: "", duration_seconds: 60, is_trending: true },
      ]);
    }
    setLoading(false);
  };

  const togglePlay = (sound: Sound) => {
    if (playingId === sound.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (sound.audio_url) {
        audioRef.current = new Audio(sound.audio_url);
        audioRef.current.play();
        audioRef.current.onended = () => setPlayingId(null);
      }
      setPlayingId(sound.id);
    }
  };

  const handleSelect = (sound: Sound) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    onSelectSound(sound);
    onClose();
  };

  const handleOriginalSound = () => {
    onSelectSound(null);
    onClose();
  };

  const filteredSounds = sounds.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="absolute bottom-0 left-0 right-0 bg-gradient-to-b from-zinc-900 to-black rounded-t-3xl max-h-[85vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-zinc-900/95 backdrop-blur-xl z-10 px-4 pt-4 pb-3 border-b border-white/10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Add Sound</h2>
              <Button
                size="icon"
                variant="ghost"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/10"
              >
                <X className="w-4 h-4 text-white" />
              </Button>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sounds..."
                className="pl-10 bg-white/10 border-0 text-white placeholder:text-white/40 rounded-full h-10"
              />
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all",
                    activeTab === tab.id
                      ? "bg-white text-black"
                      : "bg-white/10 text-white/70 hover:bg-white/20"
                  )}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Original Sound Option */}
          <div className="px-4 py-3 border-b border-white/10">
            <button
              onClick={handleOriginalSound}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl transition-all",
                !selectedSound
                  ? "bg-gradient-to-r from-pink-500/20 to-purple-500/20 border border-pink-500/50"
                  : "bg-white/5 hover:bg-white/10"
              )}
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-white">Original Sound</p>
                <p className="text-xs text-white/50">Use audio from your video</p>
              </div>
              {!selectedSound && (
                <div className="w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}
            </button>
          </div>

          {/* Sound List */}
          <ScrollArea className="h-[50vh]">
            <div className="px-4 py-3 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filteredSounds.length === 0 ? (
                <div className="text-center py-12 text-white/50">
                  <Music className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No sounds found</p>
                </div>
              ) : (
                filteredSounds.map((sound) => (
                  <motion.div
                    key={sound.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl transition-all",
                      selectedSound?.id === sound.id
                        ? "bg-gradient-to-r from-pink-500/20 to-purple-500/20 border border-pink-500/50"
                        : "bg-white/5 hover:bg-white/10"
                    )}
                  >
                    {/* Cover / Play Button */}
                    <button
                      onClick={() => togglePlay(sound)}
                      className="relative w-12 h-12 rounded-xl overflow-hidden bg-gradient-to-br from-purple-600 to-pink-500 flex-shrink-0"
                    >
                      {sound.cover_image_url ? (
                        <img
                          src={sound.cover_image_url}
                          alt={sound.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Disc3
                            className={cn(
                              "w-6 h-6 text-white",
                              playingId === sound.id && "animate-spin"
                            )}
                          />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        {playingId === sound.id ? (
                          <Pause className="w-5 h-5 text-white" fill="white" />
                        ) : (
                          <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                        )}
                      </div>
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-white truncate">{sound.title}</p>
                        {sound.is_trending && (
                          <span className="px-1.5 py-0.5 bg-pink-500/20 rounded text-[10px] text-pink-400">
                            🔥 Trending
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-white/50">
                        <span>{sound.artist}</span>
                        <span>•</span>
                        <span>{formatDuration(sound.duration_seconds)}</span>
                        {sound.use_count !== undefined && sound.use_count > 0 && (
                          <>
                            <span>•</span>
                            <span>{sound.use_count.toLocaleString()} uses</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Select Button */}
                    <Button
                      size="sm"
                      onClick={() => handleSelect(sound)}
                      className={cn(
                        "rounded-full px-4",
                        selectedSound?.id === sound.id
                          ? "bg-pink-500 text-white"
                          : "bg-white/10 text-white hover:bg-white/20"
                      )}
                    >
                      {selectedSound?.id === sound.id ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        "Use"
                      )}
                    </Button>
                  </motion.div>
                ))
              )}
            </div>
          </ScrollArea>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SoundPickerModal;
