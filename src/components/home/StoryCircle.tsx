import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface StoryCircleProps {
  id: string;
  name: string;
  avatarUrl: string;
  isLive?: boolean;
  hasStory?: boolean;
  isViewed?: boolean;
}

export const StoryCircle = ({
  name,
  avatarUrl,
  isLive = false,
  hasStory = true,
  isViewed = false,
}: StoryCircleProps) => {
  return (
    <div className="flex flex-col items-center gap-1.5 cursor-pointer group">
      <div
        className={cn(
          "p-0.5 rounded-full transition-all duration-300",
          isLive
            ? "gradient-primary pulse-live"
            : hasStory && !isViewed
            ? "gradient-primary"
            : "bg-muted"
        )}
      >
        <div className="p-0.5 bg-background rounded-full">
          <Avatar className="w-16 h-16 transition-transform duration-300 group-hover:scale-105">
            <AvatarImage src={avatarUrl} alt={name} className="object-cover" />
            <AvatarFallback className="gradient-primary text-white text-lg">
              {name.charAt(0)}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
      
      {isLive && (
        <span className="px-2 py-0.5 bg-destructive text-white text-[10px] font-bold rounded-full -mt-4 z-10 shadow-lg">
          LIVE
        </span>
      )}
      
      <span className={cn(
        "text-xs font-medium truncate max-w-[70px] text-center",
        isViewed ? "text-muted-foreground" : "text-foreground"
      )}>
        {name}
      </span>
    </div>
  );
};
