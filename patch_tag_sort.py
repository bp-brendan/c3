with open('tag.html', 'r') as f:
    content = f.read()

content = content.replace('.sort((a, b) => (a.t || \'\').localeCompare(b.t || \'\'))', '.sort(Visualist.sortAsc)')
content = content.replace('.sort((a, b) => isMonthPage\n            ? b.d.localeCompare(a.d) || (a.t || \'\').localeCompare(b.t || \'\')\n            : a.d.localeCompare(b.d) || (a.t || \'\').localeCompare(b.t || \'\')\n          )', '.sort((a, b) => isMonthPage ? Visualist.sortDesc(a, b) : Visualist.sortAsc(a, b))')

with open('tag.html', 'w') as f:
    f.write(content)
