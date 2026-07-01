import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';

class ProfileEditorSheets {
  static Future<String?> showNicknameSheet(BuildContext context, String initialValue) {
    final controller = TextEditingController(text: initialValue);
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _BaseSheet(
        title: "Edit Nickname",
        child: Column(
          children: [
            TextField(
              controller: controller,
              maxLength: 20,
              autofocus: true,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                filled: true,
                fillColor: Colors.white.withOpacity(0.05),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                hintText: "Enter nickname",
                hintStyle: TextStyle(color: Colors.white.withOpacity(0.3)),
              ),
            ),
            const SizedBox(height: 24),
            _ActionButton(
              text: "Save",
              onPressed: () => Navigator.pop(context, controller.text),
            ),
          ],
        ),
      ),
    );
  }

  static Future<String?> showGenderSheet(BuildContext context) {
    return showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => _BaseSheet(
        title: "Select Gender",
        description: "Choose carefully! This selection is PERMANENT and cannot be changed later.",
        child: Column(
          children: [
            _GenderOption(
              label: "Male",
              icon: LucideIcons.user,
              color: Colors.blue,
              onTap: () => Navigator.pop(context, 'male'),
            ),
            const SizedBox(height: 12),
            _GenderOption(
              label: "Female",
              icon: LucideIcons.user,
              color: Colors.pink,
              subtitle: "Become a Host Account after selection",
              onTap: () => Navigator.pop(context, 'female'),
            ),
          ],
        ),
      ),
    );
  }

  static Future<int?> showAgeSheet(BuildContext context, int initialValue) {
    int selectedAge = initialValue;
    return showModalBottomSheet<int>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => _BaseSheet(
          title: "Select Age",
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _CircleButton(
                    icon: LucideIcons.minus,
                    onTap: () => setSheetState(() => selectedAge = (selectedAge > 18 ? selectedAge - 1 : 18)),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 40),
                    child: Text(
                      selectedAge.toString(),
                      style: GoogleFonts.outfit(color: Colors.white, fontSize: 48, fontWeight: FontWeight.bold),
                    ),
                  ),
                  _CircleButton(
                    icon: LucideIcons.plus,
                    onTap: () => setSheetState(() => selectedAge = (selectedAge < 100 ? selectedAge + 1 : 100)),
                  ),
                ],
              ),
              const SizedBox(height: 32),
              _ActionButton(
                text: "Confirm Age",
                onPressed: () => Navigator.pop(context, selectedAge),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static Future<String?> showLanguageSheet(BuildContext context, String? current, {bool isSecond = false}) {
    final languages = ["Bengali", "English", "Hindi", "Arabic", "Urdu", "Spanish", "French", "Chinese"];
    return showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => _BaseSheet(
        title: isSecond ? "Select Second Language" : "Select Primary Language",
        child: SizedBox(
          height: 400,
          child: GridView.builder(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 2.5,
            ),
            itemCount: languages.length + (isSecond ? 1 : 0),
            itemBuilder: (context, index) {
              if (isSecond && index == languages.length) {
                return _LangTile(label: "None", isSelected: current == null || current == "", onTap: () => Navigator.pop(context, ""));
              }
              final lang = languages[index];
              return _LangTile(label: lang, isSelected: current == lang, onTap: () => Navigator.pop(context, lang));
            },
          ),
        ),
      ),
    );
  }
}

class _BaseSheet extends StatelessWidget {
  final String title;
  final String? description;
  final Widget child;

  const _BaseSheet({required this.title, this.description, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(left: 24, right: 24, top: 24, bottom: MediaQuery.of(context).viewInsets.bottom + 32),
      decoration: const BoxDecoration(
        color: Color(0xFF0F172A),
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
        border: Border(top: BorderSide(color: Colors.white10)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 24),
          Text(title, style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          if (description != null) ...[
            const SizedBox(height: 8),
            Text(description!, textAlign: TextAlign.center, style: GoogleFonts.outfit(color: Colors.white54, fontSize: 13)),
          ],
          const SizedBox(height: 32),
          child,
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String text;
  final VoidCallback onPressed;
  const _ActionButton({required this.text, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 56,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF6366F1),
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          elevation: 0,
        ),
        child: Text(text, style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold)),
      ),
    );
  }
}

class _GenderOption extends StatelessWidget {
  final String label;
  final String? subtitle;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _GenderOption({required this.label, this.subtitle, required this.icon, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: color.withOpacity(0.2), shape: BoxShape.circle),
              child: Icon(icon, color: color),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  if (subtitle != null) Text(subtitle!, style: TextStyle(color: color.withOpacity(0.7), fontSize: 12)),
                ],
              ),
            ),
            Icon(LucideIcons.chevronRight, color: color.withOpacity(0.5)),
          ],
        ),
      ),
    );
  }
}

class _CircleButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _CircleButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle, border: Border.all(color: Colors.white10)),
        child: Icon(icon, color: Colors.white, size: 24),
      ),
    );
  }
}

class _LangTile extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;
  const _LangTile({required this.label, required this.isSelected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        alignment: Alignment.center,
        decoration: BoxDecoration(
          gradient: isSelected ? const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFFA855F7)]) : null,
          color: isSelected ? null : Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: isSelected ? Colors.white24 : Colors.white10),
        ),
        child: Text(label, style: GoogleFonts.outfit(color: Colors.white, fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
      ),
    );
  }
}


