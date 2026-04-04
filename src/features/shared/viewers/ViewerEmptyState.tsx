import { Users } from "lucide-react";

interface ViewerEmptyStateProps {
  message?: string;
}

export const ViewerEmptyState = ({ message = "No viewers yet" }: ViewerEmptyStateProps) => {
  return (
    <div className="flex flex-col items-center justify-center h-32 text-white/50">
      {/* Cute Robot Illustration */}
      <div className="relative w-16 h-16 mb-3">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-500/20 to-pink-500/20 rounded-full" />
        <div className="absolute inset-2 bg-gradient-to-b from-[#2a1f4e] to-[#1a1035] rounded-full flex items-center justify-center">
          <div className="relative">
            {/* Robot face */}
            <div className="w-8 h-6 bg-gradient-to-b from-purple-400/30 to-purple-600/30 rounded-lg">
              {/* Eyes */}
              <div className="flex justify-center gap-2 pt-1">
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
              </div>
              {/* Mouth */}
              <div className="flex justify-center mt-1">
                <div className="w-3 h-0.5 bg-pink-400/50 rounded-full" />
              </div>
            </div>
            {/* Antenna */}
            <div className="absolute -top-2 left-1/2 -translate-x-1/2">
              <div className="w-0.5 h-2 bg-purple-400/50" />
              <div className="w-1.5 h-1.5 bg-pink-400 rounded-full -mt-0.5 -ml-0.5 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
      
      <p className="text-xs font-medium text-white/40">{message}</p>
    </div>
  );
};
