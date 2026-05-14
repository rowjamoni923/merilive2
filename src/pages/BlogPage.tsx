import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar, User, ArrowRight, Search, Smartphone, Users, Gift, Star, Shield, Video, Music, Zap, Globe, Heart, Download, Play, MessageCircle, Crown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { PLAY_STORE_URL } from "@/utils/shareLinks";
import meriliveLogo from "@/assets/merilive-logo.png";

/**
 * Blog Page - Shown at /admin route for non-authorized users
 * This hides the admin panel from public access
 * Now includes App About/Biodata section
 */

interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  author: string;
  date: string;
  readTime: string;
  image: string;
}

const SAMPLE_POSTS: BlogPost[] = [
  {
    id: "1",
    title: "How to Grow Your Live Streaming Audience",
    excerpt: "Learn the secrets to building a loyal fan base and increasing your viewer count on live streaming platforms.",
    category: "Tips & Tricks",
    author: "MeriLive Team",
    date: "Jan 28, 2026",
    readTime: "5 min read",
    image: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=250&fit=crop"
  },
  {
    id: "2",
    title: "Top 10 Gift Ideas for Your Favorite Hosts",
    excerpt: "Show your appreciation to your favorite streamers with these popular gift options available on MeriLive.",
    category: "Community",
    author: "MeriLive Team",
    date: "Jan 25, 2026",
    readTime: "3 min read",
    image: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400&h=250&fit=crop"
  },
  {
    id: "3",
    title: "Becoming a Successful Agency Owner",
    excerpt: "A complete guide to starting and managing your own agency on MeriLive, from recruitment to earnings.",
    category: "Agency",
    author: "MeriLive Team",
    date: "Jan 22, 2026",
    readTime: "8 min read",
    image: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=400&h=250&fit=crop"
  },
  {
    id: "4",
    title: "Safety Tips for Live Streamers",
    excerpt: "Protect yourself and your community with these essential safety guidelines for content creators.",
    category: "Safety",
    author: "MeriLive Team",
    date: "Jan 18, 2026",
    readTime: "6 min read",
    image: "https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?w=400&h=250&fit=crop"
  },
  {
    id: "5",
    title: "Party Room Features You Need to Try",
    excerpt: "Discover the exciting features available in MeriLive party rooms and how to make the most of them.",
    category: "Features",
    author: "MeriLive Team",
    date: "Jan 15, 2026",
    readTime: "4 min read",
    image: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400&h=250&fit=crop"
  },
  {
    id: "6",
    title: "Understanding the VIP Membership Benefits",
    excerpt: "Explore all the exclusive perks and privileges that come with VIP membership on MeriLive.",
    category: "VIP",
    author: "MeriLive Team",
    date: "Jan 10, 2026",
    readTime: "5 min read",
    image: "https://images.unsplash.com/photo-1579548122080-c35fd6820ecb?w=400&h=250&fit=crop"
  }
];

const CATEGORIES = ["All", "Tips & Tricks", "Community", "Agency", "Safety", "Features", "VIP"];

const APP_FEATURES = [
  {
    icon: Video,
    title: "Live Streaming",
    description: "Go live with HD video and connect with your audience in real-time"
  },
  {
    icon: Users,
    title: "Party Rooms",
    description: "Join interactive party rooms with up to 12 hosts and unlimited viewers"
  },
  {
    icon: Gift,
    title: "Virtual Gifts",
    description: "Send and receive beautiful animated gifts to show appreciation"
  },
  {
    icon: Crown,
    title: "VIP Membership",
    description: "Unlock exclusive features, badges, and premium privileges"
  },
  {
    icon: MessageCircle,
    title: "Private Calls",
    description: "Connect one-on-one with your favorite hosts via video calls"
  },
  {
    icon: Music,
    title: "Entertainment",
    description: "Enjoy music, games, and interactive entertainment features"
  },
  {
    icon: Shield,
    title: "Safe & Secure",
    description: "Advanced moderation and privacy controls for a safe experience"
  },
  {
    icon: Globe,
    title: "Global Community",
    description: "Connect with creators and viewers from around the world"
  }
];

const APP_STATS = [
  { value: "10M+", label: "Downloads" },
  { value: "500K+", label: "Active Users" },
  { value: "50K+", label: "Content Creators" },
  { value: "100+", label: "Countries" }
];

export default function BlogPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [activeSection, setActiveSection] = useState<"about" | "blog">("about");

  const filteredPosts = SAMPLE_POSTS.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         post.excerpt.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || post.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-lg border-b border-amber-200/60 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div 
              className="flex items-center gap-3 cursor-pointer" 
              onClick={() => navigate("/")}
            >
              <img src={meriliveLogo} alt="MeriLive" className="w-10 h-10 rounded-xl object-contain" />
              <div>
                <h1 className="text-xl font-bold text-slate-800">MeriLive</h1>
                <p className="text-xs text-pink-600 font-medium">Live Streaming & Video Calls</p>
              </div>
            </div>

            {/* Section Toggle */}
            <div className="hidden md:flex items-center gap-2 bg-amber-50/70 border border-amber-200/60 rounded-full p-1">
              <button
                onClick={() => setActiveSection("about")}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeSection === "about" 
                    ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md shadow-pink-500/30" 
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                About
              </button>
              <button
                onClick={() => setActiveSection("blog")}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeSection === "blog" 
                    ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md shadow-pink-500/30" 
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Blog
              </button>
            </div>

            <div className="flex items-center gap-4">
              <Button 
                onClick={() => navigate("/")}
                className="bg-gradient-to-r from-purple-500 to-pink-500"
              >
                <Play className="w-4 h-4 mr-2" />
                Open App
              </Button>
            </div>
          </div>

          {/* Mobile Section Toggle */}
          <div className="flex md:hidden items-center gap-2 mt-4 bg-amber-50/70 border border-amber-200/60 rounded-full p-1">
            <button
              onClick={() => setActiveSection("about")}
              className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeSection === "about" 
                  ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md shadow-pink-500/30" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              About
            </button>
            <button
              onClick={() => setActiveSection("blog")}
              className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeSection === "blog" 
                  ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md shadow-pink-500/30" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Blog
            </button>
          </div>
        </div>
      </header>

      {/* About Section */}
      {activeSection === "about" && (
        <>
          {/* Hero Section */}
          <section className="py-16 md:py-24 px-4 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -top-40 -right-40 w-80 h-80 bg-pink-300/30 rounded-full blur-3xl" />
              <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-amber-300/30 rounded-full blur-3xl" />
            </div>
            
            <div className="container mx-auto text-center relative z-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <Badge className="mb-4 bg-pink-100 text-pink-700 border border-pink-200 px-4 py-1.5">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  #1 Live Streaming Platform
                </Badge>
                <h1 className="text-4xl md:text-6xl font-bold text-slate-800 mb-6">
                  Connect, Stream & 
                  <span className="bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent"> Earn</span>
                </h1>
                <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-8">
                  MeriLive is the ultimate live streaming platform where creators connect with their audience through video calls, party rooms, and interactive entertainment.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button 
                    size="lg"
                    onClick={() => window.open(PLAY_STORE_URL, '_blank')}
                    className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white text-lg px-8 shadow-lg shadow-pink-500/30"
                  >
                    <Download className="w-5 h-5 mr-2" />
                    Download App
                  </Button>
                  <Button 
                    size="lg"
                    variant="outline"
                    onClick={() => navigate("/")}
                    className="border-amber-300/70 bg-white/70 text-slate-700 hover:bg-amber-50 text-lg px-8"
                  >
                    <Play className="w-5 h-5 mr-2" />
                    Open Web App
                  </Button>
                </div>
              </motion.div>
            </div>
          </section>

          {/* Stats Section */}
          <section className="py-12 px-4 bg-white/60 border-y border-amber-200/60">
            <div className="container mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                {APP_STATS.map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className="text-center"
                  >
                    <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
                      {stat.value}
                    </div>
                    <div className="text-sm text-slate-600 mt-1">{stat.label}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* Features Section */}
          <section className="py-16 px-4">
            <div className="container mx-auto">
              <div className="text-center mb-12">
                <Badge className="mb-4 bg-purple-500/20 text-purple-300 border-purple-500/30">
                  Features
                </Badge>
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                  Everything You Need
                </h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  Discover powerful features designed to help creators grow and connect with their audience.
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                {APP_FEATURES.map((feature, index) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <Card className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors h-full">
                      <CardContent className="p-6 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mx-auto mb-4">
                          <feature.icon className="w-7 h-7 text-purple-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-2">
                          {feature.title}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {feature.description}
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* About Company Section */}
          <section className="py-16 px-4 bg-white/5">
            <div className="container mx-auto">
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <Badge className="mb-4 bg-purple-500/20 text-purple-300 border-purple-500/30">
                    About Us
                  </Badge>
                  <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                    Empowering Creators Worldwide
                  </h2>
                  <div className="space-y-4 text-muted-foreground">
                    <p>
                      MeriLive is a leading live streaming and social entertainment platform that connects content creators with their audience through innovative features and interactive experiences.
                    </p>
                    <p>
                      Founded with the vision of democratizing content creation, we provide tools and opportunities for anyone to become a successful streamer, from private video calls to large-scale party rooms.
                    </p>
                    <p>
                      Our platform supports creators with transparent earnings, agency partnerships, and a vibrant community of fans and supporters from around the globe.
                    </p>
                  </div>
                  <div className="mt-8 flex flex-wrap gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Heart className="w-4 h-4 text-pink-400" />
                      <span className="text-white">Community First</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Shield className="w-4 h-4 text-green-400" />
                      <span className="text-white">Safe & Secure</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Star className="w-4 h-4 text-yellow-400" />
                      <span className="text-white">Top Rated</span>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5 }}
                  className="relative"
                >
                  <div className="aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/10 flex items-center justify-center">
                    <div className="text-center p-8">
                      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-4">
                        <span className="text-white font-bold text-3xl">M</span>
                      </div>
                      <h3 className="text-2xl font-bold text-white mb-2">MeriLive</h3>
                      <p className="text-purple-300">Live Streaming & Video Calls</p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="py-16 px-4">
            <div className="container mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-3xl border border-white/10 p-8 md:p-12 text-center"
              >
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                  Ready to Start Streaming?
                </h2>
                <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
                  Join millions of creators and viewers on MeriLive. Download the app today and start your streaming journey!
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button 
                    size="lg"
                    onClick={() => navigate("/")}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  >
                    <Smartphone className="w-5 h-5 mr-2" />
                    Get Started Free
                  </Button>
                </div>
              </motion.div>
            </div>
          </section>
        </>
      )}

      {/* Blog Section */}
      {activeSection === "blog" && (
        <>
          {/* Hero Section */}
          <section className="py-16 px-4">
            <div className="container mx-auto text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <Badge className="mb-4 bg-purple-500/20 text-purple-300 border-purple-500/30">
                  MeriLive Blog
                </Badge>
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                  Tips, News & Updates
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  Stay updated with the latest features, tips for streamers, and community highlights from MeriLive.
                </p>
              </motion.div>
            </div>
          </section>

          {/* Categories */}
          <section className="px-4 pb-8">
            <div className="container mx-auto">
              <div className="flex flex-wrap gap-2 justify-center">
                {CATEGORIES.map((category) => (
                  <Button
                    key={category}
                    variant={selectedCategory === category ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(category)}
                    className={selectedCategory === category 
                      ? "bg-purple-500 hover:bg-purple-600" 
                      : "border-white/20 text-white hover:bg-white/10"
                    }
                  >
                    {category}
                  </Button>
                ))}
              </div>
            </div>
          </section>

          {/* Search */}
          <section className="px-4 pb-8">
            <div className="container mx-auto max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-white/5 border-white/10"
                />
              </div>
            </div>
          </section>

          {/* Blog Posts Grid */}
          <section className="px-4 pb-16">
            <div className="container mx-auto">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPosts.map((post, index) => (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                  >
                    <Card className="bg-white/5 border-white/10 overflow-hidden hover:bg-white/10 transition-colors cursor-pointer group">
                      <div className="relative h-48 overflow-hidden">
                        <img 
                          src={post.image} 
                          alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <Badge className="absolute top-3 left-3 bg-purple-500/80 text-white">
                          {post.category}
                        </Badge>
                      </div>
                      <CardContent className="p-5">
                        <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-purple-300 transition-colors">
                          {post.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                          {post.excerpt}
                        </p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <User className="w-3 h-3" />
                            <span>{post.author}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3 h-3" />
                            <span>{post.date}</span>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center text-purple-400 text-sm font-medium">
                          Read More <ArrowRight className="w-4 h-4 ml-1" />
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {filteredPosts.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-muted-foreground">No articles found matching your search.</p>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-4 bg-slate-900/50">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src={meriliveLogo} alt="MeriLive" className="w-8 h-8 rounded-lg object-contain" />
              <span className="text-white font-semibold">MeriLive</span>
            </div>
            <div className="text-muted-foreground text-sm">
              © 2026 MeriLive. All rights reserved.
            </div>
            <div className="flex gap-6">
              <button onClick={() => navigate("/privacy-policy")} className="text-sm text-muted-foreground hover:text-white transition-colors">
                Privacy
              </button>
              <button onClick={() => navigate("/terms")} className="text-sm text-muted-foreground hover:text-white transition-colors">
                Terms
              </button>
              <button onClick={() => navigate("/contact")} className="text-sm text-muted-foreground hover:text-white transition-colors">
                Contact
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
