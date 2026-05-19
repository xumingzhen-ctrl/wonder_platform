export function parseXhsMarkdown(markdown: string): string[] {
  if (!markdown) return [];

  // If user explicitly uses --- to paginate, respect it
  if (markdown.includes('---')) {
    return markdown
      .split(/\n---\n?/)
      .map((page) => page.trim())
      .filter(Boolean);
  }

  // Auto-pagination logic based on H2 (##)
  // We want to group an H2 and its following content into one page
  const lines = markdown.split('\n');
  const pages: string[] = [];
  let currentPageLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // If we hit an H2, and we already have content in the current page,
    // start a new page
    if (line.startsWith('## ') && currentPageLines.length > 0) {
      // Check if current page has actual content, not just empty lines
      if (currentPageLines.some((l) => l.trim().length > 0)) {
        pages.push(currentPageLines.join('\n'));
      }
      currentPageLines = [line];
    } else {
      currentPageLines.push(line);
    }
  }

  if (currentPageLines.length > 0 && currentPageLines.some((l) => l.trim().length > 0)) {
    pages.push(currentPageLines.join('\n'));
  }

  return pages;
}
