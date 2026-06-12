import re

with open('index.html', 'r') as f:
    content = f.read()

filter_repl = """
      monthIndexShowing = false;
      archiveFiltered = archiveEvents.filter(event => {
        const text = `${event.t || ''} ${event.v || ''} ${(event.g || []).join(' ')}`.toLowerCase();
        if (from && to && from === to) {
            return (!q || text.includes(q)) && event.d === from &&
              (!activeTags.size || [...activeTags].every(slug => eventTagSlugs(event).has(slug)));
        }
        return (!q || text.includes(q)) &&
          (!from || eventEnd(event) >= from) &&
          (!to || event.d <= to) &&
          (!activeTags.size || [...activeTags].every(slug => eventTagSlugs(event).has(slug)));
      });
"""

content = re.sub(r"      monthIndexShowing = false;\n      archiveFiltered = archiveEvents\.filter\(event => \{\n        const text = `\$\{event\.t \|\| ''\} \$\{event\.v \|\| ''\} \$\{\(event\.g \|\| \[\]\)\.join\(' '\)\}`\.toLowerCase\(\);\n        return \(\!q \|\| text\.includes\(q\)\) &&\n          \(\!from \|\| eventEnd\(event\) >= from\) &&\n          \(\!to \|\| event\.d <= to\) &&\n          \(\!activeTags\.size \|\| \[\.\.\.activeTags\]\.every\(slug => eventTagSlugs\(event\)\.has\(slug\)\)\);\n      \}\);", filter_repl.strip(), content, flags=re.DOTALL)

with open('index.html', 'w') as f:
    f.write(content)
