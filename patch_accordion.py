import re

with open('components.js', 'r') as f:
    content = f.read()

# Wrap tagline styling in if (tagline)
tagline_repl = """
      if (tagline) {
        tagline.style.opacity = fade.toFixed(3);
        const scale = 1 - (1 - scaleTo) * p;
        tagline.style.transform = `translateY(${(taglineGlide * p).toFixed(2)}px) scale(${scale.toFixed(3)})`;
        tagline.style.transformOrigin = 'top center';
      }
"""

content = re.sub(r"      tagline\.style\.opacity = fade\.toFixed\(3\);\n      const scale = 1 - \(1 - scaleTo\) \* p;\n      tagline\.style\.transform = `translateY\(\$\{\(taglineGlide \* p\)\.toFixed\(2\)\}px\) scale\(\$\{scale\.toFixed\(3\)\}\)`;\n      tagline\.style\.transformOrigin = 'top center';", tagline_repl.strip(), content, flags=re.DOTALL)

with open('components.js', 'w') as f:
    f.write(content)
