import re

with open('styles.css', 'a') as f:
    f.write('''
/* ---- Skeleton UI ------------------------------------------- */
.skeleton { pointer-events: none; }
.skeleton-image {
  background: #e0e0e0;
  animation: pulse 1.5s infinite ease-in-out;
}
.skeleton-title {
  background: #e0e0e0;
  height: 1.5rem;
  width: 60%;
  margin-bottom: 0.5rem;
  animation: pulse 1.5s infinite ease-in-out;
}
.skeleton-text {
  background: #e0e0e0;
  height: 1rem;
  width: 90%;
  margin-bottom: 0.5rem;
  animation: pulse 1.5s infinite ease-in-out;
}
@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 0.3; }
  100% { opacity: 0.6; }
}
''')

skeleton_html = '''
        <article class="event-card skeleton">
          <div class="event-thumb skeleton-image" style="width: 150px; height: 150px;"></div>
          <div class="event-info">
            <h3 class="event-title skeleton-title"></h3>
            <p class="event-venue skeleton-text" style="width: 40%;"></p>
            <p class="event-description skeleton-text"></p>
            <p class="event-description skeleton-text" style="width: 70%;"></p>
          </div>
        </article>
'''

with open('index.html', 'r') as f:
    content = f.read()

content = content.replace('<div class="today-listing" id="today-results"></div>',
                          f'<div class="today-listing" id="today-results">{skeleton_html * 3}</div>')
content = content.replace('<div class="week-listing" id="week-results"></div>',
                          f'<div class="week-listing" id="week-results">{skeleton_html * 3}</div>')
content = content.replace('<div class="archive-listing" id="archive-results"></div>',
                          f'<div class="archive-listing" id="archive-results">{skeleton_html * 5}</div>')

with open('index.html', 'w') as f:
    f.write(content)
