export const state = {
  screen: "book",
  bookView: "editor",
  activeProjectId: "myStory",
  activeChapterId: "chapter-1",
  activeConversationScope: "project",
  configured: true
};

export function countCharacters(value) {
  return Array.from(value.replace(/\s/g, "")).length;
}

export function readDraft(chapters, id) {
  try {
    const draft = localStorage.getItem(`storyos-prototype:${id}`);
    return draft ? { ...chapters[id], ...JSON.parse(draft) } : chapters[id];
  } catch {
    return chapters[id];
  }
}

export function writeDraft(id, chapter) {
  localStorage.setItem(`storyos-prototype:${id}`, JSON.stringify(chapter));
}
