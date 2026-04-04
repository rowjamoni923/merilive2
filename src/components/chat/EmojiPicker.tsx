import { useState } from "react";
import { X, Search, Clock, Smile, Heart, ThumbsUp, PartyPopper, Flame, Star, Sparkles, Crown, Gem, Gift, Music, Camera, Coffee, Pizza, Cake, Apple, Carrot, Salad, Zap, Sun, Moon, Cloud, Rainbow, Snowflake, Umbrella, Droplet, Wind, Mountain, TreePine, Flower2, Leaf, Cat, Dog, Bird, Fish, Rocket, Plane, Car, Ship, Train, Bike, Trophy, Medal, Target, Gamepad2, Dice5, Puzzle, Ghost, Skull, Bot, Baby, UserCircle, Users, Handshake, Waves, Eye, Brain, Ear, Footprints, Hand, Palette, Brush, Scissors, Wrench, Key, Lock, Bell, Bookmark, Flag, Tag, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface EmojiPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
}

// Premium 3D animated emoji categories with 500+ emojis
const emojiCategories = [
  {
    id: "recent",
    name: "Recent",
    icon: Clock,
    emojis: ["😀", "❤️", "👍", "🔥", "💯", "✨", "🎉", "💪"]
  },
  {
    id: "smileys",
    name: "Smileys & People",
    icon: Smile,
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
      "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "☺️", "😚",
      "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭",
      "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄",
      "😬", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕",
      "🤢", "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳",
      "🥸", "😎", "🤓", "🧐", "😕", "😟", "🙁", "☹️", "😮", "😯",
      "😲", "😳", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭",
      "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡",
      "😠", "🤬", "😈", "👿", "💀", "☠️", "💩", "🤡", "👹", "👺",
      "👻", "👽", "👾", "🤖", "😺", "😸", "😹", "😻", "😼", "😽",
      "🙀", "😿", "😾", "🙈", "🙉", "🙊", "💋", "💌", "💘", "💝",
      "💖", "💗", "💓", "💞", "💕", "💟", "❣️", "💔", "❤️‍🔥", "❤️‍🩹",
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💯"
    ]
  },
  {
    id: "gestures",
    name: "Gestures & Body",
    icon: ThumbsUp,
    emojis: [
      "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞",
      "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍",
      "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝",
      "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦿", "🦵", "🦶", "👂",
      "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", "👅",
      "👄", "💋", "🧑", "👶", "🧒", "👦", "👧", "🧑", "👨", "👩",
      "🧔", "👴", "👵", "🙍", "🙎", "🙅", "🙆", "💁", "🙋", "🧏",
      "🙇", "🤦", "🤷", "👮", "🕵️", "💂", "🥷", "👷", "🤴", "👸",
      "👳", "👲", "🧕", "🤵", "👰", "🤰", "🤱", "👼", "🎅", "🤶"
    ]
  },
  {
    id: "hearts",
    name: "Hearts & Love",
    icon: Heart,
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝",
      "💟", "💌", "💋", "😍", "🥰", "😘", "😻", "💑", "👩‍❤️‍👨", "👨‍❤️‍👨",
      "👩‍❤️‍👩", "💏", "👩‍❤️‍💋‍👨", "👨‍❤️‍💋‍👨", "👩‍❤️‍💋‍👩", "🌹", "🥀", "💐", "🌷", "🌸",
      "🏵️", "🌻", "🌼", "🌺", "💮", "🪷", "🍫", "🍬", "🍭", "🎁"
    ]
  },
  {
    id: "celebration",
    name: "Celebration",
    icon: PartyPopper,
    emojis: [
      "🎉", "🎊", "🎈", "🎂", "🎁", "🎀", "🎄", "🎃", "🎗️", "🎟️",
      "🎫", "🏆", "🏅", "🥇", "🥈", "🥉", "⚽", "🏀", "🏈", "⚾",
      "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🪀", "🏓", "🏸", "🏒",
      "🏑", "🥍", "🏏", "🪃", "🥅", "⛳", "🪁", "🏹", "🎣", "🤿",
      "🥊", "🥋", "🎽", "🛹", "🛼", "🛷", "⛸️", "🥌", "🎿", "⛷️",
      "🏂", "🪂", "🏋️", "🤼", "🤸", "🤺", "⛹️", "🤾", "🏌️", "🏇",
      "⛑️", "🎖️", "🎪", "🎭", "🎨", "🎬", "🎤", "🎧", "🎼", "🎹"
    ]
  },
  {
    id: "fire",
    name: "Fire & Energy",
    icon: Flame,
    emojis: [
      "🔥", "💥", "⚡", "✨", "💫", "🌟", "⭐", "🌠", "🌃", "🌆",
      "🌅", "🌄", "🌇", "🌉", "💎", "💰", "💵", "💸", "💳", "🪙",
      "💴", "💶", "💷", "🏧", "💹", "📈", "📉", "💱", "💲", "🔔",
      "🔕", "🔊", "🔉", "🔈", "🔇", "📢", "📣", "💣", "🧨", "🎆",
      "🎇", "🧧", "🎐", "🎑", "🎋", "🪔", "🕯️", "💡", "🔦", "🏮"
    ]
  },
  {
    id: "stars",
    name: "Stars & Sparkles",
    icon: Star,
    emojis: [
      "⭐", "🌟", "💫", "✨", "🌠", "💎", "🔮", "🪬", "📿", "💍",
      "👑", "🎩", "🎓", "🧢", "⛑️", "📿", "💄", "💋", "👄", "🦷",
      "👅", "👁️", "🧿", "💠", "🔷", "🔶", "🔹", "🔸", "🔺", "🔻",
      "💢", "💬", "👁️‍🗨️", "🗨️", "🗯️", "💭", "💤", "💮", "♨️", "💈",
      "🛑", "🕛", "🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗"
    ]
  },
  {
    id: "luxury",
    name: "Luxury & Premium",
    icon: Crown,
    emojis: [
      "👑", "💎", "💍", "👸", "🤴", "🏰", "🗼", "🎭", "🎪", "🎠",
      "🎡", "🎢", "🚁", "🛩️", "✈️", "🛫", "🛬", "🪂", "🚀", "🛸",
      "🛰️", "🚂", "🚃", "🚄", "🚅", "🚆", "🚇", "🚈", "🚉", "🚊",
      "🚝", "🚞", "🚋", "🚌", "🚍", "🚎", "🚐", "🚑", "🚒", "🚓",
      "🚔", "🚕", "🚖", "🚗", "🚘", "🚙", "🛻", "🚚", "🚛", "🚜"
    ]
  },
  {
    id: "gems",
    name: "Gems & Treasures",
    icon: Gem,
    emojis: [
      "💎", "💍", "💰", "💵", "💴", "💶", "💷", "💸", "💳", "🪙",
      "⚱️", "🏺", "🔮", "📿", "🧿", "🪬", "🎁", "🎀", "🎗️", "🎟️",
      "🎫", "🏵️", "🌸", "💮", "🏆", "🥇", "🥈", "🥉", "🎖️", "🏅",
      "🎭", "🖼️", "🎨", "🧵", "🪡", "🧶", "🪢", "👔", "👕", "👖"
    ]
  },
  {
    id: "gifts",
    name: "Gifts & Presents",
    icon: Gift,
    emojis: [
      "🎁", "🎀", "💝", "💖", "🎂", "🍰", "🧁", "🍩", "🍪", "🍫",
      "🍬", "🍭", "🍮", "🍯", "🎈", "🎊", "🎉", "🎄", "🎃", "🎗️",
      "🧧", "🎐", "🪅", "🪆", "🎏", "🎎", "🎑", "🎋", "🪭", "🪮",
      "🎒", "🛍️", "👜", "👛", "👝", "🧳", "💼", "📦", "📫", "📪"
    ]
  },
  {
    id: "music",
    name: "Music & Entertainment",
    icon: Music,
    emojis: [
      "🎵", "🎶", "🎼", "🎹", "🎸", "🎺", "🎷", "🎻", "🪕", "🪘",
      "🪗", "🥁", "🎤", "🎧", "📻", "🎬", "🎭", "🎪", "🎨", "🎰",
      "🎮", "🕹️", "🎲", "🧩", "🪩", "🪀", "🪁", "🃏", "🀄", "🎴",
      "📺", "📷", "📸", "📹", "🎥", "📽️", "🎞️", "📞", "☎️", "📟"
    ]
  },
  {
    id: "food",
    name: "Food & Drinks",
    icon: Coffee,
    emojis: [
      "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐",
      "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑",
      "🥦", "🥬", "🥒", "🌶️", "🫑", "🌽", "🥕", "🫒", "🧄", "🧅",
      "🥔", "🍠", "🥐", "🥖", "🍞", "🥨", "🥯", "🧇", "🥞", "🧈",
      "🍳", "🥚", "🧀", "🥓", "🥩", "🍗", "🍖", "🦴", "🌭", "🍔",
      "🍟", "🍕", "🫓", "🥪", "🥙", "🧆", "🌮", "🌯", "🫔", "🥗",
      "🥘", "🫕", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🦪",
      "🍤", "🍙", "🍚", "🍘", "🍥", "🥠", "🥮", "🍢", "🍡", "🍧",
      "🍨", "🍦", "🥧", "🧁", "🍰", "🎂", "🍮", "🍭", "🍬", "🍫",
      "🍿", "🍩", "🍪", "🌰", "🥜", "🍯", "🥛", "🍼", "🫖", "☕",
      "🍵", "🧃", "🥤", "🧋", "🍶", "🍺", "🍻", "🥂", "🍷", "🥃"
    ]
  },
  {
    id: "nature",
    name: "Nature & Animals",
    icon: TreePine,
    emojis: [
      "🌲", "🌳", "🌴", "🌱", "🌿", "☘️", "🍀", "🎍", "🪴", "🎋",
      "🍃", "🍂", "🍁", "🌾", "🌺", "🌸", "🌼", "🌻", "🌹", "🥀",
      "💐", "🌷", "🪷", "🪻", "🌵", "🎄", "🐶", "🐱", "🐭", "🐹",
      "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨", "🐯", "🦁", "🐮", "🐷",
      "🐸", "🐵", "🙈", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤",
      "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄",
      "🐝", "🪱", "🐛", "🦋", "🐌", "🐞", "🐜", "🪰", "🪲", "🪳",
      "🦟", "🦗", "🕷️", "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙",
      "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋"
    ]
  },
  {
    id: "weather",
    name: "Weather & Sky",
    icon: Sun,
    emojis: [
      "☀️", "🌤️", "⛅", "🌥️", "☁️", "🌦️", "🌧️", "⛈️", "🌩️", "🌨️",
      "❄️", "💨", "💧", "💦", "☔", "☂️", "🌊", "🌫️", "🌪️", "🌈",
      "🌕", "🌖", "🌗", "🌘", "🌑", "🌒", "🌓", "🌔", "🌙", "🌚",
      "🌝", "🌛", "🌜", "☀️", "🌞", "⭐", "🌟", "💫", "✨", "☄️",
      "🌠", "🌌", "🔭", "🪐", "🌍", "🌎", "🌏", "🗺️", "🧭", "🏔️"
    ]
  },
  {
    id: "travel",
    name: "Travel & Places",
    icon: Plane,
    emojis: [
      "✈️", "🛫", "🛬", "🛩️", "💺", "🚁", "🚀", "🛸", "🚂", "🚃",
      "🚄", "🚅", "🚆", "🚇", "🚈", "🚉", "🚊", "🚝", "🚞", "🚋",
      "🚌", "🚍", "🚎", "🚐", "🚑", "🚒", "🚓", "🚔", "🚕", "🚖",
      "🚗", "🚘", "🚙", "🛻", "🚚", "🚛", "🚜", "🏎️", "🏍️", "🛵",
      "🦽", "🦼", "🛺", "🚲", "🛴", "🛹", "🛼", "🚏", "🛤️", "🛣️",
      "⛽", "🏠", "🏡", "🏘️", "🏚️", "🏢", "🏣", "🏤", "🏥", "🏦",
      "🏨", "🏩", "🏪", "🏫", "🏬", "🏭", "🏯", "🏰", "💒", "🗼",
      "🗽", "⛪", "🕌", "🛕", "🕍", "⛩️", "🕋", "⛲", "⛺", "🌁"
    ]
  },
  {
    id: "objects",
    name: "Objects",
    icon: Key,
    emojis: [
      "⌚", "📱", "📲", "💻", "⌨️", "🖥️", "🖨️", "🖱️", "🖲️", "🕹️",
      "🗜️", "💽", "💾", "💿", "📀", "📼", "📷", "📸", "📹", "🎥",
      "📽️", "🎞️", "📞", "☎️", "📟", "📠", "📺", "📻", "🎙️", "🎚️",
      "🎛️", "🧭", "⏱️", "⏲️", "⏰", "🕰️", "⌛", "⏳", "📡", "🔋",
      "🔌", "💡", "🔦", "🕯️", "🧯", "🛢️", "💸", "💵", "💴", "💶",
      "💷", "🪙", "💰", "💳", "💎", "⚖️", "🪜", "🧰", "🪛", "🔧",
      "🔨", "⚒️", "🛠️", "⛏️", "🪚", "🔩", "⚙️", "🪤", "🧱", "⛓️",
      "🧲", "🔫", "💣", "🧨", "🪓", "🔪", "🗡️", "⚔️", "🛡️", "🚬"
    ]
  },
  {
    id: "symbols",
    name: "Symbols & Signs",
    icon: Flag,
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝",
      "💟", "☮️", "✝️", "☪️", "🕉️", "☸️", "✡️", "🔯", "🕎", "☯️",
      "☦️", "🛐", "⛎", "♈", "♉", "♊", "♋", "♌", "♍", "♎",
      "♏", "♐", "♑", "♒", "♓", "🆔", "⚛️", "🉑", "☢️", "☣️",
      "📴", "📳", "🈶", "🈚", "🈸", "🈺", "🈷️", "✴️", "🆚", "💮",
      "🉐", "㊙️", "㊗️", "🈴", "🈵", "🈹", "🈲", "🅰️", "🅱️", "🆎",
      "🆑", "🅾️", "🆘", "❌", "⭕", "🛑", "⛔", "📛", "🚫", "💯",
      "💢", "♨️", "🚷", "🚯", "🚳", "🚱", "🔞", "📵", "🚭", "❗",
      "❕", "❓", "❔", "‼️", "⁉️", "🔅", "🔆", "〽️", "⚠️", "🚸"
    ]
  },
  {
    id: "flags",
    name: "Flags",
    icon: Flag,
    emojis: [
      "🏁", "🚩", "🎌", "🏴", "🏳️", "🏳️‍🌈", "🏳️‍⚧️", "🏴‍☠️", "🇦🇫", "🇦🇽",
      "🇦🇱", "🇩🇿", "🇦🇸", "🇦🇩", "🇦🇴", "🇦🇮", "🇦🇶", "🇦🇬", "🇦🇷", "🇦🇲",
      "🇦🇼", "🇦🇺", "🇦🇹", "🇦🇿", "🇧🇸", "🇧🇭", "🇧🇩", "🇧🇧", "🇧🇾", "🇧🇪",
      "🇧🇿", "🇧🇯", "🇧🇲", "🇧🇹", "🇧🇴", "🇧🇦", "🇧🇼", "🇧🇷", "🇮🇴", "🇻🇬",
      "🇧🇳", "🇧🇬", "🇧🇫", "🇧🇮", "🇰🇭", "🇨🇲", "🇨🇦", "🇮🇨", "🇨🇻", "🇧🇶"
    ]
  }
];

export const EmojiPicker = ({ isOpen, onClose, onSelect }: EmojiPickerProps) => {
  const [selectedCategory, setSelectedCategory] = useState("smileys");
  const [searchQuery, setSearchQuery] = useState("");

  if (!isOpen) return null;

  const currentCategory = emojiCategories.find(c => c.id === selectedCategory) || emojiCategories[1];
  
  const filteredEmojis = searchQuery
    ? emojiCategories.flatMap(c => c.emojis).filter(emoji => emoji.includes(searchQuery))
    : currentCategory.emojis;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-background border border-border rounded-2xl shadow-2xl overflow-hidden z-50 animate-scale-in">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-gradient-to-r from-purple-500/10 to-pink-500/10">
        <span className="font-semibold text-sm">Emoji</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search emoji..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 rounded-full bg-muted/50"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <ScrollArea className="w-full">
        <div className="flex gap-1 p-2 border-b border-border">
          {emojiCategories.map((category) => {
            const IconComponent = category.icon;
            return (
              <button
                key={category.id}
                onClick={() => {
                  setSelectedCategory(category.id);
                  setSearchQuery("");
                }}
                className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-lg transition-all shrink-0",
                  selectedCategory === category.id
                    ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg"
                    : "hover:bg-muted text-muted-foreground"
                )}
                title={category.name}
              >
                <IconComponent className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Category Name */}
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/30">
        {searchQuery ? `Search Results (${filteredEmojis.length})` : currentCategory.name}
      </div>

      {/* Emoji Grid */}
      <ScrollArea className="h-64">
        <div className="grid grid-cols-8 gap-1 p-2">
          {filteredEmojis.map((emoji, index) => (
            <button
              key={`${emoji}-${index}`}
              onClick={() => {
                onSelect(emoji);
              }}
              className="flex items-center justify-center w-10 h-10 text-2xl hover:bg-muted rounded-lg transition-all hover:scale-125 active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
        {filteredEmojis.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No emojis found
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
