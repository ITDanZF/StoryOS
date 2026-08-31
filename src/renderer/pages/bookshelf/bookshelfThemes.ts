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
    decoration: "rain",
    coverClassName: "bg-[linear-gradient(145deg,#49403a,#181918_68%,#8d5a35_155%)]",
    textClassName: "text-white",
    mutedTextClassName: "text-white/60",
    numberClassName: "text-white/20",
    spineClassName: "from-black/30 to-transparent",
  },
  cosmos: {
    id: "cosmos",
    decoration: "orbit",
    coverClassName: "bg-[linear-gradient(150deg,#17192b,#292952_56%,#765579)]",
    textClassName: "text-white",
    mutedTextClassName: "text-white/60",
    numberClassName: "text-white/20",
    spineClassName: "from-black/30 to-transparent",
  },
  harbor: {
    id: "harbor",
    decoration: "fog",
    coverClassName: "bg-[linear-gradient(155deg,#647b79,#2d4446_54%,#172629)]",
    textClassName: "text-white",
    mutedTextClassName: "text-white/60",
    numberClassName: "text-white/20",
    spineClassName: "from-black/30 to-transparent",
  },
  parchment: {
    id: "parchment",
    decoration: "fibers",
    coverClassName: "bg-[linear-gradient(145deg,#efe6d2,#cfb992_62%,#9b7651)]",
    textClassName: "text-stone-900",
    mutedTextClassName: "text-stone-800/60",
    numberClassName: "text-stone-900/20",
    spineClassName: "from-stone-900/20 to-transparent",
  },
  forest: {
    id: "forest",
    decoration: "canopy",
    coverClassName: "bg-[linear-gradient(145deg,#55705e,#1f3b31_62%,#10251f)]",
    textClassName: "text-emerald-50",
    mutedTextClassName: "text-emerald-50/60",
    numberClassName: "text-emerald-50/20",
    spineClassName: "from-black/25 to-transparent",
  },
  ember: {
    id: "ember",
    decoration: "embers",
    coverClassName: "bg-[linear-gradient(150deg,#612f2a,#2c1718_60%,#120e11)]",
    textClassName: "text-orange-50",
    mutedTextClassName: "text-orange-50/60",
    numberClassName: "text-orange-50/20",
    spineClassName: "from-black/30 to-transparent",
  },
  sakura: {
    id: "sakura",
    decoration: "petals",
    coverClassName: "bg-[linear-gradient(145deg,#ead5d4,#b98691_58%,#68475d)]",
    textClassName: "text-white",
    mutedTextClassName: "text-white/65",
    numberClassName: "text-white/20",
    spineClassName: "from-rose-950/25 to-transparent",
  },
  glacier: {
    id: "glacier",
    decoration: "facets",
    coverClassName: "bg-[linear-gradient(150deg,#b9d9df,#4c8192_55%,#203e52)]",
    textClassName: "text-white",
    mutedTextClassName: "text-white/65",
    numberClassName: "text-white/20",
    spineClassName: "from-slate-950/25 to-transparent",
  },
  desert: {
    id: "desert",
    decoration: "dunes",
    coverClassName: "bg-[linear-gradient(155deg,#d8b47b,#9d673c_58%,#5b3729)]",
    textClassName: "text-amber-50",
    mutedTextClassName: "text-amber-50/65",
    numberClassName: "text-amber-50/20",
    spineClassName: "from-amber-950/25 to-transparent",
  },
  ink: {
    id: "ink",
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
