import { useCallback, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useCachedPageEffect } from "@/hooks/useCachedPageEffect";
import { useDataRevision } from "@/hooks/useDataRevision";
import { usePreferences } from "@/store/preferences";
import { t } from "@/lib/i18n";
import type { FriendLink } from "@/types";
import { invalidateDesktopCache } from "@/lib/app-cache";
import { loadPersistentResource } from "@/lib/persistent-cache";
import { ListSkeleton } from "@/components/admin/Skeleton";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  GripVertical,
  Link2,
  Pencil,
  Plus,
  Save,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  CreateFriend,
  DeleteFriend,
  GetFriends,
  UpdateFriend,
} from "../../wailsjs/go/main/App";
import { getErrorMessage } from "@/lib/auth-errors";

type FriendForm = {
  name: string;
  url: string;
  description: string;
  avatar: string;
  featured: boolean;
  isActive: boolean;
};
const EMPTY_FORM: FriendForm = {
  name: "",
  url: "",
  description: "",
  avatar: "",
  featured: false,
  isActive: true,
};

export function FriendsPage() {
  const { language } = usePreferences();
  const zh = language === "zh";
  const friendsRevision = useDataRevision("friends");
  const [friends, setFriends] = useState<FriendLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FriendForm>(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const copy = zh
    ? {
        count: "个友链",
        active: "已启用",
        featured: "精选",
        add: "添加友链",
        newTitle: "新建友链",
        editTitle: "编辑友链",
        intro: "管理你想长期保持联系的创作者与站点。拖动行可调整展示顺序。",
        emptyTitle: "还没有友链",
        emptyText: "从一个你喜欢的独立站点开始，建立自己的小小网络。",
        name: "站点名称",
        url: "链接地址",
        description: "一句话介绍",
        avatar: "头像地址",
        namePlaceholder: "例如：野地电台",
        urlPlaceholder: "https://example.com",
        descPlaceholder: "这是谁？他们在写什么？",
        avatarPlaceholder: "https://…（可选）",
        activeLabel: "在公开页面展示",
        featuredLabel: "标记为精选",
        cancel: "取消",
        save: "保存友链",
        create: "创建友链",
        deletePrompt: "确认删除这个友链？",
        keep: "保留",
        confirmDelete: "确认删除",
        order: "展示顺序",
        edit: "编辑",
        enabled: "已启用",
        disabled: "已隐藏",
        created: "友链已创建",
        updated: "友链已更新",
        deleted: "友链已删除",
        required: "请填写名称和链接地址",
        invalid: "请输入有效的 URL",
      }
    : {
        count: "links",
        active: "active",
        featured: "featured",
        add: "Add link",
        newTitle: "New friend link",
        editTitle: "Edit friend link",
        intro:
          "Keep your creative network tidy. Drag a row to change its public order.",
        emptyTitle: "No friend links yet",
        emptyText: "Start with one independent site you want to keep close.",
        name: "Site name",
        url: "Link URL",
        description: "Short description",
        avatar: "Avatar URL",
        namePlaceholder: "e.g. Field Notes",
        urlPlaceholder: "https://example.com",
        descPlaceholder: "What do they make or write?",
        avatarPlaceholder: "https://… (optional)",
        activeLabel: "Show on public page",
        featuredLabel: "Mark as featured",
        cancel: "Cancel",
        save: "Save link",
        create: "Create link",
        deletePrompt: "Delete this friend link?",
        keep: "Keep",
        confirmDelete: "Delete link",
        order: "Display order",
        edit: "Edit",
        enabled: "Active",
        disabled: "Hidden",
        created: "Friend link created",
        updated: "Friend link updated",
        deleted: "Friend link deleted",
        required: "Add a name and URL",
        invalid: "Enter a valid URL",
      };
  const fetchFriends = useCallback(
    async (force = false) => {
      setLoading(true);
      try {
        setFriends(
          (await loadPersistentResource<FriendLink[]>("friends", GetFriends, {
            force,
          })) || [],
        );
      } catch (err: unknown) {
        toast.error(
          getErrorMessage(err) ||
            (zh ? "获取友链列表失败" : "Could not load friend links"),
        );
      } finally {
        setLoading(false);
      }
    },
    [zh],
  );
  useCachedPageEffect(() => {
    void fetchFriends();
  }, [fetchFriends, friendsRevision]);
  const activeCount = useMemo(
    () => friends.filter((friend) => friend.isActive).length,
    [friends],
  );
  const featuredCount = useMemo(
    () => friends.filter((friend) => friend.featured).length,
    [friends],
  );
  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  };
  const openEdit = (friend: FriendLink) => {
    setEditingId(friend.id);
    setForm({
      name: friend.name,
      url: friend.url,
      description: friend.description || "",
      avatar: friend.avatar || "",
      featured: friend.featured,
      isActive: friend.isActive,
    });
    setEditorOpen(true);
  };
  const closeEditor = () => {
    if (!saving) {
      setEditorOpen(false);
      setEditingId(null);
    }
  };
  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      toast.error(copy.required);
      return;
    }
    try {
      new URL(form.url.trim());
    } catch {
      toast.error(copy.invalid);
      return;
    }
    setSaving(true);
    try {
      if (editingId)
        await UpdateFriend(editingId, {
          ...form,
          name: form.name.trim(),
          url: form.url.trim(),
        });
      else
        await CreateFriend({
          ...form,
          name: form.name.trim(),
          url: form.url.trim(),
          sortOrder: friends.length,
        });
      closeEditor();
      await fetchFriends(true);
      invalidateDesktopCache(["overview"]);
      toast.success(editingId ? copy.updated : copy.created);
    } catch (err: unknown) {
      toast.error(
        getErrorMessage(err) || (zh ? "保存失败" : "Could not save link"),
      );
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async (id: string) => {
    try {
      await DeleteFriend(id);
      setDeleteConfirmId(null);
      await fetchFriends(true);
      invalidateDesktopCache(["overview"]);
      toast.success(copy.deleted);
    } catch (err: unknown) {
      toast.error(
        getErrorMessage(err) || (zh ? "删除友链失败" : "Could not delete link"),
      );
    }
  };
  const updateFriend = async (
    friend: FriendLink,
    patch: Partial<FriendLink>,
  ) => {
    try {
      await UpdateFriend(friend.id, patch);
      setFriends((items) =>
        items.map((item) =>
          item.id === friend.id ? { ...item, ...patch } : item,
        ),
      );
      invalidateDesktopCache(["overview"]);
    } catch (err: unknown) {
      toast.error(
        getErrorMessage(err) || (zh ? "更新失败" : "Could not update link"),
      );
    }
  };
  const handleDrop = async (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const from = friends.findIndex((friend) => friend.id === draggedId),
      to = friends.findIndex((friend) => friend.id === targetId);
    if (from < 0 || to < 0) return;
    const reordered = [...friends];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const next = reordered.map((friend, index) => ({
      ...friend,
      sortOrder: index,
    }));
    setFriends(next);
    setDraggedId(null);
    try {
      await Promise.all(
        next.map((friend) =>
          UpdateFriend(friend.id, { sortOrder: friend.sortOrder }),
        ),
      );
      toast.success(zh ? "展示顺序已保存" : "Display order saved");
    } catch (err: unknown) {
      toast.error(
        getErrorMessage(err) || (zh ? "排序保存失败" : "Could not save order"),
      );
      void fetchFriends(true);
    }
  };
  return (
    <>
      <PageHeader
        title={t("admin.page_friends", language)}
        description={`${friends.length} ${copy.count}`}
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-transform hover:-translate-y-0.5 active:translate-y-0"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            <Plus size={14} />
            {copy.add}
          </button>
        }
      />
      <main className="flex-1 overflow-auto p-5 md:p-7">
        <div className="mx-auto max-w-6xl">
          <section className="mb-6 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p
                className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em]"
                style={{ color: "var(--primary)" }}
              >
                LINK DIRECTORY / 01
              </p>
              <h2 className="max-w-xl text-3xl font-medium leading-tight tracking-[-0.03em] md:text-4xl">
                {zh
                  ? "把你的网络，整理成一页。"
                  : "A considered network, in one place."}
              </h2>
              <p
                className="mt-3 max-w-2xl text-sm leading-6"
                style={{ color: "var(--muted-foreground)" }}
              >
                {copy.intro}
              </p>
            </div>
            <div className="flex gap-2">
              {[
                { label: copy.count, value: friends.length },
                { label: copy.active, value: activeCount },
                { label: copy.featured, value: featuredCount },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="min-w-[88px] border-l px-3 py-1"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="font-serif text-2xl tabular-nums">
                    {stat.value}
                  </div>
                  <div
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="min-w-0">
              <div
                className="mb-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: "var(--muted-foreground)" }}
              >
                <span>{copy.order}</span>
                <span>
                  {friends.length ? `${friends.length} ${copy.count}` : ""}
                </span>
              </div>
              {loading ? (
                <ListSkeleton count={5} />
              ) : friends.length === 0 ? (
                <div
                  className="flex min-h-[300px] flex-col items-center justify-center border border-dashed px-6 text-center"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  <div
                    className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: "var(--secondary)" }}
                  >
                    <Link2 size={24} />
                  </div>
                  <h3
                    className="font-serif text-2xl"
                    style={{ color: "var(--foreground)" }}
                  >
                    {copy.emptyTitle}
                  </h3>
                  <p className="mt-2 max-w-sm text-sm leading-6">
                    {copy.emptyText}
                  </p>
                  <button
                    onClick={openCreate}
                    className="mt-5 flex items-center gap-2 border px-3 py-2 text-xs font-semibold transition-colors hover:bg-[var(--secondary)]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <Plus size={14} />
                    {copy.add}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {friends.map((friend) => (
                    <article
                      key={friend.id}
                      draggable
                      onDragStart={() => setDraggedId(friend.id)}
                      onDragEnd={() => setDraggedId(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => void handleDrop(friend.id)}
                      className={`group relative flex items-center gap-3 border px-3 py-3 transition-all duration-200 hover:-translate-y-px hover:shadow-[0_8px_20px_color-mix(in_srgb,var(--primary)_8%,transparent)] ${draggedId === friend.id ? "opacity-45" : ""}`}
                      style={{
                        borderColor: "var(--border)",
                        backgroundColor: "var(--card)",
                      }}
                    >
                      <button
                        aria-label={zh ? "拖动排序" : "Drag to reorder"}
                        className="cursor-grab p-1 active:cursor-grabbing"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        <GripVertical size={16} />
                      </button>
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                        style={{
                          backgroundColor: "var(--secondary)",
                          color: "var(--secondary-foreground)",
                        }}
                      >
                        {friend.avatar ? (
                          <img
                            src={friend.avatar}
                            alt={friend.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="font-serif text-xl">
                            {friend.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-semibold">
                            {friend.name}
                          </h3>
                          {friend.featured && (
                            <Star
                              size={13}
                              fill="currentColor"
                              style={{ color: "var(--primary)" }}
                            />
                          )}
                          {!friend.isActive && (
                            <span
                              className="text-[10px] uppercase tracking-wider"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              {copy.disabled}
                            </span>
                          )}
                        </div>
                        <a
                          href={friend.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 flex max-w-full items-center gap-1 truncate text-xs transition-colors hover:underline"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          <span className="truncate">{friend.url}</span>
                          <ArrowUpRight size={12} className="shrink-0" />
                        </a>
                        {friend.description && (
                          <p
                            className="mt-1 truncate text-xs"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {friend.description}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() =>
                            void updateFriend(friend, {
                              isActive: !friend.isActive,
                            })
                          }
                          title={friend.isActive ? copy.enabled : copy.disabled}
                          className="rounded p-2 transition-colors hover:bg-[var(--secondary)]"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {friend.isActive ? (
                            <Eye size={15} />
                          ) : (
                            <EyeOff size={15} />
                          )}
                        </button>
                        <button
                          onClick={() => openEdit(friend)}
                          title={copy.edit}
                          className="rounded p-2 transition-colors hover:bg-[var(--secondary)]"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() =>
                            setDeleteConfirmId(
                              deleteConfirmId === friend.id ? null : friend.id,
                            )
                          }
                          title={zh ? "删除" : "Delete"}
                          className="rounded p-2 transition-colors hover:bg-[var(--destructive)]/10"
                          style={{ color: "var(--destructive)" }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      {deleteConfirmId === friend.id && (
                        <div
                          className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t px-3 py-2 text-xs"
                          style={{
                            borderColor: "var(--border)",
                            backgroundColor: "var(--background)",
                          }}
                        >
                          <span>{copy.deletePrompt}</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-2 py-1"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              {copy.keep}
                            </button>
                            <button
                              onClick={() => void handleDelete(friend.id)}
                              className="px-2 py-1 font-semibold"
                              style={{ color: "var(--destructive)" }}
                            >
                              {copy.confirmDelete}
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
            {editorOpen && (
              <aside
                className="sticky top-0 border p-5"
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "var(--card)",
                }}
              >
                <div className="mb-5 flex items-start justify-between">
                  <div>
                    <p
                      className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                      style={{ color: "var(--primary)" }}
                    >
                      {editingId ? "EDIT / 02" : "NEW / 02"}
                    </p>
                    <h3 className="font-serif text-2xl">
                      {editingId ? copy.editTitle : copy.newTitle}
                    </h3>
                  </div>
                  <button
                    onClick={closeEditor}
                    className="rounded p-1 transition-colors hover:bg-[var(--secondary)]"
                    aria-label={copy.cancel}
                  >
                    <X size={17} />
                  </button>
                </div>
                <div className="space-y-4">
                  <Field
                    label={`${copy.name} *`}
                    value={form.name}
                    placeholder={copy.namePlaceholder}
                    onChange={(value) =>
                      setForm((current) => ({ ...current, name: value }))
                    }
                  />
                  <Field
                    label={`${copy.url} *`}
                    value={form.url}
                    placeholder={copy.urlPlaceholder}
                    onChange={(value) =>
                      setForm((current) => ({ ...current, url: value }))
                    }
                    type="url"
                  />
                  <Field
                    label={copy.description}
                    value={form.description}
                    placeholder={copy.descPlaceholder}
                    onChange={(value) =>
                      setForm((current) => ({ ...current, description: value }))
                    }
                  />
                  <Field
                    label={copy.avatar}
                    value={form.avatar}
                    placeholder={copy.avatarPlaceholder}
                    onChange={(value) =>
                      setForm((current) => ({ ...current, avatar: value }))
                    }
                    type="url"
                  />
                  <div
                    className="space-y-2 border-t pt-4"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <Toggle
                      checked={form.isActive}
                      label={copy.activeLabel}
                      onChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          isActive: checked,
                        }))
                      }
                    />
                    <Toggle
                      checked={form.featured}
                      label={copy.featuredLabel}
                      onChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          featured: checked,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="mt-6 flex gap-2">
                  <button
                    onClick={closeEditor}
                    className="flex-1 rounded-md border px-3 py-2 text-xs font-semibold transition-colors hover:bg-[var(--secondary)]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {copy.cancel}
                  </button>
                  <button
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
                    style={{
                      backgroundColor: "var(--primary)",
                      color: "var(--primary-foreground)",
                    }}
                  >
                    {saving ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : editingId ? (
                      <Save size={14} />
                    ) : (
                      <Check size={14} />
                    )}
                    {editingId ? copy.save : copy.create}
                  </button>
                </div>
              </aside>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span
        className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--muted-foreground)" }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--primary)]"
        style={{
          borderColor: "var(--border)",
          backgroundColor: "var(--background)",
          color: "var(--foreground)",
        }}
      />
    </label>
  );
}
function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative h-5 w-9 rounded-full transition-colors"
        style={{ backgroundColor: checked ? "var(--primary)" : "var(--muted)" }}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
          style={{
            transform: checked ? "translateX(17px)" : "translateX(2px)",
          }}
        />
      </button>
    </label>
  );
}
