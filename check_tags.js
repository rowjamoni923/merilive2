
import fs from 'fs';
const content = fs.readFileSync('src/components/call/ActiveCallScreen.tsx', 'utf8');

let stack = [];
let lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // Very naive tag finder, but helps
    let matches = line.matchAll(/<(div|motion\.div|AnimatePresence|BeautyFilterPanel|StickerOverlay|GiftPanel|FlyingGiftAnimation|AvatarWithFrame|LiveKitVideoPlayer|CaptionOverlay|NetworkQualityIndicator|ShieldCheck|BeansIcon|Lock|Mic|MicOff|Eye|EyeOff|Gift|Volume2|VolumeX|Maximize2|Minimize2|TrendingUp|SwitchCamera|MessageCircle|MoreVertical|Send|Sparkles|Smile|BrandedGiftIcon|PhoneOff|AvatarWithFrame|LiveKitVideoPlayer|PictureInPictureButton|AudioOnlyToggleButton|VideoQualityButton|NetworkQualityIndicator|CaptionOverlay|GiftPanel|FlyingGiftAnimation)(?:\s+[^>]*)?(\/?)>|<\/(div|motion\.div|AnimatePresence|BeautyFilterPanel|StickerOverlay|GiftPanel|FlyingGiftAnimation|AvatarWithFrame|LiveKitVideoPlayer|CaptionOverlay|NetworkQualityIndicator|ShieldCheck|BeansIcon|Lock|Mic|MicOff|Eye|EyeOff|Gift|Volume2|VolumeX|Maximize2|Minimize2|TrendingUp|SwitchCamera|MessageCircle|MoreVertical|Send|Sparkles|Smile|BrandedGiftIcon|PhoneOff|AvatarWithFrame|LiveKitVideoPlayer|PictureInPictureButton|AudioOnlyToggleButton|VideoQualityButton|NetworkQualityIndicator|CaptionOverlay|GiftPanel|FlyingGiftAnimation)>/g);

    for (const match of matches) {
        if (match[0].startsWith('</')) {
            let closingTag = match[3];
            if (stack.length === 0) {
                console.log(`Error: Unexpected closing tag </${closingTag}> at line ${i + 1}`);
            } else {
                let opening = stack.pop();
                if (opening.tag !== closingTag) {
                    console.log(`Error: Mismatched tag. Expected </${opening.tag}> but found </${closingTag}> at line ${i + 1}. Opening tag was at line ${opening.line}`);
                }
            }
        } else if (match[2] === '/') {
            // Self-closing, ignore
        } else {
            stack.push({ tag: match[1], line: i + 1 });
        }
    }
}

while (stack.length > 0) {
    let opening = stack.pop();
    console.log(`Error: Unclosed tag <${opening.tag}> at line ${opening.line}`);
}
