import re

with open('components.js', 'r') as f:
    content = f.read()

# 1. Update submissionFromRow
from_row_repl = """
  const submissionFromRow = row => ({
    id: row.id,
    status: row.status,
    sourceUrl: row.source_url || '',
    title: row.title || '',
    artists: splitList(row.artists),
    venue: row.venue || '',
    venueUrl: row.venue_url || '',
    address: row.address || '',
    mapUrl: row.map_url || '',
    neighborhood: row.neighborhood || '',
    listingType: row.listing_type || 'event',
    eventDate: row.event_date || '',
    eventStart: row.event_start || '',
    eventEnd: row.event_end || '',
    occurrences: typeof row.occurrences === 'string' ? JSON.parse(row.occurrences || '[]') : (row.occurrences || []),
    onViewText: row.on_view_text || '',
    imageUrl: row.image_url || '',
    detailUrl: row.detail_url || '',
    description: row.description || '',
    contactEmail: row.contact_email || '',
    tags: splitList(row.tags),
    submittedAt: row.submitted_at || '',
    approvedAt: row.approved_at || '',
    passedAt: row.passed_at || '',
    publishAt: row.publish_at || ''
  });
"""
content = re.sub(r'const submissionFromRow = row => \(\{.*?\}\);', from_row_repl, content, flags=re.DOTALL)

# 2. Update submissionToRow
to_row_repl = """
  const submissionToRow = submission => ({
    id: submission.id,
    status: submission.status,
    source_url: submission.sourceUrl || null,
    title: submission.title || null,
    artists: Array.isArray(submission.artists) ? submission.artists.join(', ') : null,
    venue: submission.venue || null,
    venue_url: submission.venueUrl || null,
    address: submission.address || null,
    map_url: submission.mapUrl || null,
    neighborhood: submission.neighborhood || null,
    listing_type: submission.listingType || null,
    event_date: submission.eventDate || null,
    event_start: submission.eventStart || null,
    event_end: submission.eventEnd || null,
    occurrences: Array.isArray(submission.occurrences) ? JSON.stringify(submission.occurrences) : null,
    on_view_text: submission.onViewText || null,
    image_url: submission.imageUrl || null,
    detail_url: submission.detailUrl || null,
    description: submission.description || null,
    contact_email: submission.contactEmail || null,
    tags: Array.isArray(submission.tags) ? submission.tags.join(', ') : null,
    submitted_at: submission.submittedAt || null,
    updated_at: new Date().toISOString(),
    approved_at: submission.approvedAt || null,
    passed_at: submission.passedAt || null,
    publish_at: submission.publishAt || null
  });
"""
content = re.sub(r'const submissionToRow = submission => \(\{.*?\}\);', to_row_repl, content, flags=re.DOTALL)

with open('components.js', 'w') as f:
    f.write(content)
