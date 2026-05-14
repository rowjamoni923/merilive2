import { useState, useEffect } from "react";
import { Star, X, Send, Clock, Gift, Phone, TrendingUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import FramedAvatar from "@/components/common/FramedAvatar";
import BeansIcon from "@/components/common/BeansIcon";

interface CallRatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  callId: string;
  remoteUserName: string;
  remoteUserAvatar: string | null;
  duration: number;
  coinsSpent: number;
  isHost: boolean;
}

interface CallEarnings {
  callBeans: number;
  giftBeans: number;
  totalBeans: number;
}

export function CallRatingModal({
  isOpen,
  onClose,
  callId,
  remoteUserName,
  remoteUserAvatar,
  duration,
  coinsSpent,
  isHost,
}: CallRatingModalProps) {
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [review, setReview] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRatingStep, setShowRatingStep] = useState(false);
  const [earnings, setEarnings] = useState<CallEarnings>({ callBeans: 0, giftBeans: 0, totalBeans: 0 });

  // Fetch call earnings for host
  useEffect(() => {
    const fetchCallEarnings = async () => {
      if (!callId || !isHost) return;
      
      try {
        // Fetch call details for host earnings
        const { data: callData } = await supabase
          .from('private_calls')
          .select('host_earned, host_id')
          .eq('id', callId)
          .single();
        
        const callBeans = callData?.host_earned || 0;
        
        // Fetch gifts received during call
        const { data: giftData } = await supabase
          .from('gift_transactions')
          .select('coin_amount')
          .eq('receiver_id', callData?.host_id)
          .gte('created_at', new Date(Date.now() - duration * 1000).toISOString());
        
        const giftBeans = giftData?.reduce((sum, g) => sum + (g.coin_amount || 0), 0) || 0;
        
        setEarnings({
          callBeans,
          giftBeans,
          totalBeans: callBeans + giftBeans
        });
        
        // For hosts: DO NOT auto-advance to rating step
        // They only see the earnings summary, no rating required
      } catch (error) {
        console.error('Error fetching call earnings:', error);
        // On error, still don't show rating for hosts
      }
    };
    
    if (isOpen) {
      if (isHost) {
        fetchCallEarnings();
      } else {
        setShowRatingStep(true);
      }
    }
  }, [isOpen, callId, isHost, duration]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      toast({
        title: "Rating Required",
        description: "Please select a rating",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const updateField = isHost ? 'caller_rating' : 'host_rating';
      const { error } = await supabase
        .from('private_calls')
        .update({ [updateField]: rating })
        .eq('id', callId);

      if (error) throw error;

      await supabase
        .from('call_events')
        .insert({
          call_id: callId,
          event_type: 'rating_submitted',
          event_data: {
            rating,
            review: review.trim() || null,
            rated_by: isHost ? 'host' : 'caller',
          },
        });

      toast({
        title: "Thank you! 🎉",
        description: "Your rating has been submitted",
      });
      onClose();
    } catch (error) {
      console.error('Error submitting rating:', error);
      toast({
        title: "Error",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const ratingLabels = ["", "Poor 😞", "Okay 😐", "Good 🙂", "Great 😊", "Excellent! 🤩"];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF] rounded-3xl p-6 w-full max-w-md border border-amber-200/60 relative overflow-hidden"
        >
          {/* Background Effects */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-1/4 w-32 h-32 bg-purple-500/20 rounded-full blur-[60px]" />
            <div className="absolute bottom-0 right-1/4 w-40 h-40 bg-pink-500/15 rounded-full blur-[80px]" />
          </div>
          
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-600 hover:text-slate-900 z-10"
          >
            <X className="w-5 h-5" />
          </button>

          {/* HOST EARNINGS SUMMARY (First Screen for Hosts) */}
          {isHost && !showRatingStep && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative z-10"
            >
              {/* Title */}
              <div className="text-center mb-6">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="inline-flex items-center gap-2 mb-3"
                >
                  <Sparkles className="w-6 h-6 text-amber-400" />
                  <h2 className="text-slate-800 text-2xl font-bold">Call Ended</h2>
                  <Sparkles className="w-6 h-6 text-amber-400" />
                </motion.div>
                <p className="text-slate-600 text-sm">Great job! Here's your earnings summary</p>
              </div>
              
              {/* User Avatar */}
              <div className="flex justify-center mb-6">
                <FramedAvatar
                  src={remoteUserAvatar}
                  name={remoteUserName}
                  level={15}
                  size="lg"
                  showAnimation={true}
                  showGlow={true}
                />
              </div>
              
              <p className="text-center text-slate-700 text-sm mb-4">
                Call with <span className="text-slate-800 font-semibold">{remoteUserName}</span>
              </p>
              
              {/* Stats Cards */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                {/* Duration */}
                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="bg-gradient-to-br from-blue-500/20 to-cyan-500/10 rounded-2xl p-4 border border-blue-500/30"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <span className="text-blue-200/80 text-xs">Duration</span>
                  </div>
                  <p className="text-slate-800 text-xl font-bold">{formatDuration(duration)}</p>
                </motion.div>
                
                {/* Total Beans */}
                <motion.div
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="bg-gradient-to-br from-orange-500/20 to-amber-500/10 rounded-2xl p-4 border border-orange-500/30"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-orange-400" />
                    <span className="text-orange-200/80 text-xs">Total Earned</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <BeansIcon size={28} />
                    <p className="text-slate-800 text-xl font-bold">{formatNumber(earnings.totalBeans)}</p>
                  </div>
                </motion.div>
              </div>
              
              {/* Earnings Breakdown */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="bg-white/5 rounded-2xl p-4 border border-amber-200/60 mb-6"
              >
                <h4 className="text-slate-600 text-xs font-medium mb-3 uppercase tracking-wider">Earnings Breakdown</h4>
                
                <div className="space-y-3">
                  {/* Call Earnings */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-500/20">
                        <Phone className="w-4 h-4 text-purple-400" />
                      </div>
                      <span className="text-slate-700 text-sm">Call Earnings</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <BeansIcon size={20} />
                      <span className="text-slate-800 font-bold">{formatNumber(earnings.callBeans)}</span>
                    </div>
                  </div>
                  
                  {/* Gift Earnings */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-pink-500/20">
                        <Gift className="w-4 h-4 text-pink-400" />
                      </div>
                      <span className="text-slate-700 text-sm">Gifts Received</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <BeansIcon size={20} />
                      <span className="text-slate-800 font-bold">{formatNumber(earnings.giftBeans)}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
              
              {/* Done Button for Host - closes the modal */}
              <Button
                onClick={onClose}
                className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-slate-800 font-semibold py-3"
              >
                Done
              </Button>
            </motion.div>
          )}

          {/* RATING STEP (Only for callers/users, NOT for hosts) */}
          {showRatingStep && !isHost && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative z-10"
            >
              {/* Header */}
              <div className="text-center mb-6">
                <h2 className="text-slate-800 text-xl font-bold mb-2">
                  {isHost ? "Rate Your Caller" : "Call Ended"}
                </h2>
                <p className="text-slate-600 text-sm">
                  {formatDuration(duration)} | 
                  {isHost ? ` Earned: ${formatNumber(earnings.totalBeans)} beans` : ` Spent: ${coinsSpent} diamonds`}
                </p>
              </div>

              {/* User Info */}
              <div className="flex flex-col items-center mb-6">
                <FramedAvatar
                  src={remoteUserAvatar}
                  name={remoteUserName}
                  level={15}
                  size="lg"
                  showAnimation={true}
                  showGlow={true}
                  className="mb-3"
                />
                <h3 className="text-slate-800 font-semibold text-lg">{remoteUserName}</h3>
                <p className="text-slate-600 text-sm">{isHost ? "Caller" : "Host"}</p>
              </div>

              {/* Rating Stars */}
              <div className="text-center mb-4">
                <p className="text-slate-700 text-sm mb-3">How was your experience?</p>
                <div className="flex justify-center gap-2 mb-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <motion.button
                      key={star}
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      onClick={() => setRating(star)}
                      className="p-1"
                    >
                      <Star
                        className={`w-10 h-10 transition-colors ${
                          star <= (hoveredRating || rating)
                            ? "text-yellow-400 fill-yellow-400"
                            : "text-gray-600"
                        }`}
                      />
                    </motion.button>
                  ))}
                </div>
                <motion.p
                  key={hoveredRating || rating}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-slate-800 text-lg font-medium h-6"
                >
                  {ratingLabels[hoveredRating || rating]}
                </motion.p>
              </div>

              {/* Review Text */}
              <div className="mb-6">
                <Textarea
                  value={review}
                  onChange={(e) => setReview(e.target.value)}
                  placeholder="Write your feedback (optional)..."
                  className="bg-white/5 border-amber-200/60 text-slate-800 placeholder:text-slate-500 resize-none"
                  rows={3}
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 border-amber-300/60 text-slate-800 hover:bg-amber-50/70"
                >
                  Skip
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex-1 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-slate-800"
                >
                  {isSubmitting ? (
                    "Submitting..."
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Submit
                    </>
                  )}
                </Button>
              </div>

              {/* Quick Feedback Tags */}
              {rating > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-4 pt-4 border-t border-amber-200/60"
                >
                  <p className="text-slate-600 text-xs text-center mb-2">Quick Feedback</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {rating >= 4 ? (
                      <>
                        <FeedbackTag label="Friendly 😊" onClick={(t) => setReview(prev => prev + ' ' + t)} />
                        <FeedbackTag label="Fun 🎉" onClick={(t) => setReview(prev => prev + ' ' + t)} />
                        <FeedbackTag label="Will chat again 💕" onClick={(t) => setReview(prev => prev + ' ' + t)} />
                      </>
                    ) : (
                      <>
                        <FeedbackTag label="Connection issue 📶" onClick={(t) => setReview(prev => prev + ' ' + t)} />
                        <FeedbackTag label="Audio issue 🔊" onClick={(t) => setReview(prev => prev + ' ' + t)} />
                        <FeedbackTag label="Video issue 📹" onClick={(t) => setReview(prev => prev + ' ' + t)} />
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function FeedbackTag({ label, onClick }: { label: string; onClick: (tag: string) => void }) {
  return (
    <button
      onClick={() => onClick(label)}
      className="px-3 py-1 rounded-full bg-amber-50/70 text-slate-700 text-xs hover:bg-amber-50 transition-colors"
    >
      {label}
    </button>
  );
}
