
import { execSync } from 'child_process';
import { readdirSync, statSync, unlinkSync } from 'fs';
import { join, extname, basename } from 'path';

const ASSETS_DIR = 'src/assets/stickers';

async function optimizeStickers() {
  const files = readdirSync(ASSETS_DIR);
  let totalSaved = 0;

  for (const file of files) {
    if (extname(file).toLowerCase() === '.png') {
      const inputPath = join(ASSETS_DIR, file);
      const outputName = basename(file, '.png') + '.webp';
      const outputPath = join(ASSETS_DIR, outputName);

      const oldSize = statSync(inputPath).size;
      
      console.log(`Optimizing ${file}... (${(oldSize / 1024 / 1024).toFixed(2)} MB)`);

      try {
        // Use imagemagick via nix to convert to webp with good compression
        execSync(`nix run nixpkgs#imagemagick -- convert "${inputPath}" -quality 75 "${outputPath}"`);
        
        const newSize = statSync(outputPath).size;
        totalSaved += (oldSize - newSize);
        
        console.log(`  Done: ${(newSize / 1024 / 1024).toFixed(2)} MB (Saved ${((oldSize - newSize) / 1024 / 1024).toFixed(2)} MB)`);
        
        // Remove original png to save space in the final build
        unlinkSync(inputPath);
      } catch (err) {
        console.error(`  Failed to optimize ${file}:`, err);
      }
    }
  }

  console.log(`\nOptimization Complete! Total Space Saved: ${(totalSaved / 1024 / 1024).toFixed(2)} MB`);
}

optimizeStickers().catch(console.error);
