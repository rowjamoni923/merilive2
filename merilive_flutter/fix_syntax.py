import os

def replace_in_files(directory, replacements):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.dart'):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    new_content = content
                    for old, new in replacements.items():
                        new_content = new_content.replace(old, new)
                    
                    if new_content != content:
                        with open(filepath, 'w', encoding='utf-8') as f:
                            f.write(new_content)
                        print(f"Updated: {filepath}")
                except Exception as e:
                    print(f"Error processing {filepath}: {e}")

if __name__ == "__main__":
    lib_dir = "i:/ami-tomar-jonno-62e3a48a/merilive_flutter/lib"
    replacements = {
        'blursize:': 'blurRadius:',
        'spreadsize:': 'spreadRadius:',
        'CircleAvatar(size: 24': 'CircleAvatar(radius: 12',
        'CircleAvatar(size: 20': 'CircleAvatar(radius: 10',
        'CircleAvatar(size: 30': 'CircleAvatar(radius: 15',
    }
    replace_in_files(lib_dir, replacements)
