import re

with open('admin.html', 'r') as f:
    content = f.read()

# We need to inject Javascript for handling occurrences
js_additions = """
    window.addOccurrence = (id) => {
      const container = document.getElementById(`occurrences-${id}`);
      const occId = Math.random().toString(36).slice(2, 8);
      const html = `
        <div class="occurrence-row" id="occ-${occId}" style="display: flex; gap: 10px; align-items: end; margin-bottom: 10px;">
          <label class="submit-field" style="flex: 1;">
            <span>Date</span>
            <input type="date" name="occDate" required>
          </label>
          <label class="submit-field" style="flex: 1;">
            <span>Start</span>
            <input type="time" name="occStart">
          </label>
          <label class="submit-field" style="flex: 1;">
            <span>End</span>
            <input type="time" name="occEnd">
          </label>
          <button type="button" class="form-button" onclick="document.getElementById('occ-${occId}').remove()" style="margin-bottom: 5px;">X</button>
        </div>
      `;
      container.insertAdjacentHTML('beforeend', html);
    };

    window.renderOccurrences = (id, occurrences) => {
      const container = document.getElementById(`occurrences-${id}`);
      if (!container) return;
      container.innerHTML = '';
      (occurrences || []).forEach(occ => {
        const occId = Math.random().toString(36).slice(2, 8);
        const html = `
          <div class="occurrence-row" id="occ-${occId}" style="display: flex; gap: 10px; align-items: end; margin-bottom: 10px;">
            <label class="submit-field" style="flex: 1;">
              <span>Date</span>
              <input type="date" name="occDate" value="${escapeHtml(occ.date)}" required>
            </label>
            <label class="submit-field" style="flex: 1;">
              <span>Start</span>
              <input type="time" name="occStart" value="${escapeHtml(occ.start)}">
            </label>
            <label class="submit-field" style="flex: 1;">
              <span>End</span>
              <input type="time" name="occEnd" value="${escapeHtml(occ.end)}">
            </label>
            <button type="button" class="form-button" onclick="document.getElementById('occ-${occId}').remove()" style="margin-bottom: 5px;">X</button>
          </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
      });
    };
"""

content = content.replace("    const blankSubmission = () => ({", js_additions + "\n    const blankSubmission = () => ({")

# In formPatch, we need to extract occurrences
formPatch_replacement = """
    const formPatch = form => {
      const data = new FormData(form);
      const address = String(data.get('address') || '').trim();
      
      const occDates = data.getAll('occDate');
      const occStarts = data.getAll('occStart');
      const occEnds = data.getAll('occEnd');
      const occurrences = occDates.map((d, i) => ({
        date: d,
        start: occStarts[i] || '',
        end: occEnds[i] || ''
      }));

      return {
        sourceUrl: data.get('sourceUrl'),
        title: data.get('title'),
        venue: data.get('venue'),
        venueUrl: data.get('venueUrl'),
        address,
        mapUrl: data.get('mapUrl') || mapUrlForAddress(address),
        neighborhood: data.get('neighborhood'),
        listingType: data.get('listingType'),
        eventDate: data.get('eventDate'),
        eventStart: data.get('eventStart'),
        eventEnd: data.get('eventEnd'),
        occurrences: occurrences,
        onViewText: data.get('onViewText'),
        imageUrl: data.get('imageUrl'),
        detailUrl: data.get('detailUrl'),
        description: data.get('description'),
        contactEmail: data.get('contactEmail'),
        artists: data.get('artists'),
        tags: data.get('tags'),
        publishAt: localDatetimeToIso(data.get('publishAt'))
      };
    };
"""

content = re.sub(r'const formPatch = form => \{.*?\};', formPatch_replacement, content, flags=re.DOTALL)

with open('admin.html', 'w') as f:
    f.write(content)
