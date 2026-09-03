import { createBrowserRouter, createMemoryRouter, Navigate, RouteObject } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { ChatIndex, ChatLayout, chatLayoutLoader } from './pages/ChatLayout';
import { ConversationPage, conversationLoader } from './pages/ConversationPage';

export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/chat" replace /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/chat',
    element: <ChatLayout />,
    loader: chatLayoutLoader,
    children: [
      { index: true, element: <ChatIndex /> },
      { path: ':conversationId', element: <ConversationPage />, loader: conversationLoader },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
export const createTestRouter = (initialEntries: string[]) => createMemoryRouter(routes, { initialEntries });
