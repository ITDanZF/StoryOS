import { createHashRouter, redirect } from "react-router-dom";
import WorkspaceLayout from "../layouts/workspace/WorkspaceLayout.tsx";
import InstanceGate from "../features/instances/InstanceGate.tsx";
import InstancePage from "../features/instances/InstancePage.tsx";
import AboutPage from "../pages/about/AboutPage.tsx";
import BookshelfPage from "../pages/bookshelf/BookshelfPage.tsx";
import BookshelfTrashPage from "../pages/bookshelf/trash/BookshelfTrashPage.tsx";
import ConversationPage from "../pages/conversation/ConversationPage.tsx";
import BookWorkspacePage from "../pages/book/BookWorkspacePage.tsx";
import SettingsPage from "../pages/settings/SettingsPage.tsx";
import RouteErrorPage from "../pages/404/RouteErrorPage.tsx";
import DeveloperPage from "../pages/developer/DeveloperPage.tsx";

export const router = createHashRouter([
  ...(import.meta.env.DEV
    ? [
        {
          path: "/developer",
          Component: DeveloperPage,
          ErrorBoundary: RouteErrorPage,
        },
      ]
    : []),
  {
    path: "/",
    Component: InstanceGate,
    ErrorBoundary: RouteErrorPage,
    children: [
      { path: "instances", Component: InstancePage },
      {
        Component: WorkspaceLayout,
        children: [
          {
            index: true,
            loader: () => redirect("/conversations"),
          },
          {
            path: "conversations/:threadId?",
            Component: ConversationPage,
          },
          {
            path: "bookshelf",
            Component: BookshelfPage,
          },
          {
            path: "bookshelf/trash",
            Component: BookshelfTrashPage,
          },
          {
            path: "bookshelf/:bookId/read",
            lazy: async () => ({
              Component: (await import("../pages/reader/BookReaderPage.tsx"))
                .default,
            }),
          },
          {
            path: "projects/:projectId/book",
            Component: BookWorkspacePage,
          },
          {
            path: "settings",
            Component: SettingsPage,
          },
          {
            path: "about",
            Component: AboutPage,
          },
          {
            path: "agent",
            loader: () => redirect("/conversations"),
          },
          {
            path: "*",
            loader: () => redirect("/conversations"),
          },
        ],
      },
    ],
  },
]);
