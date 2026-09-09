import { getBookshelfTheme, selectDefaultBookshelfTheme } from "../pages/bookshelf/bookshelfThemes.ts";
import "./bookCoverArtwork.css";

export default function BookCoverArtwork({ bookId, title }: { bookId: string; title: string }) {
  const theme = getBookshelfTheme(selectDefaultBookshelfTheme(bookId));
  return <div className={`book-cover-art ${theme.coverClassName} ${theme.textClassName}`} data-cover-art={bookId}>
    <div className="book-cover-art-border" />
    <span className="book-cover-art-edition">STORYOS · 私人藏书</span>
    <span className="book-cover-art-emblem">S</span>
    <strong className="book-cover-art-title">{title}</strong>
    <span className="book-cover-art-bottom">每一个故事，都值得慢慢阅读。</span>
  </div>;
}
