import os

def fix_file():
    file_path = 'src/components/call/ActiveCallScreen.tsx'
    with open(file_path, 'r') as f:
      lines = f.readlines()

    # Part 1: Fix top bar (lines ~712 to ~855)
    # Find the start and end of the top bar block
    start_idx = -1
    for i, line in enumerate(lines):
      if '{/* ===== TOP BAR - Ultra Premium Glassmorphic ===== */}' in line:
        start_idx = i
        break
    
    if start_idx != -1:
      # Find the main video view which follows it
      end_idx = -1
      for i in range(start_idx, len(lines)):
        if '{/* ===== MAIN VIDEO VIEW ===== */}' in line or '<div' in lines[i] and 'absolute inset-0 flex items-center justify-center' in lines[i]:
          end_idx = i
          break
      
      if end_idx != -1:
        # Reconstruct the top bar block
        # We'll just replace everything between start_idx and end_idx (exclusive)
        # Note: We need to find where the old block *truly* ended (the last })
        # But we'll just rewrite the whole thing based on our correct structure
        
        # We need the content between the start of the block and the right earnings
        # Actually, we can just replace the whole chunk.
        pass

    # Actually, it's easier to just write the specific sections correctly.
    # I'll use a more direct approach: find the opening markers and closing markers.
    
    content = "".join(lines)
    
    # 1. Fix Top Bar
    import re
    # Match from TOP BAR to MAIN VIDEO VIEW
    top_bar_pattern = re.compile(r'\{/\* ===== TOP BAR - Ultra Premium Glassmorphic ===== \*/\}.*?\{/\* ===== MAIN VIDEO VIEW ===== \*/\}', re.DOTALL)
    
    # Let's extract the dynamic parts (remoteUserName, connectionBadgeLabel, duration, etc.)
    # Or better, just fix the closing tags.
    
    # I'll just use string replacement on known broken parts.
    
    # Fix the top bar closing
    old_top_close = """                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )}"""
    # Recounting open tags for top bar:
    # {!isInNativePip && (  -> 1
    # <div ...safe-area-top> -> 2
    # <div ...mx-2>          -> 3
    # ... Children (Left info, Center, Right earnings) are closed correctly
    # ... Right earnings opens F, G, H. Closed H, G, F.
    # So we need to close 3, 2, 1.
    new_top_close = """                ))}
              </div>
            </div>
          </div>
        </div>
      )}"""
    
    content = content.replace(old_top_close, new_top_close)
    
    # Fix the bottom bar
    old_bottom_close = """          </div>
        </div>
      </div>
    )}"""
    # Open: {!isInNativePip && ( -> 1
    # <div ...safe-area-bottom> -> 2
    # <div ...px-2>             -> 3
    # <div ...gap-1.5>          -> 4
    # Close: 4, 3, 2, 1.
    new_bottom_close = """          </div>
        </div>
      </div>
    )}"""
    # Wait, 4-3-2-1 means 3 divs + one block.
    # Current has 3 divs + one block. So it's already correct?
    
    with open(file_path, 'w') as f:
      f.write(content)

fix_file()
