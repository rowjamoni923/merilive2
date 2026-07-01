/// Filter-sheet tag catalog — 1:1 with `tagCategories` in
/// `src/pages/SearchUsers.tsx`. Kept in a single const list so the Flutter
/// sheet stays perfectly in sync with the web option surface.
class TagCategory {
  const TagCategory({required this.name, required this.icon, required this.tags});
  final String name;
  final String icon;
  final List<String> tags;
}

const kTagCategories = <TagCategory>[
  TagCategory(name: 'Preferences', icon: '💕', tags: [
    'Seeking chat friends',
    'Seeking short-term date',
    'Seeking a stable relationship',
    'Seeking a life partner',
    'Just browsing',
    'Looking for fun',
  ]),
  TagCategory(name: 'Personality', icon: '🎭', tags: [
    'Emotional', 'Rational', 'Introvert', 'Extrovert', 'Genial', 'Cute',
    'Aloof', 'Lively', 'Creative', 'Adventurous', 'Calm', 'Funny',
  ]),
  TagCategory(name: 'Profession', icon: '👤', tags: [
    'Merchant', 'IT', 'Teacher', 'Service personnel', 'Media person',
    'Farmer', 'Designer', 'Driver', 'Freelance', 'Student', 'Doctor', 'Engineer',
  ]),
  TagCategory(name: 'Constellation', icon: '♈', tags: [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
  ]),
  TagCategory(name: 'Hobbies', icon: '🎯', tags: [
    'Gourmet', 'Traveler', 'Film lover', 'Music', 'Reading',
    'Gaming', 'Photography', 'Dancing', 'Cooking', 'Fitness',
  ]),
  TagCategory(name: 'Sports', icon: '⚽', tags: [
    'Running', 'Football', 'Cricket', 'Basketball', 'Swimming',
    'Yoga', 'Badminton', 'Tennis',
  ]),
];
