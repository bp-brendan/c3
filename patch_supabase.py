import re

with open('supabaseClient.js', 'r') as f:
    content = f.read()

# Update limit_to_2026
content = content.replace("q.gte('event_date', '2026-01-01').lte('event_date', '2026-12-31')",
                          "q.gte('event_date', '2024-01-01').lte('event_date', '2026-12-31')")

# Add sessionStorage caching for events
fetch_block = """
      let events = null;
      let eventsError = null;
      
      const cacheKey = isAdmin ? 'cached_events_admin' : 'cached_events_list';
      try {
        const cachedStr = sessionStorage.getItem(cacheKey);
        if (cachedStr) events = JSON.parse(cachedStr);
      } catch (e) {}

      if (!events) {
        const fetchRows = window.Visualist.fetchPagedRows
          ? queryFactory => window.Visualist.fetchPagedRows(queryFactory)
          : async queryFactory => {
            const { data, error } = await queryFactory().limit(1000);
            return { data: data || [], error };
          };
        if (!isAdmin) {
          ({ data: events, error: eventsError } = await fetchRows(() => buildQuery('events_list', '*', true)));
        }
        if (isAdmin || eventsError || !events || !events.length) {
          ({ data: events, error: eventsError } = await fetchRows(() => buildQuery('events', '*', false)));
          if (eventsError) console.error('Error fetching events:', eventsError);
        }
        
        if (events && !eventsError) {
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(events));
          } catch (e) {}
        }
      }
"""

content = re.sub(r"      let events = null;\n      let eventsError = null;.*?if \(eventsError\) console\.error\('Error fetching events:', eventsError\);\n      }", fetch_block.strip(), content, flags=re.DOTALL)

with open('supabaseClient.js', 'w') as f:
    f.write(content)
