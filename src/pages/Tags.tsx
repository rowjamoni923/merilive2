import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { recordClientError } from "@/utils/clientErrorLog";

interface Tag {
  name: string;
  icon: string;
}

interface TagCategory {
  name: string;
  icon: string;
  color: string;
  tags: Tag[];
}

const tagCategories: TagCategory[] = [
  {
    name: "Preferences",
    icon: "💕",
    color: "from-pink-500 to-rose-500",
    tags: [
      { name: "Seeking chat friends", icon: "💬" },
      { name: "Seeking short-term date", icon: "🌹" },
      { name: "Seeking a stable relationship", icon: "💑" },
      { name: "Seeking a life partner", icon: "💍" },
      { name: "Just browsing", icon: "👀" },
      { name: "Looking for fun", icon: "🎉" },
    ]
  },
  {
    name: "Personality",
    icon: "🎭",
    color: "from-purple-500 to-violet-500",
    tags: [
      { name: "Emotional", icon: "🥺" },
      { name: "Rational", icon: "🧠" },
      { name: "Introvert", icon: "🤫" },
      { name: "Extrovert", icon: "🎊" },
      { name: "Genial", icon: "😊" },
      { name: "Cute", icon: "🥰" },
      { name: "Aloof", icon: "😎" },
      { name: "Lively", icon: "🤩" },
      { name: "Creative", icon: "🎨" },
      { name: "Adventurous", icon: "🏔️" },
      { name: "Calm", icon: "🧘" },
      { name: "Funny", icon: "😂" },
    ]
  },
  {
    name: "Profession",
    icon: "👤",
    color: "from-blue-500 to-cyan-500",
    tags: [
      { name: "Merchant", icon: "🏪" },
      { name: "IT", icon: "💻" },
      { name: "Teacher", icon: "👨‍🏫" },
      { name: "Service personnel", icon: "👔" },
      { name: "Media person", icon: "📺" },
      { name: "Farmer", icon: "🌾" },
      { name: "Architect", icon: "🏛️" },
      { name: "Designer", icon: "✏️" },
      { name: "Accounting", icon: "📊" },
      { name: "Driver", icon: "🚗" },
      { name: "Freelance", icon: "💼" },
      { name: "Student", icon: "📚" },
      { name: "Doctor", icon: "👨‍⚕️" },
      { name: "Engineer", icon: "⚙️" },
      { name: "Lawyer", icon: "⚖️" },
      { name: "Artist", icon: "🎭" },
      { name: "Chef", icon: "👨‍🍳" },
      { name: "Entrepreneur", icon: "🚀" },
    ]
  },
  {
    name: "Constellation",
    icon: "♈",
    color: "from-indigo-500 to-purple-500",
    tags: [
      { name: "Aries", icon: "♈" },
      { name: "Taurus", icon: "♉" },
      { name: "Gemini", icon: "♊" },
      { name: "Cancer", icon: "♋" },
      { name: "Leo", icon: "♌" },
      { name: "Virgo", icon: "♍" },
      { name: "Libra", icon: "♎" },
      { name: "Scorpio", icon: "♏" },
      { name: "Sagittarius", icon: "♐" },
      { name: "Capricorn", icon: "♑" },
      { name: "Aquarius", icon: "♒" },
      { name: "Pisces", icon: "♓" },
    ]
  },
  {
    name: "Interests & Hobbies",
    icon: "🎯",
    color: "from-orange-500 to-amber-500",
    tags: [
      { name: "Film lover", icon: "🎬" },
      { name: "Gourmet", icon: "🍴" },
      { name: "Karaoke champion", icon: "🎤" },
      { name: "Traveler", icon: "✈️" },
      { name: "Parties", icon: "🥳" },
      { name: "Veteran gamer", icon: "🎮" },
      { name: "Workaholic", icon: "💪" },
      { name: "Niche hobby", icon: "🎲" },
      { name: "Reading", icon: "📖" },
      { name: "Music", icon: "🎵" },
      { name: "Photography", icon: "📷" },
      { name: "Cooking", icon: "🍳" },
      { name: "Gardening", icon: "🌱" },
      { name: "Art lover", icon: "🖼️" },
      { name: "Tech enthusiast", icon: "📱" },
      { name: "Coffee lover", icon: "☕" },
    ]
  },
  {
    name: "Sports",
    icon: "🏃",
    color: "from-green-500 to-emerald-500",
    tags: [
      { name: "Running", icon: "🏃" },
      { name: "Football", icon: "⚽" },
      { name: "Swimming", icon: "🏊" },
      { name: "Cricket", icon: "🏏" },
      { name: "Yoga", icon: "🧘" },
      { name: "Fitness", icon: "🏋️" },
      { name: "Basketball", icon: "🏀" },
      { name: "Dancing", icon: "💃" },
      { name: "Golf", icon: "⛳" },
      { name: "Rugby", icon: "🏉" },
      { name: "Fishing", icon: "🎣" },
      { name: "Taking a walk", icon: "🚶" },
      { name: "Surfing", icon: "🏄" },
      { name: "Tennis", icon: "🎾" },
      { name: "Cycling", icon: "🚴" },
      { name: "Hiking", icon: "🥾" },
      { name: "Boxing", icon: "🥊" },
      { name: "Martial arts", icon: "🥋" },
    ]
  },
  {
    name: "Pets",
    icon: "🐾",
    color: "from-yellow-500 to-orange-500",
    tags: [
      { name: "Cat", icon: "🐱" },
      { name: "Dog", icon: "🐕" },
      { name: "Eagle", icon: "🦅" },
      { name: "Peacock", icon: "🦚" },
      { name: "Horse", icon: "🐴" },
      { name: "Fish", icon: "🐟" },
      { name: "Hamster", icon: "🐹" },
      { name: "Snake", icon: "🐍" },
      { name: "Bear", icon: "🐻" },
      { name: "Bird", icon: "🐦" },
      { name: "Rabbit", icon: "🐰" },
      { name: "Turtle", icon: "🐢" },
      { name: "Parrot", icon: "🦜" },
      { name: "Butterfly", icon: "🦋" },
    ]
  },
  {
    name: "MBTI",
    icon: "🧠",
    color: "from-teal-500 to-cyan-500",
    tags: [
      { name: "INTJ", icon: "🎯" },
      { name: "INTP", icon: "🔬" },
      { name: "ENTJ", icon: "👑" },
      { name: "ENTP", icon: "💡" },
      { name: "INFJ", icon: "🔮" },
      { name: "INFP", icon: "🌸" },
      { name: "ENFJ", icon: "🌟" },
      { name: "ENFP", icon: "🎈" },
      { name: "ISTJ", icon: "📋" },
      { name: "ISFJ", icon: "🛡️" },
      { name: "ESTJ", icon: "📊" },
      { name: "ESFJ", icon: "🤝" },
      { name: "ISTP", icon: "🔧" },
      { name: "ISFP", icon: "🎨" },
      { name: "ESTP", icon: "🏎️" },
      { name: "ESFP", icon: "🎪" },
    ]
  },
  {
    name: "Music Taste",
    icon: "🎵",
    color: "from-rose-500 to-pink-500",
    tags: [
      { name: "Pop", icon: "🎤" },
      { name: "Rock", icon: "🎸" },
      { name: "Hip Hop", icon: "🎧" },
      { name: "Classical", icon: "🎻" },
      { name: "Jazz", icon: "🎷" },
      { name: "EDM", icon: "🎹" },
      { name: "R&B", icon: "💜" },
      { name: "Country", icon: "🤠" },
      { name: "K-Pop", icon: "🇰🇷" },
      { name: "Indie", icon: "🌿" },
      { name: "Metal", icon: "🤘" },
      { name: "Folk", icon: "🪕" },
    ]
  },
  {
    name: "Food & Drink",
    icon: "🍔",
    color: "from-red-500 to-orange-500",
    tags: [
      { name: "Vegetarian", icon: "🥗" },
      { name: "Vegan", icon: "🌱" },
      { name: "Foodie", icon: "🍔" },
      { name: "Coffee addict", icon: "☕" },
      { name: "Tea lover", icon: "🍵" },
      { name: "Sweet tooth", icon: "🍰" },
      { name: "Spicy food", icon: "🌶️" },
      { name: "Healthy eater", icon: "🥦" },
      { name: "Fast food", icon: "🍟" },
      { name: "Fine dining", icon: "🍽️" },
      { name: "Street food", icon: "🌮" },
      { name: "Home cook", icon: "👨‍🍳" },
    ]
  },
  {
    name: "Lifestyle",
    icon: "✨",
    color: "from-violet-500 to-purple-500",
    tags: [
      { name: "Night owl", icon: "🦉" },
      { name: "Early bird", icon: "🌅" },
      { name: "Minimalist", icon: "🪴" },
      { name: "Maximalist", icon: "✨" },
      { name: "Eco-friendly", icon: "♻️" },
      { name: "Fashionista", icon: "👗" },
      { name: "Bookworm", icon: "📚" },
      { name: "Fitness freak", icon: "💪" },
      { name: "Social butterfly", icon: "🦋" },
      { name: "Homebody", icon: "🏠" },
      { name: "Adventure seeker", icon: "🏕️" },
      { name: "Spiritual", icon: "🧘" },
    ]
  },
  {
    name: "Relationship Status",
    icon: "💝",
    color: "from-pink-500 to-red-500",
    tags: [
      { name: "Single", icon: "🙋" },
      { name: "In a relationship", icon: "💑" },
      { name: "Complicated", icon: "🤔" },
      { name: "Open to anything", icon: "🌈" },
      { name: "Just friends", icon: "🤝" },
      { name: "Dating", icon: "💘" },
    ]
  },
];

const Tags = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  useEffect(() => {
    const fetchTags = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("tags")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.tags) {
        setSelectedTags(profile.tags);
      }
      setLoading(false);
    };

    fetchTags();
  }, [navigate]);

  const toggleTag = (tagName: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tagName)) {
        return prev.filter(t => t !== tagName);
      }
      if (prev.length >= 15) {
        toast({ title: "You can select a maximum of 15 tags", variant: "destructive" });
        return prev;
      }
      return [...prev, tagName];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("profiles")
        .update({ tags: selectedTags })
        .eq("id", user.id);

      if (error) throw error;

      toast({ title: "Tags saved!" });
      navigate(-1);
    } catch (error) {
      console.error("Save error:", error);
      recordClientError({ label: "Tags.handleSave", message: error instanceof Error ? error.message : String(error) });
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const getTagIcon = (tagName: string): string => {
    for (const category of tagCategories) {
      const tag = category.tags.find(t => t.name === tagName);
      if (tag) return tag.icon;
    }
    return "✨";
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-gradient-to-br from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF]">
      {/* Header */}
      <div className="shrink-0 bg-white/85 backdrop-blur-lg border-b border-amber-200/60">
        <div className="flex items-center justify-between px-4 h-14 safe-area-top">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-slate-700 hover:bg-amber-100/60">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold text-slate-800">Select Tags</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="text-pink-600 font-semibold hover:bg-pink-50"
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Scrollable area */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {/* Selected Tags Preview */}
        {selectedTags.length > 0 && (
          <div className="px-4 py-3 bg-white/70 border-b border-amber-200/60">
            <p className="text-sm text-slate-700 mb-2 font-medium">
              Selected Tags: {selectedTags.length}/15
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedTags.map(tagName => (
                <button
                  key={tagName}
                  onClick={() => toggleTag(tagName)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xs rounded-full font-semibold shadow-sm"
                >
                  <span>{getTagIcon(tagName)}</span>
                  <span>{tagName}</span>
                  <span className="ml-0.5 opacity-90">×</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tag Categories */}
        <div className="pb-24">
          {tagCategories.map((category) => {
            const isExpanded = expandedCategory === category.name || expandedCategory === null;
            const selectedCount = category.tags.filter(t => selectedTags.includes(t.name)).length;
            return (
              <div key={category.name} className="border-b border-amber-200/40">
                {/* Category Header */}
                <button
                  onClick={() => setExpandedCategory(
                    expandedCategory === category.name ? null : category.name
                  )}
                  className="w-full px-4 py-4 flex items-center justify-between hover:bg-amber-50/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center text-xl bg-gradient-to-br shadow-sm",
                      category.color
                    )}>
                      <span className="drop-shadow-sm">{category.icon}</span>
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-slate-800 text-base">{category.name}</h3>
                      <p className="text-xs text-slate-600">
                        {selectedCount} selected
                      </p>
                    </div>
                  </div>
                  <svg
                    className={cn(
                      "w-5 h-5 text-slate-500 transition-transform",
                      expandedCategory === category.name && "rotate-180"
                    )}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Tags Grid */}
                {isExpanded && (
                  <div className="px-4 pb-4 flex flex-wrap gap-2">
                    {category.tags.map((tag) => {
                      const isSelected = selectedTags.includes(tag.name);
                      return (
                        <button
                          key={tag.name}
                          onClick={() => toggleTag(tag.name)}
                          className={cn(
                            "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 active:scale-95 touch-manipulation border",
                            isSelected
                              ? `bg-gradient-to-r ${category.color} text-white border-transparent shadow-md`
                              : "bg-white text-slate-800 border-slate-300 hover:border-pink-400 hover:bg-pink-50"
                          )}
                        >
                          <span className="text-base">{tag.icon}</span>
                          <span>{tag.name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 ml-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Tags;
