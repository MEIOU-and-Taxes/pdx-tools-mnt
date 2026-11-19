import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocalSessionProvider } from "@/features/account/SessionProvider";
import { Tooltip } from "@/components/Tooltip";
import { Toaster } from "@/components/Toaster";
import { WebPage, FullscreenPage } from "@/components/layout";
import { Home } from "@/components/landing/Home";
import Eu5Ui from "@/features/eu5/Eu5Ui";
import { useSaveFileInput } from "@/features/engine/engineStore";
import "./style.css";

const client = new QueryClient();

function Viewer() {
  const input = useSaveFileInput();
  if (input?.kind === "eu5")
    return (
      <FullscreenPage>
        <Eu5Ui save={input.data} />
      </FullscreenPage>
    );
  return (
    <WebPage>
      <Home />
    </WebPage>
  );
}

export function mountViewer() {
  createRoot(document.getElementById("root")!).render(
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <QueryClientProvider client={client}>
        <LocalSessionProvider>
          <Tooltip.Provider delayDuration={300}>
            <Toaster />
            <Viewer />
          </Tooltip.Provider>
        </LocalSessionProvider>
      </QueryClientProvider>
    </BrowserRouter>,
  );
}
