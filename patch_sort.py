import re

with open('components.js', 'r') as f:
    content = f.read()

time_value_func = """
  const timeValue = w => {
    if (!w) return 2400; // no time -> end of day
    const match = String(w).match(/(\\d{1,2})(?::(\\d{2}))?\\s*(AM|PM)/i);
    if (!match) return 2400;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2] || '0', 10);
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return hours * 100 + minutes;
  };

  const sortAsc = (a, b) => {
    return (a.d || '').localeCompare(b.d || '') || 
           (timeValue(a.w) - timeValue(b.w)) || 
           (a.t || '').localeCompare(b.t || '');
  };

  const sortDesc = (a, b) => {
    return (b.d || '').localeCompare(a.d || '') || 
           (timeValue(a.w) - timeValue(b.w)) || 
           (a.t || '').localeCompare(b.t || '');
  };
"""

# Insert the functions near timeBounds
content = content.replace('const timeBounds = value => {', time_value_func + '\n  const timeBounds = value => {')

# Export them in Visualist
export_repl = """
    timeValue,
    sortAsc,
    sortDesc,
    tagLabel,
"""
content = content.replace('tagLabel,\n    tagSlug,', export_repl.strip() + '\n    tagSlug,')

with open('components.js', 'w') as f:
    f.write(content)
