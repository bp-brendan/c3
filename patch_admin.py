import re

with open('admin.html', 'r') as f:
    content = f.read()

# Hide nav on load
content = content.replace('<div data-visualist-nav></div>', '<div data-visualist-nav hidden></div>')

# Show nav on login
content = content.replace("document.getElementById('view-login').hidden = true;", 
                          "document.getElementById('view-login').hidden = true;\\n        document.querySelector('[data-visualist-nav]').hidden = false;")

# Logout listener
logout_listener = """
    window.addEventListener('hashchange', () => {
      if (location.hash === '#logout') {
        window.supabaseClient.auth.signOut().then(() => {
          location.hash = '';
          location.reload();
        });
      }
    });
"""
content = content.replace("Visualist.loadData(() => {", "Visualist.loadData(() => {" + logout_listener)

with open('admin.html', 'w') as f:
    f.write(content)
