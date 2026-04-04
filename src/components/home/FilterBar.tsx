import { ChevronDown, Globe, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface FilterBarProps {
  selectedLanguage: string;
  selectedLocation: string;
  onLanguageChange: (lang: string) => void;
  onLocationChange: (loc: string) => void;
}

const languages = ["All", "Bengali", "English", "Hindi", "Arabic"];
const locations = ["All", "Bangladesh", "India", "Pakistan", "Nepal"];

export const FilterBar = ({
  selectedLanguage,
  selectedLocation,
  onLanguageChange,
  onLocationChange,
}: FilterBarProps) => {
  return (
    <div className="flex gap-2 px-4 pb-3">
      {/* Language Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            className="flex-1 h-11 rounded-xl bg-white hover:bg-gray-50 gap-2 border border-gray-200 shadow-sm"
          >
            <Globe className="w-4 h-4 text-primary" />
            <span className="text-foreground font-medium text-sm">{selectedLanguage}</span>
            <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44 bg-white border border-gray-200 shadow-elevated rounded-xl">
          {languages.map((lang) => (
            <DropdownMenuItem
              key={lang}
              onClick={() => onLanguageChange(lang)}
              className={`cursor-pointer hover:bg-gray-50 rounded-lg mx-1 ${selectedLanguage === lang ? "bg-primary/10 text-primary" : "text-foreground"}`}
            >
              {lang}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            className="flex-1 h-11 rounded-xl bg-white hover:bg-gray-50 gap-2 border border-gray-200 shadow-sm"
          >
            <MapPin className="w-4 h-4 text-secondary" />
            <span className="text-foreground font-medium text-sm">{selectedLocation}</span>
            <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 bg-white border border-gray-200 shadow-elevated rounded-xl">
          {locations.map((loc) => (
            <DropdownMenuItem
              key={loc}
              onClick={() => onLocationChange(loc)}
              className={`cursor-pointer hover:bg-gray-50 rounded-lg mx-1 ${selectedLocation === loc ? "bg-primary/10 text-primary" : "text-foreground"}`}
            >
              {loc}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
