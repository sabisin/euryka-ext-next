import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Check,
  ChevronDown,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  Pilcrow,
  Save,
  Strikethrough,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { repairMarkdownForDisplay } from "../../lib/markdown";
import { Button } from "../shared/Button";

interface Props {
  content: string;
  saved: boolean;
  onChange: (markdown: string) => void;
  onSave: (markdown: string) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  compact?: boolean;
  autoFocus?: boolean;
}

const BLOCK_FORMATS = [
  { value: "paragraph", label: "Normal text", icon: Pilcrow },
  { value: "h1", label: "Heading 1", icon: Heading1 },
  { value: "h2", label: "Heading 2", icon: Heading2 },
  { value: "h3", label: "Heading 3", icon: Heading3 },
] as const;

export function MarkdownAnnotationEditor({
  content,
  saved,
  onChange,
  onSave,
  onDelete,
  compact = false,
  autoFocus = false,
}: Props) {
  const [isBlockMenuOpen, setIsBlockMenuOpen] = useState(false);
  const editorShellRef = useRef<HTMLDivElement>(null);
  const repairedContent = repairMarkdownForDisplay(content);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({
        markedOptions: {
          gfm: true,
          breaks: true,
        },
      }),
    ],
    content: repairedContent,
    contentType: "markdown",
    autofocus: autoFocus,
    editorProps: {
      attributes: {
        class: `prose prose-sm w-full max-w-none px-3 py-3 text-foreground/80 outline-none ${
          compact ? "min-h-28 max-h-44 overflow-y-auto" : "min-h-[360px]"
        }`,
        "aria-label": "Annotation note",
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      onChange(nextEditor.getMarkdown());
    },
  });

  const editorState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive("bold") ?? false,
      italic: currentEditor?.isActive("italic") ?? false,
      strike: currentEditor?.isActive("strike") ?? false,
      bulletList: currentEditor?.isActive("bulletList") ?? false,
      empty: currentEditor?.isEmpty ?? true,
    }),
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getMarkdown() === repairedContent) return;
    editor.commands.setContent(repairedContent, {
      contentType: "markdown",
      emitUpdate: false,
    });
  }, [editor, repairedContent]);

  const save = () => {
    if (!editor || saved) return;
    void onSave(editor.getMarkdown());
  };

  const runCommand = (command: () => void) => {
    setIsBlockMenuOpen(false);
    command();
  };

  const setBlock = (value: (typeof BLOCK_FORMATS)[number]["value"]) => {
    if (!editor) return;
    const { from, to, $head } = editor.state.selection;
    const selectedRange = { from, to };

    if (value === "paragraph") {
      runCommand(() =>
        editor
          .chain()
          .focus()
          .setTextSelection($head.pos)
          .setParagraph()
          .setTextSelection(selectedRange)
          .run()
      );
      return;
    }
    const level = Number(value.slice(1)) as 1 | 2 | 3;
    runCommand(() =>
      editor
        .chain()
        .focus()
        .setTextSelection($head.pos)
        .toggleHeading({ level })
        .setTextSelection(selectedRange)
        .run()
    );
  };

  const toolbar = (
    <div
      className={`flex shrink-0 items-center justify-between bg-background px-4 py-2.5 ${
        compact ? "border-t" : "border-b"
      } border-border`}
    >
      <div className="flex items-center gap-px">
        <div className="relative mr-1 border-r border-border pr-2">
          <Button
            variant="icon"
            size="icon-sm"
            title="Text style"
            aria-haspopup="menu"
            aria-expanded={isBlockMenuOpen}
            onMouseDown={(event) => {
              event.preventDefault();
              setIsBlockMenuOpen((open) => !open);
            }}
            className="w-9 gap-0.5"
          >
            <Pilcrow size={13} />
            <ChevronDown size={10} />
          </Button>

          {isBlockMenuOpen && (
            <div
              className={`absolute left-0 z-20 min-w-32 overflow-hidden rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg ${
                compact ? "bottom-7" : "top-7"
              }`}
            >
              {BLOCK_FORMATS.map((format) => {
                const Icon = format.icon;
                return (
                  <button
                    key={format.value}
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setBlock(format.value);
                    }}
                  >
                    <Icon size={13} />
                    <span>{format.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <EditorButton
          title="Bold"
          active={editorState?.bold}
          onRun={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold size={13} />
        </EditorButton>
        <EditorButton
          title="Italic"
          active={editorState?.italic}
          onRun={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic size={13} />
        </EditorButton>
        <EditorButton
          title="Strikethrough"
          active={editorState?.strike}
          onRun={() => editor?.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={13} />
        </EditorButton>
        <EditorButton
          title="Bullet list"
          active={editorState?.bulletList}
          onRun={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List size={13} />
        </EditorButton>
      </div>

      <div className="flex items-center gap-px">
        <Button
          variant="icon"
          size="icon-sm"
          title={saved ? "Saved" : "Save"}
          onClick={save}
          disabled={saved || !editor}
          className={saved ? "text-success" : undefined}
        >
          {saved ? <Check size={12} /> : <Save size={12} />}
        </Button>
        {onDelete && (
          <Button
            variant="destructive"
            size="icon-sm"
            title="Delete"
            onClick={() => void onDelete()}
          >
            <Trash2 size={12} />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={editorShellRef}
      className="flex h-full min-h-0 flex-col"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        save();
      }}
    >
      {!compact && toolbar}

      <div className={`ek-scroll min-h-0 flex-1 overflow-y-auto ${compact ? "p-0" : "px-4 py-4"}`}>
        <div
          className={`relative border-border/70 bg-background focus-within:border-muted-foreground/45 ${compact ? "min-h-28" : "min-h-[360px] rounded-md border"}`}
        >
          {editorState?.empty && (
            <p className="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground/40">
              Write a note...
            </p>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>
      {compact && toolbar}
    </div>
  );
}

function EditorButton({
  title,
  active,
  onRun,
  children,
}: {
  title: string;
  active?: boolean;
  onRun: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={active ? "secondary" : "icon"}
      size="icon-sm"
      title={title}
      aria-pressed={active}
      onMouseDown={(event) => {
        event.preventDefault();
        onRun();
      }}
    >
      {children}
    </Button>
  );
}
