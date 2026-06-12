import re

with open('admin.html', 'r') as f:
    content = f.read()

# 1. Add Quill CSS and JS
head_injection = """
  <link href="https://cdn.quilljs.com/1.3.6/quill.snow.css" rel="stylesheet">
  <script src="https://cdn.quilljs.com/1.3.6/quill.js"></script>
"""
content = content.replace('</head>', head_injection + '\n</head>')

# 2. Add initRichText function
init_func = """
    window.initRichText = (container) => {
      if (!container) return;
      const textareas = container.querySelectorAll('textarea[name="description"], textarea[name="x"]');
      textareas.forEach(ta => {
        if (ta.dataset.quillInitialized) return;
        ta.dataset.quillInitialized = 'true';
        ta.style.display = 'none';
        
        const editorContainer = document.createElement('div');
        editorContainer.style.minHeight = '150px';
        editorContainer.style.background = '#fff';
        editorContainer.style.color = '#000';
        ta.parentNode.insertBefore(editorContainer, ta.nextSibling);
        
        const quill = new Quill(editorContainer, {
          theme: 'snow',
          modules: {
            toolbar: [
              ['bold', 'italic', 'underline', 'strike'],
              ['link'],
              [{ 'list': 'bullet' }]
            ]
          }
        });
        
        quill.root.innerHTML = ta.value;
        
        quill.on('text-change', () => {
          ta.value = quill.root.innerHTML;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    };
"""
content = content.replace('const initAdmin = async () => {', init_func + '\n    const initAdmin = async () => {')

# 3. Call initRichText in renderQueue
content = content.replace('Visualist.openExternalLinks(queue);\n    };', 'Visualist.openExternalLinks(queue);\n      window.initRichText(queue);\n    };')

# 4. Call initRichText in renderEvents
content = content.replace('Visualist.openExternalLinks(eventList);\n    };', 'Visualist.openExternalLinks(eventList);\n      window.initRichText(eventList);\n    };')

# 5. Call initRichText for createForm
content = content.replace('renderEvents();\n  };', 'renderEvents();\n    window.initRichText(document.getElementById(\'create-form\'));\n  };')

with open('admin.html', 'w') as f:
    f.write(content)
