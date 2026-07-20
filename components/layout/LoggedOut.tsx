import { fetchAndStoreToken } from "../../lib/auth";
import { AnimatedEurykaLogo } from "../shared/AnimatedEurykaLogo";
import { Button } from "../shared/Button";
import { EurykaWordmark } from "../shared/EurykaWordmark";

export function LoggedOut() {
  const handleContinue = async () => {
    // Try a silent token fetch first (cookie-based auth)
    const token = await fetchAndStoreToken();
    if (!token) {
      // Open login page
      chrome.tabs.create({ url: `${BASE_URL}/login?redirect=ext` });
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 bg-background px-6 text-center">
      <div className="flex items-center justify-center gap-3">
        <AnimatedEurykaLogo className="h-16 w-auto text-foreground" />
        <EurykaWordmark className="h-10 w-auto text-foreground" />
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button variant="primary" size="lg" onClick={handleContinue} className="px-4">
          Get Started
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => chrome.tabs.create({ url: "https://euryka.ai/" })}
          className="h-10 px-2 text-muted-foreground underline underline-offset-4 hover:bg-transparent hover:text-foreground"
        >
          Learn more
        </Button>
      </div>
    </div>
  );
}
