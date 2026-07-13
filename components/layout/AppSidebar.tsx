/// <reference path="../../.wxt/wxt.d.ts" />

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  ChevronDown,
  ExternalLink,
  // Folder,
  History,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Zap,
} from "lucide-react";
import { useState } from "react";
import type { PageKey } from "../../lib/types";
import type { Workspace } from "../../lib/types";
import { Button } from "../shared/Button";

interface SidebarProps {
  currentPage: PageKey;
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  isOpen: boolean;
  onNavigate: (page: PageKey) => void;
  onSelectWorkspace: (id: string) => void;
  onClose: () => void;
  docked?: boolean;
}

interface NavRailProps {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  onOpenSidebar: () => void;
}

const BASE_URL = import.meta.env.WXT_BASE_URL as string;

declare const chrome: {
  tabs: {
    create: (createProperties: { url: string }) => Promise<unknown>;
  };
};

const NAV_ITEMS: { key: PageKey; label: string; icon: React.ReactNode }[] = [
  { key: "sparks", label: "Sparks", icon: <Zap size={16} /> },

  { key: "history", label: "History", icon: <History size={16} /> },
  {
    key: "annotations",
    label: "Annotations",
    icon: <MessageSquareText size={16} />,
  },
  // Collections access is temporarily disabled while the flow is revisited.
  // { key: "collections", label: "Collections", icon: <Folder size={16} /> },
];

// Permanent narrow icon rail — always visible on the left edge.
export function NavRail({ currentPage, onNavigate, onOpenSidebar }: NavRailProps) {
  return (
    <div className="flex w-11 flex-shrink-0 flex-col items-center border-r border-border bg-card">
      {/* Sidebar control — fixed height matches the header */}
      <div className="flex h-16 shrink-0 items-center justify-center border-b border-border">
        <Button
          variant="icon"
          size="icon-lg"
          title="Open sidebar"
          aria-label="Open sidebar"
          onClick={onOpenSidebar}
        >
          <PanelLeftOpen size={16} />
        </Button>
      </div>

      {/* Main nav */}
      <nav className="flex flex-1 flex-col items-center gap-1 py-3">
        {NAV_ITEMS.map(({ key, label, icon }) => (
          <Button
            key={key}
            variant={currentPage === key ? "secondary" : "icon"}
            size="icon-lg"
            title={label}
            onClick={() => onNavigate(key)}
          >
            {icon}
          </Button>
        ))}
      </nav>

      {/* Settings pinned to bottom */}
      <div className="flex h-[53px] shrink-0 flex-col items-center justify-center border-t border-border">
        <Button
          variant={currentPage === "settings" ? "secondary" : "icon"}
          size="icon-lg"
          title="Settings"
          onClick={() => onNavigate("settings")}
        >
          <Settings size={16} />
        </Button>
      </div>
    </div>
  );
}

// Full sidebar overlay — opened by the header toggle.
// Contains workspace switcher, nav with labels, and footer links.
export function AppSidebar({
  currentPage,
  workspaces,
  selectedWorkspaceId,
  isOpen,
  onNavigate,
  onSelectWorkspace,
  onClose,
  docked = false,
}: SidebarProps) {
  const shouldReduceMotion = useReducedMotion();
  const panelTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] as const };

  const allNavItems = [
    ...NAV_ITEMS,
    {
      key: "settings" as PageKey,
      label: "Settings",
      icon: <Settings size={16} />,
    },
  ];

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <>
          {!docked && (
            <motion.button
              type="button"
              aria-label="Close sidebar"
              className="fixed inset-0 z-40 border-0 bg-black/50 p-0"
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={panelTransition}
            />
          )}

          <motion.aside
            className={`z-50 flex w-56 shrink-0 flex-col overflow-hidden border-r border-border bg-card ${
              docked ? "relative h-screen" : "fixed inset-y-0 left-0"
            }`}
            initial={docked || shouldReduceMotion ? false : { width: 44 }}
            animate={{ width: 224 }}
            exit={{ width: 44 }}
            transition={panelTransition}
          >
            {!docked && (
              <div className="flex h-16 w-56 shrink-0 items-center justify-end border-b border-border px-3">
                <Button
                  variant="icon"
                  size="icon-md"
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                  onClick={onClose}
                >
                  <PanelLeftClose size={14} />
                </Button>
              </div>
            )}

            <motion.div
              className="flex min-h-0 w-56 flex-1 flex-col"
              initial={docked || shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.12, delay: 0.04 }}
            >
              {/* Workspace selector */}
              {workspaces.length > 0 && (
                <div className="border-b border-border px-3 py-3">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Workspace
                  </p>
                  <WorkspaceDropdown
                    workspaces={workspaces}
                    selectedId={selectedWorkspaceId}
                    onSelect={onSelectWorkspace}
                  />
                </div>
              )}

              {/* Nav with labels */}
              <nav className="flex-1 space-y-0.5 px-2 py-2">
                {allNavItems.map(({ key, label, icon }) => (
                  <Button
                    key={key}
                    variant={currentPage === key ? "secondary" : "ghost"}
                    size="md"
                    onClick={() => {
                      onNavigate(key);
                      if (!docked) onClose();
                    }}
                    className="w-full justify-start"
                  >
                    {icon}
                    {label}
                  </Button>
                ))}
              </nav>

              {/* Footer links */}
              <div className="space-y-0.5 border-t border-border px-2 pb-3 pt-2">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => chrome.tabs.create({ url: `${BASE_URL}/billing` })}
                  className="w-full justify-start"
                >
                  <ExternalLink size={14} />
                  Billing
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => chrome.tabs.create({ url: "https://euryka.ai/help/" })}
                  className="w-full justify-start"
                >
                  <ExternalLink size={14} />
                  Help
                </Button>
              </div>
            </motion.div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

interface WorkspaceDropdownProps {
  workspaces: Workspace[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function WorkspaceDropdown({
  workspaces,
  selectedId,
  onSelect,
}: WorkspaceDropdownProps) {
  const [open, setOpen] = useState(false);
  const selected = workspaces.find((w) => w.id === selectedId);

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        className="w-full justify-between bg-muted/60 hover:bg-muted"
      >
        <span className="truncate">
          {selected?.name ?? "Select workspace…"}
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close workspace selector"
            className="fixed inset-0 z-50 border-0 bg-transparent p-0"
            onClick={() => setOpen(false)}
          />
          <div className="ek-scroll absolute left-0 right-0 top-full z-[60] mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-xl">
            {workspaces.map((ws) => {
              const isSelected = ws.id === selectedId;
              return (
                <Button
                  key={ws.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onSelect(ws.id);
                    setOpen(false);
                  }}
                  className={`w-full justify-start text-left ${isSelected ? "text-foreground" : "text-foreground/70"}`}
                >
                  <span className="min-w-0 flex-1 truncate text-left">{ws.name}</span>
                  {isSelected && (
                    <Check
                      size={12}
                      className="ml-auto shrink-0 text-muted-foreground"
                    />
                  )}
                </Button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
