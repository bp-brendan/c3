with open('styles.css', 'a') as f:
    f.write('''
/* User request: non-blue links with outline and darker color */
.event-description a,
.inline-link {
  color: var(--content-ink);
  text-decoration: none;
  outline: 1px solid var(--content-ink);
  padding: 0.1em 0.2em;
  border-radius: 2px;
}
.event-description a:hover,
.inline-link:hover {
  background: #eeeeee;
}
''')
