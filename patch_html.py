import os
import re

for filename in os.listdir('.'):
    if filename.endswith('.html'):
        with open(filename, 'r') as f:
            content = f.read()
        
        # Add theme color if not exists
        if '<meta name="theme-color"' not in content:
            content = content.replace('<head>', '<head>\\n  <meta name="theme-color" content="#1c1c1c">')
            
        with open(filename, 'w') as f:
            f.write(content)

# Update styles.css for tag-title font size
with open('styles.css', 'r') as f:
    css = f.read()

css = css.replace('font-size: clamp(2rem, 8vw, 7rem);', 'font-size: clamp(2rem, 5vw, 4rem);')

with open('styles.css', 'w') as f:
    f.write(css)

