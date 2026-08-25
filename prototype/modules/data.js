export const chapters = {
  "chapter-1": { volume: "第一卷", number: 1, title: "雨夜", words: 1248, status: "草稿", content: ["雨从傍晚开始下，到午夜还没有停。", "林默撑着一把黑伞，沿着旧城区狭窄的街道往前走。路灯在雨幕里晕开一圈昏黄的光，积水倒映着两侧紧闭的店门。这里比他记忆中更安静，连远处高架桥上的车声都像隔着一层厚重的玻璃。", "巷口那家钟表店已经关了。褪色的招牌被风吹得轻轻摇晃，每一下都发出短促的吱呀声。林默抬头看了一眼时间，十一点四十七分，比约定的时间早了十三分钟。", "他没有立刻进去。", "雨水顺着伞骨滑落，在脚边汇成细小的水流。就在他准备点开手机时，巷子深处传来了一声脚步。很轻，像有人踩碎了一片被雨泡软的落叶。", "林默抬起头。巷子里空无一人。", "他慢慢地向巷子深处走去，雨水落在肩上。第二声脚步紧跟着响起，这一次，比刚才近了许多。"] },
  "chapter-2": { volume: "第一卷", number: 2, title: "来客", words: 2016, status: "草稿", content: ["清晨六点，门铃响了三次。", "林默没有睡。他坐在客厅的旧沙发上，看着窗外逐渐褪色的夜空。桌上的信封仍然没有拆开，边缘已经被潮湿的手指压出一道浅浅的折痕。", "第四次门铃响起时，他终于站了起来。门外的人没有出声，只在猫眼之外留下一道模糊的影子。", "“谁？”林默问。", "门外沉默了几秒。一个女人的声音隔着门板传来：“昨晚在巷子里，你看见他了，对吗？”"] },
  "chapter-3": { volume: "第一卷", number: 3, title: "旧照片", words: 386, status: "大纲", content: ["本章大纲：林默从信封中发现一张拍摄于二十年前的合影。照片里除了父亲，还有一个与昨夜巷中身影极其相似的人。", "关键转折：照片背后写着一个已经废弃的车站地址，以及一句“不要相信准时出现的人”。"] },
  "chapter-4": { volume: "第二卷", number: 4, title: "回声", words: 524, status: "大纲", content: ["本章大纲：旧车站里的广播每隔十分钟重复一段不存在于任何记录中的失踪通告。", "林默在通告里听见了自己的名字，而播报日期是三天以后。"] },
  "chapter-5": { volume: "第二卷", number: 5, title: "破晓", words: 0, status: "未开始", content: ["在这里开始书写新的章节……"] }
};

const demoChapterIds = ["chapter-1", "chapter-2", "chapter-3", "chapter-4", "chapter-5"];

export const projects = {
  myStory: { name: "myStory", bookTitle: "长夜", description: "一场持续二十年的雨，和一封不该准时送达的信。", chapters: 12, chapterIds: [...demoChapterIds], volumes: { "第一卷": "城市之夜", "第二卷": "黎明之前" } },
  starSea: { name: "星海纪元", bookTitle: "星海无声", description: "远航舰队在寂静星域发现来自未来的求救信号。", chapters: 8, chapterIds: [...demoChapterIds], volumes: { "第一卷": "离港", "第二卷": "深空回声" } },
  mistHarbor: { name: "雾港来信", bookTitle: "潮痕", description: "每封信都在退潮后出现，而寄信人已经失踪。", chapters: 5, chapterIds: [...demoChapterIds], volumes: { "第一卷": "潮来", "第二卷": "雾散" } }
};

export const projectConversations = {
  myStory: [{ id: "chapter", title: "第一章创作助手", updatedAt: "刚刚" }, { id: "world", title: "世界观讨论", updatedAt: "昨天" }, { id: "outline", title: "情节大纲推演", updatedAt: "周一" }],
  starSea: [{ id: "character", title: "主角设定讨论", updatedAt: "2 小时前" }, { id: "volume", title: "第一卷结构梳理", updatedAt: "周二" }],
  mistHarbor: [{ id: "clue", title: "线索一致性检查", updatedAt: "周三" }]
};

export const activeConversationByProject = { myStory: "chapter", starSea: "character", mistHarbor: "clue" };

export const globalConversations = [
  { id: "global-writing", title: "悬疑开场写作方法", updatedAt: "今天" },
  { id: "global-plan", title: "本周创作计划", updatedAt: "昨天" }
];
