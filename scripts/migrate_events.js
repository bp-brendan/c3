const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase Client using the service_role key to bypass RLS
const supabaseUrl = 'https://avxlexkqcxamixyhyxcd.supabase.co';
// WARNING: Never commit your service_role key. Use an environment variable.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'REPLACE_WITH_YOUR_SERVICE_ROLE_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
    console.log('Starting migration...');
    
    // Read the taglines
    try {
        const taglinesContent = fs.readFileSync(path.join(__dirname, '../taglines.js'), 'utf-8');
        // Extract array using a simple regex since it's just a JS file
        const match = taglinesContent.match(/const TAGLINES = (\[.*?\]);/s);
        if (match) {
            const taglines = eval(match[1]); // Safe since it's just local strings
            const taglinesData = taglines.map(t => ({ content: t, is_active: true }));
            
            const { data, error } = await supabase
                .from('taglines')
                .insert(taglinesData);
                
            if (error) console.error('Error inserting taglines:', error);
            else console.log(`Successfully inserted ${taglines.length} taglines.`);
        }
    } catch (err) {
        console.error('Failed to read or insert taglines:', err);
    }

    // Read the events from events.ndjson
    try {
        const ndjsonPath = path.join(process.env.HOME, 'Documents/visualist/data/processed/events.ndjson');
        console.log('Reading from:', ndjsonPath);
        const fileContent = fs.readFileSync(ndjsonPath, 'utf-8');
        const lines = fileContent.split('\n').filter(line => line.trim() !== '');
        
        const formattedEvents = [];
        for (const line of lines) {
            try {
                const e = JSON.parse(line);
                const event_date = e.event_date || e.published_at.split('T')[0];
                const image_url = e.images && e.images.length > 0 ? e.images[0].url : '';
                const time_window = e.opening_text || (e.opening_start_time_raw ? `${e.opening_start_time_raw} - ${e.opening_end_time_raw}` : '');
                
                formattedEvents.push({
                    title: e.title,
                    permalink: e.legacy_url || e.source_url,
                    path: e.slug,
                    venue: e.venue_name,
                    event_date: event_date,
                    image_url: image_url,
                    description: e.description_html || e.yoast_description || e.description_text,
                    tags: e.tags || [],
                    time_window: time_window,
                    venue_url: e.venue_url || e.official_url,
                    address: e.address,
                    map_url: e.map_url,
                    on_view_through: e.on_view_text || e.on_view_until,
                    top_pick: false // By default false, not tracked explicitly in ndjson schema outside of possible tags
                });
            } catch (err) {
                console.error('Failed to parse line:', err.message);
            }
        }

        console.log(`Parsed ${formattedEvents.length} events. Starting batch insert...`);

        // Insert in batches of 1000 to avoid payload size limits
        const BATCH_SIZE = 1000;
        for (let i = 0; i < formattedEvents.length; i += BATCH_SIZE) {
            const batch = formattedEvents.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
                .from('events')
                .insert(batch);
            
            if (error) {
                console.error(`Error inserting batch ${i} to ${i + BATCH_SIZE}:`, error);
            } else {
                console.log(`Successfully inserted events ${i} to ${i + batch.length}`);
            }
        }
        console.log('Finished event migration.');
    } catch (err) {
        console.error('Failed to read or insert events:', err);
    }
}

migrate();
