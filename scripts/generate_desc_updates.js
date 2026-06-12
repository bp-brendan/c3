const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://avxlexkqcxamixyhyxcd.supabase.co';
const supabaseKey = 'sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Fetching all events from Supabase...");
    let allEvents = [];
    let start = 0;
    const limit = 1000;
    
    while (true) {
        const { data, error } = await supabase
            .from('events')
            .select('id, path, description')
            .range(start, start + limit - 1);
            
        if (error) {
            console.error("Error fetching:", error);
            break;
        }
        
        allEvents = allEvents.concat(data);
        if (data.length < limit) break;
        start += limit;
    }
    
    console.log(`Fetched ${allEvents.length} events from Supabase.`);
    
    const eventsByPath = {};
    for (const e of allEvents) {
        eventsByPath[e.path] = e;
    }
    
    let updates = [];
    const dir = '/Users/brendan/Documents/GitHub/c3/events';
    const htmlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html')).map(f => path.join(dir, f));
    console.log(`Found ${htmlFiles.length} HTML files.`);
    
    for (const file of htmlFiles) {
        const basename = path.basename(file);
        const eventPath = `events/${basename}`;
        
        const dbEvent = eventsByPath[eventPath];
        if (!dbEvent) continue;
        
        const html = fs.readFileSync(file, 'utf8');
        
        const descStart = html.indexOf('<div class="event-detail-description">');
        const descEnd = html.indexOf('</div>', descStart);
        if (descStart === -1 || descEnd === -1) continue;
        
        const newDesc = html.substring(descStart + 38, descEnd).trim();
        
        if (!dbEvent.description) continue;
        
        const cleanDbDesc = dbEvent.description.trim();
        if (newDesc.length > cleanDbDesc.length + 10) {
            updates.push({
                id: dbEvent.id,
                desc: newDesc
            });
        }
    }
    
    console.log(`Found ${updates.length} events that need description updates.`);
    
    if (updates.length > 0) {
        let sql = '-- Auto-generated updates to restore full descriptions\n';
        for (const u of updates) {
            const escaped = u.desc.replace(/'/g, "''");
            sql += `UPDATE events SET description = '${escaped}' WHERE id = '${u.id}';\n`;
        }
        
        fs.writeFileSync('/Users/brendan/.gemini/antigravity/brain/c5655e15-57d0-41d9-bebc-b66b45affcef/restore_descriptions.sql', sql);
        console.log("Wrote restore_descriptions.sql to artifacts!");
    }
}

main();
