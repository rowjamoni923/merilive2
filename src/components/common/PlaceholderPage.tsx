import { useNavigate } from "react-router-dom";
import { ArrowLeft, Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomNavigation } from "@/components/layout/BottomNavigation";

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

const PlaceholderPage = ({ title, description }: PlaceholderPageProps) => {
  const navigate = useNavigate();

  return (
    <div className="mobile-page bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-card border-b border-border/50 safe-area-top">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold">{title}</h1>
        </div>
      </header>

      {/* Content */}
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
          <Construction className="w-10 h-10 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold text-center mb-2">Coming Soon!</h2>
        <p className="text-muted-foreground text-center">
          {description || "This feature is still under development. Please wait."}
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => navigate(-1)}
        >
          Go Back
        </Button>
      </div>

      <BottomNavigation activeTab="" onTabChange={(path) => navigate(path)} />
    </div>
  );
};

export default PlaceholderPage;
