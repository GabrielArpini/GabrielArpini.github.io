(() => {
  const contents = document.querySelector('.toc');
  const headings = document.querySelectorAll('.essay h2[id]');
  if (!contents || headings.length === 0) return;

  const list = contents.querySelector('ol');
  for (const heading of headings) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#${encodeURIComponent(heading.id)}`;
    link.textContent = heading.textContent;
    item.append(link);
    list.append(item);
  }
  contents.hidden = false;
})();
