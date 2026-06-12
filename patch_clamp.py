import re

with open('components.js', 'r') as f:
    content = f.read()

# Add clamp-lines and description-fade-link
desc_repl = """
            ${event.x ? `<div class="event-description clamp-lines">
              ${event.x}
              <a href="${escapeHtml(Visualist.eventHref(event))}" class="description-fade-link" aria-label="Read more about ${escapeHtml(event.t || 'event')}"></a>
            </div>` : ''}
"""

content = re.sub(r"\$\{event\.x \? `<div class=\"event-description\">\\s*\$\{event\.x\}\\s*</div>` : ''\}", desc_repl.strip(), content)

with open('components.js', 'w') as f:
    f.write(content)

with open('styles.css', 'a') as f:
    f.write('''
.event-description.clamp-lines::after {
  content: "";
  position: absolute;
  bottom: 0;
  right: 0;
  width: 35%;
  height: 1.5em; /* matching line-height */
  background: linear-gradient(to right, transparent, var(--content-paper) 70%);
  pointer-events: none;
}
.description-fade-link {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 35%;
  height: 1.5em;
  z-index: 1;
  cursor: pointer;
  border: none !important;
  outline: none !important;
}
.description-fade-link:hover {
  background: transparent !important;
}
''')
