import { isRouteErrorResponse, useRouteError } from "react-router-dom";

export default function RouteErrorPage() {
  const error = useRouteError();
  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "页面加载失败";
  const message = error instanceof Error
    ? error.message
    : "StoryOS 暂时无法打开这个页面。";

  return (
    <main className="grid min-h-screen place-items-center bg-muted px-6 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-xl">
        <p className="m-0 text-xs font-medium uppercase tracking-[0.16em] text-text-subtle">StoryOS</p>
        <h1 className="mb-0 mt-3 text-xl font-semibold">{title}</h1>
        <p className="mb-0 mt-3 text-sm leading-6 text-muted-foreground">{message}</p>
        <a className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground no-underline hover:bg-primary" href="#/conversations">
          返回对话
        </a>
      </section>
    </main>
  );
}
