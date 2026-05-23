import { cn } from "@/lib/utils";
import { Flame, Star, Sparkles, Heart, Music, Gamepad2 } from "lucide-react";

interface Category {
  id: string;
  label: string;
  icon: React.ElementType;
}

const categories: Category[] = [
  { id: "hot", label: "Hot", icon: Flame },
  { id: "new", label: "New", icon: Sparkles },
  { id: "popular", label: "Popular", icon: Star },
  { id: "nearby", label: "Nearby", icon: Heart },
  { id: "music", label: "Music", icon: Music },
  { id: "games", label: "Games", icon: Gamepad2 },
];

interface CategoryTabsProps {
  activeCategory: string;
  onCategoryChange: (id: string) => void;
}

export const CategoryTabs = ({ activeCategory, onCategoryChange }: CategoryTabsProps) => {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide py-2 px-4 -mx-4">
      {categories.map((category) => {
        const isActive = activeCategory === category.id;
        const Icon = category.icon;

        return (
          <button
            key={category.id}
            onClick={() => onCategoryChange(category.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-full whitespace-nowrap transition-all duration-300 shrink-0",
              isActive
                ? "gradient-primary text-primary-foreground shadow-glow"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            <Icon className={cn("w-4 h-4", isActive && "animate-pulse")} />
            <span className="text-sm font-medium">{category.label}</span>
          </button>
        );
      })}
    </div>
  );
};
