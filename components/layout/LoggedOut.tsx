import { fetchAndStoreToken } from "../../lib/auth";
import { AnimatedEurykaLogo } from "../shared/AnimatedEurykaLogo";
import { Button } from "../shared/Button";

export function LoggedOut() {
  const handleContinue = async () => {
    // Try a silent token fetch first (cookie-based auth)
    const token = await fetchAndStoreToken();
    if (!token) {
      // Open login page
      chrome.tabs.create({
        url: `${import.meta.env.WXT_BASE_URL}/login?redirect=ext`,
      });
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center overflow-y-auto bg-background px-[clamp(1.5rem,8vw,3.625rem)] py-[clamp(2rem,10vh,4.75rem)] text-foreground">
      <section className="w-full max-w-[42rem] text-left">
        <AnimatedEurykaLogo className="h-20 w-auto text-foreground" />

        <h1 className="mt-4 text-[clamp(3rem,10.15vw,4.5rem)] font-light leading-none tracking-tight">
          /Imagine:
          <br />
          Everything | The Intersection of AI and Productivity
        </h1>

        <Button variant="primary" size="lg" onClick={handleContinue} className="mt-9 px-3">
          Get Started
        </Button>
      </section>
    </main>
  );
}
