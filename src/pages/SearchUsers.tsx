import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Phone, UserPlus, UserCheck, X, Filter, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { useCall } from "@/components/call/CallProvider";
import { toast } from "sonner";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { recordClientError } from "@/utils/clientErrorLog";
import { pickDisplayLevel } from "@/utils/displayLevel";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface UserProfile {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  is_online: boolean | null;
  is_verified: boolean | null;
  is_host: boolean | null;
  country_flag: string | null;
  bio: string | null;
  tags: string[] | null;
  app_uid: string | null;
}

// Popular tags for quick filter
const popularTags = [
  { name: "Seeking chat friends", icon: "💬", color: "from-pink-400 to-rose-400" },
  { name: "Emotional", icon: "🥺", color: "from-orange-400 to-amber-400" },
  { name: "Extrovert", icon: "🎊", color: "from-purple-400 to-violet-400" },
  { name: "Student", icon: "📚", color: "from-blue-400 to-cyan-400" },
  { name: "IT", icon: "💻", color: "from-green-400 to-emerald-400" },
  { name: "Music", icon: "🎵", color: "from-indigo-400 to-purple-400" },
  { name: "Traveler", icon: "✈️", color: "from-teal-400 to-cyan-400" },
  { name: "Gourmet", icon: "🍴", color: "from-red-400 to-pink-400" },
];

// All tag categories for filter sheet
const tagCategories = [
  {
    name: "Preferences",
    icon: "💕",
    tags: ["Seeking chat friends", "Seeking short-term date", "Seeking a stable relationship", "Seeking a life partner", "Just browsing", "Looking for fun"]
  },
  {
    name: "Personality",
    icon: "🎭",
    tags: ["Emotional", "Rational", "Introvert", "Extrovert", "Genial", "Cute", "Aloof", "Lively", "Creative", "Adventurous", "Calm", "Funny"]
  },
  {
    name: "Profession",
    icon: "👤",
    tags: ["Merchant", "IT", "Teacher", "Service personnel", "Media person", "Farmer", "Designer", "Driver", "Freelance", "Student", "Doctor", "Engineer"]
  },
  {
    name: "Constellation",
    icon: "♈",
    tags: ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]
  },
  {
    name: "Hobbies",
    icon: "🎯",
    tags: ["Gourmet", "Traveler", "Film lover", "Music", "Reading", "Gaming", "Photography", "Dancing", "Cooking", "Fitness"]
  },
  {
    name: "Sports",
    icon: "⚽",
    tags: ["Running", "Football", "Cricket", "Basketball", "Swimming", "Yoga", "Badminton", "Tennis"]
  },
];

const SearchUsers = () => {
  const navigate = useNavigate();
  const { startCall } = useCall();
  const [activeTab, setActiveTab] = useState("/discover");
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [recentSearches, setRecentSearches] = useState<UserProfile[]>([]);
  
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        
        // Fetch who I'm following
        const { data: following } = await supabase
          .from('followers')
          .select('following_id')
          .eq('follower_id', user.id);
        
        setFollowingIds(new Set(following?.map(f => f.following_id) || []));
      }

      // Load recent searches from localStorage
      const saved = localStorage.getItem('recent_searches');
      if (saved) {
        try {
          setRecentSearches(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to parse recent searches');
          recordClientError({ label: "SearchUsers.saved", message: 'Failed to parse recent searches' });
        }
      }
    };

    init();
  }, []);

  const handleSearch = useCallback(async (query: string, tags: string[]) => {
    if (!query.trim() && tags.length === 0) {
      setResults([]);
      return;
    }

    try {
      // Clean the query - only digits allowed for app_uid search
      const cleanQuery = query.replace(/\D/g, '');

      let uidPromise: PromiseLike<{ data: UserProfile[] | null }>;
      if (cleanQuery.length === 0) {
        uidPromise = Promise.resolve({ data: [] as UserProfile[] });
      } else {
        // app_uid is 10-digit zero-padded text. Try exact (padded) + partial match.
        const padded = cleanQuery.padStart(10, '0');
        uidPromise = supabase
          .from('profiles_public')
          .select('id, display_name, username, avatar_url, is_online, is_verified, is_host, gender, user_level, host_level, max_user_level, country_flag, bio, tags, app_uid')
          .or(`app_uid.eq.${padded},app_uid.ilike.%${cleanQuery}%`)
          .limit(50) as any;
      }

      const tagPromise = tags.length > 0
        ? supabase
            .from('profiles_public')
            .select('id, display_name, username, avatar_url, is_online, is_verified, is_host, gender, user_level, host_level, max_user_level, country_flag, bio, tags, app_uid')
            .overlaps('tags', tags)
            .limit(50)
        : Promise.resolve({ data: [] as UserProfile[] });

      const [uidResult, tagResult] = await Promise.all([uidPromise, tagPromise]);

      let searchResults: UserProfile[] = uidResult.data || [];

      if (tags.length > 0) {
        const tagResults = tagResult.data || [];
        if (searchResults.length > 0) {
          const existingIds = new Set(searchResults.map(r => r.id));
          const filteredTagResults = tagResults.filter(r => existingIds.has(r.id));
          searchResults = filteredTagResults.length > 0 ? filteredTagResults : searchResults;
        } else {
          searchResults = tagResults;
        }
      }

      // Filter out current user
      setResults(searchResults.filter(u => u.id !== currentUserId));
    } catch (error) {
      console.error('Search error:', error);
      recordClientError({ label: "SearchUsers.filteredTagResults", message: error instanceof Error ? error.message : String(error) });
      toast.error("Search failed");
    }
  }, [currentUserId]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(searchQuery, selectedTags);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedTags, handleSearch]);

  const toggleTag = (tagName: string) => {
    setSelectedTags(prev => 
      prev.includes(tagName) 
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName]
    );
  };

  const clearTags = () => {
    setSelectedTags([]);
  };

  const saveToRecentSearches = (user: UserProfile) => {
    const updated = [user, ...recentSearches.filter(u => u.id !== user.id)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('recent_searches', JSON.stringify(updated));
  };

  const removeFromRecentSearches = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = recentSearches.filter(u => u.id !== userId);
    setRecentSearches(updated);
    localStorage.setItem('recent_searches', JSON.stringify(updated));
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('recent_searches');
  };

  const handleUserClick = (user: UserProfile) => {
    saveToRecentSearches(user);
    // Navigate to profile detail page for full profile view
    navigate(`/profile-detail/${user.id}`);
  };

  const handleFollow = async (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId) {
      toast.error("Please login first");
      return;
    }

    try {
      if (followingIds.has(userId)) {
        await supabase
          .from('followers')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', userId);
        
        setFollowingIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(userId);
          return newSet;
        });
        toast.success("Unfollowed");
      } else {
        await supabase
          .from('followers')
          .insert({
            follower_id: currentUserId,
            following_id: userId
          });
        
        setFollowingIds(prev => new Set([...prev, userId]));
        toast.success("Followed");
      }
    } catch (error) {
      console.error('Follow error:', error);
      recordClientError({ label: "SearchUsers.newSet", message: error instanceof Error ? error.message : String(error) });
      toast.error("Action failed");
    }
  };

  const handleCall = async (hostId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await startCall(hostId);
    } catch (error) {
      console.error('Call error:', error);
      recordClientError({ label: "SearchUsers.handleCall", message: error instanceof Error ? error.message : String(error) });
      toast.error("Failed to start call");
    }
  };

  const renderUserCard = (user: UserProfile, showRemove: boolean = false) => {
    const isFollowing = followingIds.has(user.id);

    return (
      <div
        key={user.id}
        className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors text-slate-900"
        onClick={() => handleUserClick(user)}
      >
        {/* Avatar */}
        <div className="relative">
          <AvatarWithFrame
            userId={user.id}
            src={user.avatar_url || undefined}
            name={user.display_name || user.username || '?'}
            level={(user as any).user_level || 1}
            isHost={!!user.is_host}
            size="md"
            showFrame={true}
            showAnimation={true}
            isOnline={!!user.is_online}
          />
          {user.is_verified && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center border-2 border-white">
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold truncate">{user.display_name || user.username || 'User'}</p>
            {user.is_host && (
              <span className="text-xs bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full shrink-0">Host</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-slate-500 truncate">
              {user.country_flag} {user.bio || (user.is_online ? 'Online' : 'Offline')}
            </p>
            {user.app_uid && (
              <span className="text-xs font-mono bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded">{user.app_uid}</span>
            )}
          </div>
          {/* User Tags */}
          {user.tags && user.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {user.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
              {user.tags.length > 3 && (
                <span className="text-[10px] text-muted-foreground">+{user.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {showRemove ? (
            <Button
              size="icon"
              variant="ghost"
              className="w-8 h-8"
              onClick={(e) => removeFromRecentSearches(user.id, e)}
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </Button>
          ) : (
            <>
              {user.is_host && user.is_online && (
                <Button
                  size="icon"
                  className="w-10 h-10 rounded-full bg-gradient-to-r from-green-500 to-emerald-500"
                  onClick={(e) => handleCall(user.id, e)}
                >
                  <Phone className="w-4 h-4 text-white" />
                </Button>
              )}
              
              <Button
                size="icon"
                variant={isFollowing ? "outline" : "default"}
                className={`w-10 h-10 rounded-full ${!isFollowing ? 'bg-gradient-to-r from-purple-500 to-pink-500' : ''}`}
                onClick={(e) => handleFollow(user.id, e)}
              >
                {isFollowing ? (
                  <UserCheck className="w-4 h-4" />
                ) : (
                  <UserPlus className="w-4 h-4 text-white" />
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mobile-page bg-[#F7F8FA]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200/70 safe-area-top">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-slate-700 hover:bg-slate-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              placeholder="Enter App ID (10 digits)..."
              value={searchQuery}
              onChange={(e) => {
                // Only allow digits
                const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                setSearchQuery(value);
              }}
              className="pl-10 pr-10 rounded-full bg-slate-100 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-slate-300"
              autoFocus
              inputMode="numeric"
              maxLength={10}
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8"
                onClick={() => setSearchQuery("")}
              >
                <X className="w-4 h-4 text-slate-500" />
              </Button>
            )}
          </div>
          {/* ID Icon */}
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-sm">ID</span>
          </div>
          {/* Filter Button */}
          <Sheet open={showFilterSheet} onOpenChange={setShowFilterSheet}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={`relative ${selectedTags.length > 0 ? 'border-primary text-primary' : ''}`}
              >
                <Filter className="w-5 h-5" />
                {selectedTags.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
                    {selectedTags.length}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[70vh]">
              <SheetHeader>
                <SheetTitle className="flex items-center justify-between">
                  <span>Filter by Tags</span>
                  {selectedTags.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearTags}>
                      Clear All
                    </Button>
                  )}
                </SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-full mt-4 pb-20">
                {tagCategories.map((category) => (
                  <div key={category.name} className="mb-6">
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                      <span>{category.icon}</span>
                      {category.name}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {category.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant={selectedTags.includes(tag) ? "default" : "outline"}
                          className={`cursor-pointer transition-all ${
                            selectedTags.includes(tag) 
                              ? 'bg-primary text-primary-foreground' 
                              : 'hover:bg-muted'
                          }`}
                          onClick={() => toggleTag(tag)}
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </SheetContent>
          </Sheet>
        </div>


        {/* Selected Tags */}
        {selectedTags.length > 0 && (
          <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Filtering by:</span>
            {selectedTags.map((tag) => (
              <Badge
                key={tag}
                variant="default"
                className="gap-1 cursor-pointer"
                onClick={() => toggleTag(tag)}
              >
                {tag}
                <X className="w-3 h-3" />
              </Badge>
            ))}
          </div>
        )}
      </header>

      <main className="mobile-page-scrollable px-4 py-4 bg-[#F7F8FA]">
        {searchQuery || selectedTags.length > 0 ? (
          // Search Results
          <div className="space-y-3">
            {results.length === 0 ? (
              <div className="text-center py-16">
                <Tag className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <h3 className="text-lg font-semibold mb-2 text-slate-900">No users found</h3>
                <p className="text-slate-500 text-sm">
                  {selectedTags.length > 0 
                    ? "Try selecting different tags or removing some filters"
                    : "Try searching with a different name or ID"
                  }
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-500 mb-3">
                  {results.length} user{results.length !== 1 ? 's' : ''} found
                  {selectedTags.length > 0 && ` with ${selectedTags.length} tag${selectedTags.length > 1 ? 's' : ''}`}
                </p>
                {results.map(user => renderUserCard(user))}
              </>
            )}
          </div>
        ) : (
          // Recent Searches
          <div className="space-y-4">
            {recentSearches.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-600">Recent Searches</h2>
                  <Button variant="ghost" size="sm" onClick={clearRecentSearches} className="text-slate-600 hover:bg-slate-100">
                    Clear all
                  </Button>
                </div>
                <div className="space-y-3">
                  {recentSearches.map(user => renderUserCard(user, true))}
                </div>
              </>
            )}

            {recentSearches.length === 0 && (
              <div className="text-center py-16">
                <Search className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <h3 className="text-lg font-semibold mb-2 text-slate-900">Search for users</h3>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">
                  Find users by their display name, user ID, or filter by tags
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      <BottomNavigation activeTab={activeTab} onTabChange={(path) => {
        setActiveTab(path);
        navigate(path);
      }} />
    </div>
  );
};

export default SearchUsers;
