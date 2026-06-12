const fs = require('fs');
const lines = fs.readFileSync('/Users/brendan/Documents/visualist/data/processed/events.ndjson', 'utf-8').split('\n');
for (const line of lines) {
  if (line.includes('Katherine Ratay')) {
    const e = JSON.parse(line);
    console.log("Title:", e.title);
    console.log("Date:", e.event_date || e.published_at);
    console.log("Description HTML:");
    console.log(e.description_html);
    console.log("-------------------");
  }
}
