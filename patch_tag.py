import re

with open('tag.html', 'r') as f:
    content = f.read()

# Update script to style "Top V"
tag_repl = """
      const label = Visualist.tagLabel(tag);
      document.getElementById('tag-name').textContent = label;
      if (tag === 'top-v' || tag === 'top-pick') {
        const titleEl = document.querySelector('.tag-title');
        titleEl.classList.add('top-pick');
        titleEl.style.fontSize = '1.6rem';
        titleEl.style.padding = '0.25em 0.5em';
        titleEl.style.textTransform = 'none';
      }
"""

content = re.sub(r"document\.getElementById\('tag-name'\)\.textContent = Visualist\.tagLabel\(tag\);", tag_repl.strip(), content)

with open('tag.html', 'w') as f:
    f.write(content)
