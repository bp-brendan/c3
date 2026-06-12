// Event-card thumbnails display at ~200px but were loading full uploads
// (~250KB each); swap any media/ card image to its 480px thumb
// (scripts/build_image_thumbs.py), falling back to the original if the
// thumb is missing. Self-contained: a MutationObserver catches cards from
// every render path (static markup, archive, tag pages) without touching
// the renderers.
(function () {
  const THUMB_RE = /^(\.\.\/)?media\//;

  const thumb480 = src => src
    .replace(/^((\.\.\/)?)media\//, '$1media/thumbs480/')
    .replace(/\.(png|jpe?g|gif|webp)$/i, '.jpg');

  const swap = img => {
    if (img.dataset.cardThumb) return;
    const src = img.getAttribute('src') || '';
    if (!THUMB_RE.test(src) || /\/thumbs/.test(src)) return;
    img.dataset.cardThumb = '1';
    img.addEventListener('error', () => { img.src = src; }, { once: true });
    img.src = thumb480(src);
  };

  const sweep = root => {
    (root.querySelectorAll ? root.querySelectorAll('.event-thumb img') : [])
      .forEach(swap);
    if (root.matches && root.matches('.event-thumb img')) swap(root);
  };

  new MutationObserver(mutations => {
    mutations.forEach(m => m.addedNodes.forEach(node => {
      if (node.nodeType === 1) sweep(node);
    }));
  }).observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => sweep(document));
  } else {
    sweep(document);
  }
})();
