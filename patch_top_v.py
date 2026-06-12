import re

with open('index.html', 'r') as f:
    content = f.read()

top_v_repl = """
      const today = new Date('2026-06-12T00:00:00');
      const weekEnds = new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000);
      const startStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      const endStr = weekEnds.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      
      document.getElementById('view-this-week').insertAdjacentHTML('afterbegin', `
        <div class="week-peek" style="margin-bottom: 2rem;">
          <h2 class="event-date" style="margin-top: 0;">
            <a href="tag.html?tag=top-v" class="top-pick" style="margin-left: 0; font-size: 1.6rem; padding: 0.25em 0.5em; text-transform: none; text-decoration: none;">Top V</a>
          </h2>
          <p class="event-date-num" style="margin-top: 0.5rem; margin-bottom: 1rem;">The top 5 visual art events happening in Chicagoland ${startStr} – ${endStr}, published in collaboration with <a href="https://badatsports.com/author/visualist/" target="_blank" rel="noopener" class="inline-link">Bad at Sports</a>.</p>
          ${thumbRiverHtml(items)}
        </div>`);
"""

content = re.sub(r"document\.getElementById\('view-this-week'\)\.insertAdjacentHTML\('afterbegin', `.*?</div>`\);", top_v_repl.strip(), content, flags=re.DOTALL)

with open('index.html', 'w') as f:
    f.write(content)
