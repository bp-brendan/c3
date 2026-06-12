with open('index.html', 'r') as f:
    content = f.read()

# 1. line 2408
content = content.replace('.sort((a, b) => a.d.localeCompare(b.d) || (a.t || \'\').localeCompare(b.t || \'\'))', '.sort(Visualist.sortAsc)')

# 2. line 2727 and 2732
content = content.replace('.sort((a, b) =>\n        b.d.localeCompare(a.d) || (a.t || \'\').localeCompare(b.t || \'\')\n      )', '.sort(Visualist.sortDesc)')
content = content.replace('.sort((a, b) =>\n      b.d.localeCompare(a.d) || (a.t || \'\').localeCompare(b.t || \'\')\n    )', '.sort(Visualist.sortDesc)')

# 3. line 2876
content = content.replace('.sort((a, b) => a.d.localeCompare(b.d) || (a.t || \'\').localeCompare(b.t || \'\'));', '.sort(Visualist.sortAsc);')

# 4. line 3052
# For today view, a.d is implicitly todayIso, so sorting by time then title is equivalent to sortAsc since d is the same.
content = content.replace('.sort((a, b) => (a.t || \'\').localeCompare(b.t || \'\'));', '.sort(Visualist.sortAsc);')

with open('index.html', 'w') as f:
    f.write(content)
