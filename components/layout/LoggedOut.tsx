import { fetchAndStoreToken } from "../../lib/auth";
import { AnimatedEurykaLogo } from "../shared/AnimatedEurykaLogo";

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
      <section className="ek-login-hero w-full max-w-[42rem] text-left">
        <AnimatedEurykaLogo className="h-20 w-auto text-foreground" />

        <div className="mb-8 mt-3 max-w-[610px]">
          <h1 className="scroll-m-20 text-5xl font-light tracking-tight md:text-6xl lg:text-7xl">
            /Imagine:
            <br />
            Everything | The Intersection of AI and Productivity
          </h1>
        </div>

        <button
          type="button"
          onClick={handleContinue}
          style={{ borderRadius: "var(--radius)" }}
          className="group/button inline-flex h-8 shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent bg-primary bg-clip-padding px-2.5 text-sm font-medium text-primary-foreground outline-none transition-all hover:bg-primary/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2"
        >
          Get Started
        </button>
      </section>
    </main>
  );
}
