import type {
  BookTransferFormat,
  BookTransferFormatCapability,
} from '../bookTransferContracts.ts';

const FORMATS: readonly BookTransferFormatCapability[] = Object.freeze([
  Object.freeze({
    id: 'storyos',
    label: 'StoryOS 完整备份',
    description: '完整保留书籍结构、状态和全部修订历史，适合迁移与恢复。',
    extensions: Object.freeze(['storyos-book']),
    canImport: true,
    canExport: true,
    preservesStructure: true,
    preservesRichText: true,
    preservesRevisions: true,
    outputKind: 'file',
  }),
  Object.freeze({
    id: 'docx',
    label: 'Word 文稿',
    description: '适合与编辑和出版社交换，保留卷章和段落，复杂排版会降级。',
    extensions: Object.freeze(['docx']),
    canImport: true,
    canExport: true,
    preservesStructure: true,
    preservesRichText: false,
    preservesRevisions: false,
    outputKind: 'file',
  }),
  Object.freeze({
    id: 'markdown',
    label: 'Markdown',
    description: '开放、可读并适合版本管理，可导出单文件或结构化 ZIP。',
    extensions: Object.freeze(['md', 'zip']),
    canImport: true,
    canExport: true,
    preservesStructure: true,
    preservesRichText: false,
    preservesRevisions: false,
    outputKind: 'archive',
  }),
  Object.freeze({
    id: 'text',
    label: '纯文本',
    description: '兼容性最高，根据卷章标题识别结构，只保留纯文本。',
    extensions: Object.freeze(['txt']),
    canImport: true,
    canExport: true,
    preservesStructure: true,
    preservesRichText: false,
    preservesRevisions: false,
    outputKind: 'file',
  }),
  Object.freeze({
    id: 'epub',
    label: 'EPUB 电子书',
    description: '适合电子书阅读器和发布预览，仅支持导出。',
    extensions: Object.freeze(['epub']),
    canImport: false,
    canExport: true,
    preservesStructure: true,
    preservesRichText: true,
    preservesRevisions: false,
    outputKind: 'file',
  }),
  Object.freeze({
    id: 'pdf',
    label: 'PDF 阅读版',
    description: '适合打印、定稿与分享，仅支持导出。',
    extensions: Object.freeze(['pdf']),
    canImport: false,
    canExport: true,
    preservesStructure: true,
    preservesRichText: true,
    preservesRevisions: false,
    outputKind: 'file',
  }),
]);

export function listBookTransferFormats(): readonly BookTransferFormatCapability[] {
  return FORMATS;
}

export function getBookTransferFormat(format: BookTransferFormat): BookTransferFormatCapability {
  const capability = FORMATS.find((candidate) => candidate.id === format);
  if (!capability) throw new Error(`Unsupported book transfer format: ${format}`);
  return capability;
}

export function detectBookTransferFormat(filePath: string): Exclude<BookTransferFormat, 'epub' | 'pdf'> {
  const extension = filePath.split('.').pop()?.toLocaleLowerCase('en-US') ?? '';
  const capability = FORMATS.find((candidate) =>
    candidate.canImport && candidate.extensions.includes(extension));
  if (!capability || capability.id === 'epub' || capability.id === 'pdf') {
    throw new Error(`Unsupported book import extension: .${extension || '(none)'}`);
  }
  return capability.id;
}
