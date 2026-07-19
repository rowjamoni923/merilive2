import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { X, Users, Gem, ChevronLeft, Volume2, MessageSquare, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LiveGameBoard } from "@/components/games/LiveGameBoard";

interface PlayerInfo {
  id: string;
  displayName: string;
  avatarUrl?: string;
  level: number;
  countryFlag?: string;
  betAmount?: number;
  isWinner?: boolean;
}

interface ProfessionalGameOverlayProps {
  gameId: string;
  gameName: string;
  gameEmoji: string;
  gameColor: string;
  roomId?: string;
  players?: PlayerInfo[];
  totalPool?: number;
  roundNumber?: number;
  onClose: () => void;
  onOpenChat?: () => void;
  onOpenGifts?: () => void;
}

// Leaderboard Card Component
const LeaderboardCard = ({ player, rank }: { player: PlayerInfo; rank: number }) => {
  const getRankBadge = () => {
    if (rank === 1) return { bg: "from-yellow-400 to-amber-500", icon: "🥇" };
    if (rank === 2) return { bg: "from-gray-300 to-gray-400", icon: "🥈" };
    if (rank === 3) return { bg: "from-orange-400 to-amber-600", icon: "🥉" };
    return { bg: "from-slate-500 to-slate-600", icon: `${rank}` };
  };
  
  const badge = getRankBadge();
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.05 }}
      className={cn(
        "flex items-center gap-2 p-2 rounded-xl transition-all",
        rank <= 3 
          ? "bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/30"
          : "bg-white/5 border border-white/10"
      )}
    >
      {/* Rank Badge */}
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm",
        `bg-gradient-to-br ${badge.bg}`
      )}>
        {rank <= 3 ? badge.icon : rank}
      </div>
      
      {/* Avatar with frame */}
      <div className="relative">
        <div className={cn(
          "absolute inset-0 rounded-full",
          rank === 1 && "ring-2 ring-yellow-400 ring-offset-2 ring-offset-transparent animate-pulse"
        )} />
        <Avatar className="w-10 h-10 border-2 border-white/30">
          <AvatarImage src={player.avatarUrl} />
          <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-sm">
            {player.displayName?.charAt(0) || 'U'}
          </AvatarFallback>
        </Avatar>
        {/* Level Badge */}
        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-[8px] font-bold text-white border border-white/50">
          {player.level}
        </div>
      </div>
      
      {/* Player Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          {player.countryFlag && <span className="text-sm">{player.countryFlag}</span>}
          <span className="text-white font-medium text-sm truncate">{player.displayName}</span>
        </div>
        {player.betAmount && (
          <div className="flex items-center gap-1 text-amber-400 text-xs">
            <Gem className="w-3 h-3" />
            <span>{player.betAmount.toLocaleString()}</span>
          </div>
        )}
      </div>
      
      {/* Winner indicator */}
      {player.isWinner && (
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ repeat: Infinity, duration: 0.5 }}
        >
          <Trophy className="w-5 h-5 text-yellow-400" />
        </motion.div>
      )}
    </motion.div>
  );
};

export function ProfessionalGameOverlay({
  gameId,
  gameName,
  gameEmoji,
  gameColor,
  roomId,
  players = [],
  totalPool = 0,
  roundNumber = 0,
  onClose,
  onOpenChat,
  onOpenGifts,
}: ProfessionalGameOverlayProps) {
  
  // Top 10 players for display
  const topPlayers = players.slice(0, 10);
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: "linear-gradient(180deg, #1a0a2e 0%, #0d0015 50%, #1a0a2e 100%)"
      }}
    >
      {/* Animated Background - pointer-events-none */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Decorative bunting/flags - Smaller */}
        <div className="absolute top-12 left-0 right-0 h-5 flex justify-center gap-0.5 opacity-60">
          {Array.from({ length: 25 }).map((_, i) => (
            <motion.div
              key={i}
              className={cn(
                "w-3 h-4 rounded-b-sm",
                i % 4 === 0 && "bg-red-500",
                i % 4 === 1 && "bg-yellow-500",
                i % 4 === 2 && "bg-green-500",
                i % 4 === 3 && "bg-blue-500"
              )}
              animate={{ rotateZ: [1, -1, 1] }}
              transition={{ repeat: Infinity, duration: 2, delay: i * 0.05 }}
            />
          ))}
        </div>
      </div>
      
      {/* Compact Header */}
      <div className="relative z-10 safe-area-top">
        <div className="flex items-center justify-between px-2 py-1.5">
          {/* Back & Room Info */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-black/40 text-white hover:bg-black/60"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            <div className="flex items-center gap-1.5 px-2 py-1 bg-gradient-to-r from-purple-600/50 to-pink-600/50 rounded-full border border-purple-400/30">
              <span className="text-sm">{gameEmoji}</span>
              <span className="text-white font-bold text-xs">{gameName}</span>
              <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-[9px] px-1 py-0">
                <Gem className="w-2.5 h-2.5 mr-0.5" />
                {(totalPool / 1000).toFixed(1)}K
              </Badge>
            </div>
          </div>
          
          {/* Viewers Count */}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-black/40 rounded-full">
            <Users className="w-3 h-3 text-orange-400" />
            <span className="text-white font-bold text-xs">{players.length}</span>
          </div>
        </div>
      </div>
      
      {/* Players Grid at Top - 2 Rows of 5 Compact */}
      <div className="relative z-10 px-2 py-1">
        <div className="grid grid-cols-5 gap-1.5">
          {topPlayers.map((player, index) => (
            <motion.div
              key={player.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.03 }}
              className="relative"
            >
              {/* Rank number */}
              <div className="absolute -top-0.5 -left-0.5 z-10 w-4 h-4 bg-gradient-to-br from-slate-700 to-slate-900 rounded-md flex items-center justify-center text-white text-[8px] font-bold border border-slate-500/50">
                {index + 1}
              </div>
              
              {/* Bet badge */}
              <div className="absolute -top-0.5 -right-0.5 z-10 flex items-center gap-0.5 px-1 py-0.5 bg-amber-500/90 rounded-md text-[7px] font-bold text-black">
                <Gem className="w-2 h-2" />
                {((player.betAmount || 0) / 1000).toFixed(1)}K
              </div>
              
              {/* Avatar with frame */}
              <div className={cn(
                "aspect-square rounded-lg overflow-hidden border-2 flex items-center justify-center bg-gradient-to-b from-slate-700 to-slate-900",
                index < 3 
                  ? "border-yellow-400" 
                  : "border-slate-600"
              )}>
                <Avatar className={cn(
                  "w-8 h-8 border",
                  index < 3 ? "border-yellow-400" : "border-slate-500"
                )}>
                  <AvatarImage src={player.avatarUrl} />
                  <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-[10px]">
                    {player.displayName?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              </div>
              
              {/* Player name */}
              <div className="flex items-center justify-center gap-0.5 mt-0.5">
                {player.countryFlag && <span className="text-[8px]">{player.countryFlag}</span>}
                <span className="text-white text-[8px] font-medium truncate max-w-[40px]">
                  {player.displayName?.slice(0, 5)}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      
      {/* Chat & Close Buttons - Floating */}
      <div className="absolute right-1.5 top-1/3 flex flex-col gap-1.5 z-20">
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenChat}
          className="w-7 h-7 rounded-lg bg-slate-800/80 text-white hover:bg-slate-700 border border-slate-600/50"
        >
          <MessageSquare className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-slate-800/80 text-white hover:bg-slate-700 border border-slate-600/50"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      
      {/* Game Board at Bottom - Main Interactive Area */}
      <div className="flex-1 px-2 pb-2 overflow-y-auto relative z-30 pointer-events-auto mt-auto">
        <LiveGameBoard 
          selectedGame={gameId} 
          roomId={roomId}
          onClose={onClose}
          onOpenGifts={onOpenGifts}
        />
      </div>
    </motion.div>
  );
}

export default ProfessionalGameOverlay;
