# Flying Name Bar Professional Fit Fix

## Goal
Make Flying Name Bar previews and in-room effects feel like one engraved animation unit: animation + avatar + level + name move together and fit the ribbon, not as oversized separated HTML pieces.

## Research notes
- Bigo/Chamet-style entrance effects use a wide ribbon/canvas with user identity composited into designer-authored slots; the user data is treated as part of the entrance effect, not an independent badge row.
- SVGA's web player supports runtime replacement of keyed image/text elements (`setImage`, `setText`) before playback; when templates lack usable keys, the fallback must still place identity inside the same moving composite container.
- Professional pattern: avatar is the primary left slot, level is a small attached chip on the avatar/frame layer, and name/subtext occupy the adjacent text layer; level should not be a separate full-size flex item between avatar and name.

## Fix plan
1. Keep existing SVGA/VAP playback and admin-upload support unchanged.
2. Move preview animation + fallback identity overlay into a single animated composite wrapper.
3. Reduce the identity safe-area height and attach the level chip to the avatar.
4. Apply the same slot sizing to in-room Flying Name Bar so VIP, Shop, Live, and Party match.
