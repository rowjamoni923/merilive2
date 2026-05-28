import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { cn } from "@/lib/utils";

interface StoryCircleProps {
  id: string;
  name: string;
  avatarUrl: string;
  isLive?: boolean;
  hasStory?: boolean;
  isViewed?: boolean;
  userId?: string;
  level?: number;
  isHost?: boolean;
}

export const StoryCircle = ({
  id,
  name,
  avatarUrl,
  isLive = false,
  hasStory = true,
  isViewed = false,
  userId,
  level = 1,
  isHost = false,
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
          <AvatarWithFrame
            userId={userId || id}
            src={avatarUrl}
            name={name}
            level={level}
            isHost={isHost}
            size="md"
          />
        </div>
      </div>

      {isLive && (
        <span className="px-2 py-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full -mt-4 z-10 shadow-lg">
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
