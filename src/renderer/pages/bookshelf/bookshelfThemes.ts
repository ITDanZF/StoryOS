export const BOOKSHELF_THEME_IDS = [
  "nocturne",
  "cosmos",
  "harbor",
  "parchment",
  "forest",
  "ember",
  "sakura",
  "glacier",
  "desert",
  "ink",
] as const;

export type BookshelfThemeId = typeof BOOKSHELF_THEME_IDS[number];

export type BookshelfThemeDecoration =
  | "rain"
  | "orbit"
  | "fog"
  | "fibers"
  | "canopy"
  | "embers"
  | "petals"
  | "facets"
  | "dunes"
  | "wash";

export type BookshelfTheme = {
  readonly id: BookshelfThemeId;
  readonly name: string;
  readonly description: string;
  readonly decoration: BookshelfThemeDecoration;
  readonly coverClassName: string;
  readonly textClassName: string;
  readonly mutedTextClassName: string;
  readonly numberClassName: string;
  readonly spineClassName: string;
};

export const BOOKSHELF_THEMES = {
  nocturne: {
    id: "nocturne",
    name: "长夜",
    description: "黑褐夜色与斜落雨线，适合悬疑和都市故事。",
    decoration: "rain",
    coverClassName: "bg-[linear-gradient(145deg,#49403a,#181918_68%,#8d5a35_155%)]",
    textClassName: "text-white",
    mutedTextClassName: "text-white/60",
    numberClassName: "text-white/20",
    spineClassName: "from-black/30 to-transparent",
  },
  cosmos: {
    id: "cosmos",
    name: "星海",
    description: "深蓝星域与环形轨道，适合科幻和宏大叙事。",
    decoration: "orbit",
    coverClassName: "bg-[linear-gradient(150deg,#17192b,#292952_56%,#765579)]",
    textClassName: "text-white",
    mutedTextClassName: "text-white/60",
    numberClassName: "text-white/20",
    spineClassName: "from-black/30 to-transparent",
  },
  harbor: {
    id: "harbor",
    name: "雾港",
    description: "青灰雾气与海面微光，适合奇幻和沿海故事。",
    decoration: "fog",
    coverClassName: "bg-[linear-gradient(155deg,#647b79,#2d4446_54%,#172629)]",
    textClassName: "text-white",
    mutedTextClassName: "text-white/60",
    numberClassName: "text-white/20",
    spineClassName: "from-black/30 to-transparent",
  },
  parchment: {
    id: "parchment",
    name: "素笺",
    description: "温暖纸张与细密纤维，适合历史和古典题材。",
    decoration: "fibers",
    coverClassName: "bg-[linear-gradient(145deg,#efe6d2,#cfb992_62%,#9b7651)]",
    textClassName: "text-stone-900",
    mutedTextClassName: "text-stone-800/60",
    numberClassName: "text-stone-900/20",
    spineClassName: "from-stone-900/20 to-transparent",
  },
  forest: {
    id: "forest",
    name: "森屿",
    description: "深林绿意与叶隙光斑，适合自然和成长故事。",
    decoration: "canopy",
    coverClassName: "bg-[linear-gradient(145deg,#55705e,#1f3b31_62%,#10251f)]",
    textClassName: "text-emerald-50",
    mutedTextClassName: "text-emerald-50/60",
    numberClassName: "text-emerald-50/20",
    spineClassName: "from-black/25 to-transparent",
  },
  ember: {
    id: "ember",
    name: "余烬",
    description: "暗红余温与漂浮火星，适合战争和冒险故事。",
    decoration: "embers",
    coverClassName: "bg-[linear-gradient(150deg,#612f2a,#2c1718_60%,#120e11)]",
    textClassName: "text-orange-50",
    mutedTextClassName: "text-orange-50/60",
    numberClassName: "text-orange-50/20",
    spineClassName: "from-black/30 to-transparent",
  },
  sakura: {
    id: "sakura",
    name: "花信",
    description: "灰粉晨光与轻盈花瓣，适合青春和情感故事。",
    decoration: "petals",
    coverClassName: "bg-[linear-gradient(145deg,#ead5d4,#b98691_58%,#68475d)]",
    textClassName: "text-white",
    mutedTextClassName: "text-white/65",
    numberClassName: "text-white/20",
    spineClassName: "from-rose-950/25 to-transparent",
  },
  glacier: {
    id: "glacier",
    name: "冰川",
    description: "冷蓝晶面与极地薄光，适合灾难和探索故事。",
    decoration: "facets",
    coverClassName: "bg-[linear-gradient(150deg,#b9d9df,#4c8192_55%,#203e52)]",
    textClassName: "text-white",
    mutedTextClassName: "text-white/65",
    numberClassName: "text-white/20",
    spineClassName: "from-slate-950/25 to-transparent",
  },
  desert: {
    id: "desert",
    name: "沙丘",
    description: "金褐沙脊与低垂日光，适合旅途和异域故事。",
    decoration: "dunes",
    coverClassName: "bg-[linear-gradient(155deg,#d8b47b,#9d673c_58%,#5b3729)]",
    textClassName: "text-amber-50",
    mutedTextClassName: "text-amber-50/65",
    numberClassName: "text-amber-50/20",
    spineClassName: "from-amber-950/25 to-transparent",
  },
  ink: {
    id: "ink",
    name: "墨境",
    description: "水墨晕染与留白层次，适合东方和哲思故事。",
    decoration: "wash",
    coverClassName: "bg-[linear-gradient(145deg,#e9e7df,#aca99f_58%,#555650)]",
    textClassName: "text-neutral-950",
    mutedTextClassName: "text-neutral-900/60",
    numberClassName: "text-neutral-950/20",
    spineClassName: "from-black/20 to-transparent",
  },
} as const satisfies Record<BookshelfThemeId, BookshelfTheme>;

export function getBookshelfTheme(themeId: BookshelfThemeId): BookshelfTheme {
  return BOOKSHELF_THEMES[themeId];
}

export function selectDefaultBookshelfTheme(bookId: string): BookshelfThemeId {
  let hash = 0;
  for (const character of bookId) {
    hash = ((hash * 31) + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return BOOKSHELF_THEME_IDS[hash % BOOKSHELF_THEME_IDS.length];
}
