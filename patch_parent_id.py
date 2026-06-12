import re

with open('components.js', 'r') as f:
    content = f.read()

# I need to update the update_repl in components.js
parent_id_repl = """
        // the first time a submission flips to approved, publish it to events
        if (next.status === 'approved' && previousStatus !== 'approved') {
          const eventsToPublish = submissionToEvents(next);
          let parentEventId = null;
          for (let i = 0; i < eventsToPublish.length; i++) {
            let ev = eventsToPublish[i];
            if (parentEventId) {
                ev.parent_event_id = parentEventId;
            }
            const published = await publishEvent(ev);
            if (i === 0 && eventsToPublish.length > 1) {
                parentEventId = published.id;
            }
          }
        }
"""
content = re.sub(r'// the first time a submission flips to approved, publish it to events.*?(?=\} catch)', parent_id_repl, content, flags=re.DOTALL)

with open('components.js', 'w') as f:
    f.write(content)
