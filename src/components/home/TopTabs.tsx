import { cn } from "@/lib/utils";

interface TopTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: "nearby", label: "Nearby" },
  { id: "discovery", label: "Discovery" },
  { id: "friends", label: "Friends" },
];

export const TopTabs = ({ activeTab, onTabChange }: TopTabsProps) => {
  return (
    <div className="flex items-center justify-center gap-6 py-3">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "text-lg font-semibold transition-all duration-300 relative",
              isActive
                ? "text-primary text-2xl"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
