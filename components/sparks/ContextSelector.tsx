import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { Brand, Project } from "../../lib/types";

interface Props {
  brands: Brand[];
  projects: Project[];
  selectedBrandId: string | null;
  selectedProjectId: string | null;
  onSelectBrand: (id: string | null) => void;
  onSelectProject: (id: string | null) => void;
}

// Hierarchical brand → project picker. Mirrors the original v1 ContextSelector:
//   • Each brand is a group header (clickable to select brand-only).
//   • Brand's projects are nested below it (indented).
//   • Projects whose `brands` array is empty or references unknown brands fall
//     into a final "Other Projects" group, which selects with brand=null.
//   • Clicking the currently-selected entry clears it (toggle).
//   • Selection model in our store:
//       brand-only    → selectedBrandId=X, selectedProjectId=null
//       brand+project → selectedBrandId=X, selectedProjectId=Y
//       other project → selectedBrandId=null, selectedProjectId=Y
export function ContextSelector({
  brands,
  projects,
  selectedBrandId,
  selectedProjectId,
  onSelectBrand,
  onSelectProject,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // NOTE: all hooks must be called unconditionally — the early-return for the
  // empty state is at the bottom of the hook section, after every useMemo.
  const term = search.trim().toLowerCase();

  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const selectedBrand = selectedBrandId ? (brandById.get(selectedBrandId) ?? null) : null;
  const selectedProject = selectedProjectId
    ? (projects.find((p) => p.id === selectedProjectId) ?? null)
    : null;

  const brandGroups = useMemo(() => {
    const matchesStr = (name: string) => !term || name.toLowerCase().includes(term);
    return brands
      .map((brand) => {
        const brandProjects = projects
          .filter((p) => p.brands?.includes(brand.id))
          .sort((a, b) => a.name.localeCompare(b.name));
        const visibleProjects = matchesStr(brand.name)
          ? brandProjects
          : brandProjects.filter((p) => matchesStr(p.name));
        return {
          brand,
          projects: visibleProjects,
          visible: matchesStr(brand.name) || visibleProjects.length > 0,
        };
      })
      .filter((g) => g.visible)
      .sort((a, b) => a.brand.name.localeCompare(b.brand.name));
  }, [brands, projects, term]);

  const otherProjects = useMemo(() => {
    const matchesStr = (name: string) => !term || name.toLowerCase().includes(term);
    return projects
      .filter((p) => !p.brands?.some((id) => brandById.has(id)))
      .filter((p) => matchesStr(p.name))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, brandById, term]);

  const hasResults = brandGroups.length > 0 || otherProjects.length > 0;

  // Early return AFTER all hooks — safe to conditionally render here.
  if (brands.length === 0 && projects.length === 0) {
    return (
      <a
        href="https://app.euryka.ai/ws/brandhub"
        target="_blank"
        rel="noreferrer"
        className="rounded-md border border-border bg-muted/60 px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-border/70 hover:bg-accent"
      >
        Create Brand or Projects
      </a>
    );
  }

  // Display label: "Brand / Project" when both, single when only one
  const label =
    selectedBrand && selectedProject
      ? `${selectedBrand.name} / ${selectedProject.name}`
      : (selectedBrand?.name ?? selectedProject?.name ?? "Select Brand or Project");
  const hasSelection = !!(selectedBrand || selectedProject);

  const clear = () => {
    onSelectBrand(null);
    onSelectProject(null);
    setOpen(false);
  };

  const pickBrand = (brand: Brand) => {
    // Toggle off if already brand-only-selected
    if (selectedBrandId === brand.id && !selectedProjectId) {
      clear();
      return;
    }
    onSelectBrand(brand.id);
    onSelectProject(null);
    setOpen(false);
  };

  const pickProject = (project: Project, brandIdForContext: string | null) => {
    // Toggle off if already exact selection
    if (selectedProjectId === project.id && (selectedBrandId ?? null) === brandIdForContext) {
      clear();
      return;
    }
    onSelectBrand(brandIdForContext);
    onSelectProject(project.id);
    setOpen(false);
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-full items-center gap-2 rounded-md border border-border bg-muted/60 px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-border/70 hover:bg-accent"
      >
        <span className="max-w-[220px] truncate" title={label}>
          {label}
        </span>
        {hasSelection ? (
          <span
            role="button"
            aria-label="Clear context"
            onClick={(e) => {
              e.stopPropagation();
              clear();
            }}
            className="-mr-0.5 flex h-4 w-4 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground/80"
          >
            <X size={11} />
          </span>
        ) : (
          <ChevronDown
            size={13}
            className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-[60] mt-1 w-[min(18rem,calc(100vw-4rem))] overflow-hidden rounded-md border border-border bg-card shadow-xl">
            {/* Search */}
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search
                  size={12}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search brands / projects…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded bg-muted px-2 py-1.5 pl-7 text-xs text-foreground/80 placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
                />
              </div>
            </div>

            <div className="ek-scroll max-h-72 overflow-y-auto py-1">
              {!hasResults ? (
                <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                  No brand / project found.
                </p>
              ) : (
                <>
                  {brandGroups.map(({ brand, projects: brandProjects }) => {
                    const brandSelected = selectedBrandId === brand.id && !selectedProjectId;
                    return (
                      <div key={brand.id} className="py-1">
                        {/* Brand row */}
                        <button
                          type="button"
                          onClick={() => pickBrand(brand)}
                          title={brand.name}
                          className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs font-medium transition-colors hover:bg-accent ${
                            brandSelected ? "text-foreground" : "text-foreground/80"
                          }`}
                        >
                          <span className="truncate">{brand.name}</span>
                          {brandSelected && (
                            <Check size={12} className="shrink-0 text-muted-foreground" />
                          )}
                        </button>

                        {/* Nested projects */}
                        {brandProjects.map((project) => {
                          const projectSelected =
                            selectedBrandId === brand.id && selectedProjectId === project.id;
                          return (
                            <button
                              key={`${brand.id}-${project.id}`}
                              type="button"
                              onClick={() => pickProject(project, brand.id)}
                              title={`${brand.name} / ${project.name}`}
                              className={`flex w-full items-center justify-between gap-2 py-1.5 pl-7 pr-3 text-left text-xs transition-colors hover:bg-accent ${
                                projectSelected ? "text-foreground" : "text-muted-foreground"
                              }`}
                            >
                              <span className="truncate">{project.name}</span>
                              {projectSelected && (
                                <Check size={12} className="shrink-0 text-muted-foreground" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}

                  {otherProjects.length > 0 && (
                    <div className="border-t border-border py-1">
                      <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Other Projects
                      </p>
                      {otherProjects.map((project) => {
                        const projectSelected =
                          !selectedBrandId && selectedProjectId === project.id;
                        return (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => pickProject(project, null)}
                            title={project.name}
                            className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent ${
                              projectSelected ? "text-foreground" : "text-foreground/70"
                            }`}
                          >
                            <span className="truncate">{project.name}</span>
                            {projectSelected && (
                              <Check size={12} className="shrink-0 text-muted-foreground" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
