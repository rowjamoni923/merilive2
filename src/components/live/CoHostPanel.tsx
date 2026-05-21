import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Check, X, Users, Crown, Eye, EyeOff, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { CoHostRequest } from '@/hooks/useLiveKitClient';

interface CoHostPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
  coHostRequests: CoHostRequest[];
  coHosts: Set<number>;
  remoteUsers: Map<number, any>;
  onAcceptRequest: (uid: number) => void;
  onDeclineRequest: (uid: number) => void;
  onRequestCoHost: () => void;
  currentRole: 'host' | 'audience';
  isRequestPending?: boolean;
}

export function CoHostPanel({
  isOpen,
  onClose,
  isHost,
  coHostRequests,
  coHosts,
  remoteUsers,
  onAcceptRequest,
  onDeclineRequest,
  onRequestCoHost,
  currentRole,
  isRequestPending = false,
}: CoHostPanelProps) {
  const [activeTab, setActiveTab] = useState<'requests' | 'cohosts'>('requests');

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className="absolute bottom-0 left-0 right-0 bg-black/95 backdrop-blur-xl rounded-t-3xl overflow-hidden z-50"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <h3 className="text-white font-semibold">Co-Host Management</h3>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs (for host only) */}
          {isHost && (
            <div className="flex border-b border-white/10">
              <button
                onClick={() => setActiveTab('requests')}
                className={cn(
                  "flex-1 py-3 text-sm font-medium relative",
                  activeTab === 'requests' ? "text-primary" : "text-white/60"
                )}
              >
                Requests
                {coHostRequests.length > 0 && (
                  <Badge className="absolute top-2 right-1/4 h-5 w-5 p-0 flex items-center justify-center bg-red-500 text-white text-xs">
                    {coHostRequests.length}
                  </Badge>
                )}
              </button>
              <button
                onClick={() => setActiveTab('cohosts')}
                className={cn(
                  "flex-1 py-3 text-sm font-medium",
                  activeTab === 'cohosts' ? "text-primary" : "text-white/60"
                )}
              >
                Co-Hosts ({coHosts.size})
              </button>
            </div>
          )}

          <div className="p-4">
            {/* For viewers - request to join button */}
            {!isHost && (
              <div className="text-center py-8">
                {currentRole === 'host' ? (
                  <div className="space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
                      <Crown className="w-8 h-8 text-green-500" />
                    </div>
                    <p className="text-white font-medium">You are now Co-Host!</p>
                    <p className="text-white/60 text-sm">Everyone can see your video</p>
                  </div>
                ) : isRequestPending ? (
                  <div className="space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      >
                        <UserPlus className="w-8 h-8 text-amber-500" />
                      </motion.div>
                    </div>
                    <p className="text-white font-medium">Request Pending...</p>
                    <p className="text-white/60 text-sm">Host is reviewing your request</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-white/70 mb-4">
                      Want to join the live? Send a request to the host!
                    </p>
                    <Button
                      onClick={onRequestCoHost}
                      className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      Request to Co-Host
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* For host - show requests */}
            {isHost && activeTab === 'requests' && (
              <ScrollArea className="h-64">
                {coHostRequests.length === 0 ? (
                  <div className="text-center py-8 text-white/70">
                    No requests yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {coHostRequests.map((request) => (
                      <motion.div
                        key={request.uid}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between p-3 bg-white/5 rounded-xl"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback className="bg-primary/30">
                              {request.userName.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-white font-medium">{request.userName}</p>
                            <p className="text-white/70 text-xs">
                              {new Date(request.timestamp).toLocaleTimeString('bn-BD')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => onAcceptRequest(request.uid)}
                            className="bg-green-500 hover:bg-green-600 h-8 w-8 p-0 rounded-full"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onDeclineRequest(request.uid)}
                            className="bg-red-500/20 hover:bg-red-500/30 text-red-400 h-8 w-8 p-0 rounded-full"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            )}

            {/* For host - show active co-hosts */}
            {isHost && activeTab === 'cohosts' && (
              <ScrollArea className="h-64">
                {coHosts.size === 0 ? (
                  <div className="text-center py-8 text-white/70">
                    No Co-Hosts
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Array.from(coHosts).map((uid) => {
                      const user = remoteUsers.get(uid);
                      return (
                        <div
                          key={uid}
                          className="flex items-center justify-between p-3 bg-white/5 rounded-xl"
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <Avatar>
                                <AvatarFallback className="bg-primary/30">
                                  {uid.toString().slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-black flex items-center justify-center">
                                <Crown className="w-2.5 h-2.5 text-white" />
                              </div>
                            </div>
                            <div>
                              <p className="text-white font-medium">Co-Host {uid}</p>
                              <Badge className="bg-green-500/20 text-green-400 text-xs">
                                Live
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {user?.hasVideo ? (
                              <Eye className="w-4 h-4 text-green-400" />
                            ) : (
                              <EyeOff className="w-4 h-4 text-red-400" />
                            )}
                            {user?.hasAudio ? (
                              <Mic className="w-4 h-4 text-green-400" />
                            ) : (
                              <MicOff className="w-4 h-4 text-red-400" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
