import { createHashRouter, redirect } from "react-router-dom";
import WorkspaceLayout from "../layouts/workspace/WorkspaceLayout.tsx";
import AboutPage from "../pages/about/AboutPage.tsx";
import ConversationPage from "../pages/conversation/ConversationPage.tsx";
import BookWorkspacePage from "../pages/book/BookWorkspacePage.tsx";
import SettingsPage from "../pages/settings/SettingsPage.tsx";
import RouteErrorPage from "../pages/404/RouteErrorPage.tsx";

export const router = createHashRouter([
  {
    path: "/",
    Component: WorkspaceLayout,
    ErrorBoundary: RouteErrorPage,
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
]);
