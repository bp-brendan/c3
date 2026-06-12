import re

with open('components.js', 'r') as f:
    content = f.read()

# Add submissionToEvents
submissionToEvents_str = """
  const submissionToEvents = submission => {
    const clean = cleanSubmission(submission);
    
    // Create a base event factory
    const createBaseEvent = (start, timeStr) => {
      const end = clean.exhibitionEnd;
      const tagValues = [
        ...clean.tags,
        ...clean.artists,
        clean.venue,
        clean.neighborhood,
        clean.title
      ].map(tagSlug).filter(Boolean);
      const event = {
        t: clean.title || 'Untitled',
        u: clean.sourceUrl || `admin.html#${clean.id}`,
        p: clean.detailUrl || '',
        v: clean.venue,
        vu: clean.venueUrl,
        d: start,
        g: [...new Set(tagValues)],
        i: clean.imageUrl,
        x: clean.description,
        w: timeStr,
        a: clean.address,
        m: clean.mapUrl || mapUrlForAddress(clean.address),
        _submitted: true,
        _submittedId: clean.id
      };
      if (clean.onViewText) event.o = clean.onViewText;
      else if (end) event.o = `On view through ${dateLabel(end)}`;
      return event;
    };

    if (clean.occurrences && clean.occurrences.length > 0) {
      return clean.occurrences.map(occ => {
        const timeStr = occ.start && occ.end ? `${occ.start} – ${occ.end}` : (occ.start || '');
        return createBaseEvent(occ.date, timeStr);
      });
    }

    // the listed date is the opening reception when there is one, otherwise the
    // first day of the run (an exhibition with no opening reads as "no opening")
    const start = clean.eventDate || clean.exhibitionStart;
    const time = clean.eventStart && clean.eventEnd
      ? `${clean.eventStart} – ${clean.eventEnd}`
      : (clean.eventStart || '');
    return [createBaseEvent(start, time)];
  };
"""

content = content.replace("  const submissionToEvent = submission => {", submissionToEvents_str + "\n  const submissionToEvent = submission => {")

# Update updateSubmittedEvent to handle array of events
update_repl = """
        // the first time a submission flips to approved, publish it to events
        if (next.status === 'approved' && previousStatus !== 'approved') {
          const eventsToPublish = submissionToEvents(next);
          const parentEventId = crypto.randomUUID ? crypto.randomUUID() : null; // Generate a common parent_id or use the first event as parent? Actually just insert all.
          for (let ev of eventsToPublish) {
            await publishEvent(ev);
          }
        }
"""
content = re.sub(r'// the first time a submission flips to approved, publish it to events\s*if \(next\.status === \'approved\' && previousStatus !== \'approved\'\) \{\s*await publishEvent\(submissionToEvent\(next\)\);\s*\}', update_repl, content)

with open('components.js', 'w') as f:
    f.write(content)

