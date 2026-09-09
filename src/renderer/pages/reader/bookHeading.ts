export function bookHeading(title: string) {
  const match = title.match(/^(第[零〇一二三四五六七八九十百千万两0-9０-９]+[章节卷部篇集回])(?:[\s·•.、:：—-]+)(.+)$/u);
  return match ? { number: match[1], title: match[2] } : { number: "", title };
}

