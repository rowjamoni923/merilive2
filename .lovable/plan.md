# Home Live Card Visual Leak Fix

## Goal
Remove the unprofessional colored bottom screen, black strip, and border line from homepage host/live cards.

## Research notes
- Bigo Live public screenshots show feed cards as continuous media tiles with labels/actions floating over the image, not a separate heavy colored slab under the preview: https://www.apk4fun.com/screenshot/142809/
- Professional live-card pattern: keep the thumbnail as one uninterrupted surface; use subtle text legibility scrims only where text sits, with no hard divider/border between media and metadata.

## Fix plan
1. Keep the existing home-card layout and data behavior unchanged.
2. Replace the purple/blue bottom info panel with a transparent bottom readability scrim.
3. Remove the top border and inset shadow that created the black horizontal line.
4. Keep name, level, country, avatar, and call button in the same positions.
