import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import { GraphPage } from "./pages/GraphPage";
import { MigrationPage } from "./pages/MigrationPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <MigrationPage />,
  },
  {
    path: "/graph",
    element: <GraphPage />,
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
