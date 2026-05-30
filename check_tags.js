
import fs from 'fs';

const content = fs.readFileSync('src/pages/AgencyDashboard.tsx', 'utf-8');
let depth = 0;
const stack = [];
const lines = content.split('\n');

lines.forEach((line, i) => {
  const openMatches = line.match(/<([A-Z][a-zA-Z0-9]*|div|span|section|header|footer|ul|li|button|a|p|h[1-6]|Fragment|svg|path|label|input|textarea|select|option|Badge|Card|Tabs|Dialog)[^>]*[^/]>|<>/g) || [];
  const closeMatches = line.match(/<\/([A-Z][a-zA-Z0-9]*|div|span|section|header|footer|ul|li|button|a|p|h[1-6]|Fragment|svg|path|label|input|textarea|select|option|Badge|Card|Tabs|Dialog)>|<\/>/g) || [];
  
  openMatches.forEach(tag => {
    const tagName = tag.match(/<([A-Z][a-zA-Z0-9]*|div|span|section|header|footer|ul|li|button|a|p|h[1-6]|Fragment|svg|path|label|input|textarea|select|option|Badge|Card|Tabs|Dialog)/)?.[1] || 'Fragment';
    stack.push({ name: tagName, line: i + 1 });
    depth++;
  });
  
  closeMatches.forEach(tag => {
    const tagName = tag.match(/<\/([A-Z][a-zA-Z0-9]*|div|span|section|header|footer|ul|li|button|a|p|h[1-6]|Fragment|svg|path|label|input|textarea|select|option|Badge|Card|Tabs|Dialog)/)?.[1] || 'Fragment';
    const last = stack.pop();
    if (last && last.name !== tagName) {
      console.log(`Mismatched tag at line ${i + 1}: expected ${last.name} (opened at ${last.line}), found ${tagName}`);
    }
    depth--;
  });
});

if (stack.length > 0) {
  console.log('Unclosed tags:');
  stack.forEach(s => console.log(`  ${s.name} at line ${s.line}`));
} else {
  console.log('All tags balanced');
}
