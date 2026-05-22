import { fetchAndStoreToken } from "../../lib/auth";
import { useTheme } from "../../hooks/use-theme";
import { Button } from "../shared/Button";
import logo from "../../assets/ek-icon.svg";
import blackLogo from "../../assets/ek-icon-black.svg";

const BASE_URL = import.meta.env.WXT_BASE_URL as string;

export function LoggedOut() {
  const theme = useTheme();
  const displayLogo = theme === "light" ? blackLogo : logo;

  const handleContinue = async () => {
    // Try a silent token fetch first (cookie-based auth)
    const token = await fetchAndStoreToken();
    if (!token) {
      // Open login page
      chrome.tabs.create({ url: `${BASE_URL}/login?redirect=ext` });
    }
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <img src={displayLogo} alt="" className="h-16 w-16" draggable={false} />
        <div className="text-4xl font-bold text-foreground">Euryka</div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your AI Swiss Army Knife. Sign in to get started.
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Button
          variant="primary"
          size="lg"
          onClick={handleContinue}
          className="w-full rounded-lg"
        >
          Continue
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => chrome.tabs.create({ url: `${BASE_URL}/integrations/chrome-ext` })}
          className="w-full rounded-lg text-muted-foreground"
        >
          Learn more
        </Button>
      </div>
    </div>
  );
}
