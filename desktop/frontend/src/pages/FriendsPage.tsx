import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SimpleDeleteDialog } from "@/components/admin/SimpleDeleteDialog";
import { useCachedPageEffect } from "@/hooks/useCachedPageEffect";
import { useDataRevision } from "@/hooks/useDataRevision";
import { usePreferences } from "@/store/preferences";
import { t, type Locale } from "@/lib/i18n";
import type { FriendLink } from "@/types";
import { invalidateDesktopCache } from "@/lib/app-cache";
import { loadPersistentResource } from "@/lib/persistent-cache";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Eye,
  EyeOff,
  GripVertical,
  Link2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Star,
  Trash2,
  X,
  Wand2,
} from "lucide-react";
import {
  CreateFriend,
  DeleteFriend,
  FetchURLMetadata,
  GetFriends,
  ReorderFriends,
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

type StatusFilter = "all" | "active" | "hidden" | "featured";

const EMPTY_FORM: FriendForm = {
  name: "",
  url: "",
  description: "",
  avatar: "",
  featured: false,
  isActive: true,
};

const formInputClass =
  "w-full rounded-lg border bg-input px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20";

function formFromFriend(friend: FriendLink): FriendForm {
  return {
    name: friend.name,
    url: friend.url,
    description: friend.description || "",
    avatar: friend.avatar || "",
    featured: friend.featured,
    isActive: friend.isActive,
  };
}

function sameForm(left: FriendForm, right: FriendForm) {
  return (
    left.name === right.name &&
    left.url === right.url &&
    left.description === right.description &&
    left.avatar === right.avatar &&
    left.featured === right.featured &&
    left.isActive === right.isActive
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isValidUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function FriendsPage() {
  const { language } = usePreferences();
  const friendsRevision = useDataRevision("friends");
  const [friends, setFriends] = useState<FriendLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FriendForm>(EMPTY_FORM);
  const [nameTouched, setNameTouched] = useState(false);
  const [urlTouched, setUrlTouched] = useState(false);
  const [fetchingInfo, setFetchingInfo] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FriendLink | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = useState<FriendLink[] | null>(null);
  const snapshotRef = useRef<FriendForm>(EMPTY_FORM);
  const didAutoSelectRef = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const fetchFriends = useCallback(
    async (force = false, silent = false) => {
      if (!silent) setLoading(true);
      try {
        setFriends(
          (await loadPersistentResource<FriendLink[]>("friends", GetFriends, {
            force,
          })) || [],
        );
      } catch (err: unknown) {
        toast.error(
          getErrorMessage(err) ||
            (language === "zh"
              ? "获取友链列表失败"
              : "Could not load friend links"),
        );
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [language],
  );

  useCachedPageEffect(() => {
    void fetchFriends();
  }, [fetchFriends, friendsRevision]);

  const displayList = previewOrder ?? friends;
  const query = searchQuery.trim().toLowerCase();
  const isFiltering = Boolean(query) || statusFilter !== "all";

  const filteredFriends = useMemo(() => {
    return displayList.filter((friend) => {
      if (statusFilter === "active" && !friend.isActive) return false;
      if (statusFilter === "hidden" && friend.isActive) return false;
      if (statusFilter === "featured" && !friend.featured) return false;
      if (!query) return true;
      return [friend.name, friend.url, friend.description]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  }, [displayList, query, statusFilter]);

  const selectedFriend = useMemo(
    () =>
      selectedId
        ? (friends.find((friend) => friend.id === selectedId) ?? null)
        : null,
    [friends, selectedId],
  );

  const editorOpen = creating || Boolean(selectedFriend);
  const isDirty = editorOpen && !sameForm(form, snapshotRef.current);
  const normalizedUrl = normalizeUrl(form.url);
  const nameEmpty = !form.name.trim();
  const urlInvalid = Boolean(form.url.trim()) && !isValidUrl(normalizedUrl);
  const urlEmpty = !form.url.trim();
  const canReorder = friends.length > 1 && !isFiltering && !saving;
  const activeCount = friends.filter((friend) => friend.isActive).length;
  const featuredCount = friends.filter((friend) => friend.featured).length;

  useEffect(() => {
    if (didAutoSelectRef.current || loading || creating) return;
    if (selectedId) {
      didAutoSelectRef.current = true;
      return;
    }
    if (friends.length === 0) return;
    didAutoSelectRef.current = true;
    const first = friends[0];
    setSelectedId(first.id);
    const next = formFromFriend(first);
    snapshotRef.current = next;
    setForm(next);
  }, [creating, friends, loading, selectedId]);

  const discardIfDirty = () => {
    if (isDirty) toast.message(t("admin.friends_discarded", language));
  };

  const openCreate = () => {
    discardIfDirty();
    snapshotRef.current = EMPTY_FORM;
    setForm(EMPTY_FORM);
    setSelectedId(null);
    setCreating(true);
    setNameTouched(false);
    setUrlTouched(false);
  };

  const openEdit = (friend: FriendLink, force = false) => {
    if (!force && selectedId === friend.id && !creating) return;
    if (!force) discardIfDirty();
    const next = formFromFriend(friend);
    snapshotRef.current = next;
    setForm(next);
    setSelectedId(friend.id);
    setCreating(false);
    setNameTouched(false);
    setUrlTouched(false);
  };

  const closeEditor = () => {
    if (saving) return;
    discardIfDirty();
    setCreating(false);
    setNameTouched(false);
    setUrlTouched(false);
    if (selectedFriend) {
      const next = formFromFriend(selectedFriend);
      snapshotRef.current = next;
      setForm(next);
      return;
    }
    snapshotRef.current = EMPTY_FORM;
    setForm(EMPTY_FORM);
    setSelectedId(null);
  };

  const handleSave = async () => {
    setNameTouched(true);
    setUrlTouched(true);
    if (nameEmpty || urlEmpty) {
      toast.error(
        nameEmpty
          ? t("admin.friends_name_required", language)
          : t("admin.friends_url_required", language),
      );
      return;
    }
    if (!isValidUrl(normalizedUrl)) {
      toast.error(t("admin.friends_url_invalid", language));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        url: normalizedUrl,
        description: form.description.trim(),
        avatar: form.avatar.trim(),
      };
      if (creating || !selectedId) {
        const created = await CreateFriend({
          ...payload,
          sortOrder: friends.length,
        });
        setCreating(false);
        setSelectedId(created.id);
        snapshotRef.current = payload;
        setForm(payload);
        toast.success(t("admin.friends_created", language));
      } else {
        await UpdateFriend(selectedId, payload);
        snapshotRef.current = payload;
        toast.success(t("admin.friends_updated", language));
      }
      await fetchFriends(true, true);
      invalidateDesktopCache(["overview"]);
    } catch (err: unknown) {
      toast.error(
        getErrorMessage(err) ||
          (language === "zh" ? "保存失败" : "Could not save link"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleFetchInfo = async () => {
    const normalized = normalizeUrl(form.url);
    if (!isValidUrl(normalized)) {
      toast.error(t("admin.friends_url_invalid", language));
      return;
    }
    if (fetchingInfo) return;
    setFetchingInfo(true);
    try {
      const info = await FetchURLMetadata(normalized);
      if (info) {
        const next = { ...form, url: normalized };
        if (info.title) next.name = info.title;
        if (info.description) next.description = info.description;
        if (info.avatar) next.avatar = info.avatar;
        snapshotRef.current = { ...snapshotRef.current, ...next };
        setForm(next);
        setNameTouched(false);
        setUrlTouched(false);
        toast.success(t("admin.friends_fetch_success", language));
      }
    } catch (err: unknown) {
      toast.error(
        getErrorMessage(err) ||
          t("admin.friends_fetch_failed", language),
      );
    } finally {
      setFetchingInfo(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const deletedId = pendingDelete.id;
    try {
      await DeleteFriend(deletedId);
      setPendingDelete(null);
      if (selectedId === deletedId) {
        const remaining = friends.filter((friend) => friend.id !== deletedId);
        const next = remaining[0] ?? null;
        setCreating(false);
        setSelectedId(next?.id ?? null);
        const nextForm = next ? formFromFriend(next) : EMPTY_FORM;
        snapshotRef.current = nextForm;
        setForm(nextForm);
      }
      await fetchFriends(true, true);
      invalidateDesktopCache(["overview"]);
      toast.success(t("admin.friends_deleted", language));
    } catch (err: unknown) {
      toast.error(
        getErrorMessage(err) ||
          (language === "zh" ? "删除友链失败" : "Could not delete link"),
      );
    }
  };

  const patchFriend = async (
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
      if (selectedId === friend.id && !creating) {
        setForm((current) => {
          const next = { ...current, ...patch };
          snapshotRef.current = { ...snapshotRef.current, ...patch };
          return next;
        });
      }
      invalidateDesktopCache(["overview"]);
    } catch (err: unknown) {
      toast.error(
        getErrorMessage(err) ||
          (language === "zh" ? "更新失败" : "Could not update link"),
      );
    }
  };

  const handleDrop = async () => {
    if (!draggedId || !previewOrder) {
      setDraggedId(null);
      setPreviewOrder(null);
      return;
    }
    const next = previewOrder.map((friend, index) => ({
      ...friend,
      sortOrder: index,
    }));
    const unchanged = next.every(
      (friend, index) => friend.id === friends[index]?.id,
    );
    setFriends(next);
    setDraggedId(null);
    setPreviewOrder(null);
    if (unchanged) return;
    try {
      await ReorderFriends(
        next.map((friend) => ({ id: friend.id, sortOrder: friend.sortOrder })),
      );
      toast.success(t("admin.friends_reordered", language));
    } catch (err: unknown) {
      toast.error(
        getErrorMessage(err) ||
          (language === "zh" ? "排序保存失败" : "Could not save order"),
      );
      void fetchFriends(true, true);
    }
  };

  const handleDragEnter = (targetId: string) => {
    if (!draggedId || draggedId === targetId || !previewOrder) return;
    const from = previewOrder.findIndex((friend) => friend.id === draggedId);
    const to = previewOrder.findIndex((friend) => friend.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...previewOrder];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setPreviewOrder(next);
  };

  useEffect(() => {
    if (creating) nameInputRef.current?.focus();
  }, [creating]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    if (!editorOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSaveRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editorOpen]);

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
  };

  const filters: { value: StatusFilter; label: string }[] = [
    { value: "all", label: t("admin.friends_filter_all", language) },
    { value: "active", label: t("admin.friends_active", language) },
    { value: "hidden", label: t("admin.friends_filter_hidden", language) },
    { value: "featured", label: t("admin.friends_featured", language) },
  ];

  return (
    <>
      <PageHeader
        title={t("admin.page_friends", language)}
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            <Plus size={14} />
            {t("admin.friends_add", language)}
          </button>
        }
      />

      <div className="flex min-h-0 flex-1">
        <aside
          className="flex w-[22rem] shrink-0 flex-col overflow-hidden border-r bg-card"
          style={{ borderColor: "var(--border)" }}
        >
          <div
            className="flex h-14 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="relative min-w-0 flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--muted-foreground)" }}
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("admin.friends_search", language)}
                className="h-8 w-full rounded-md border bg-input pl-8 pr-8 text-xs outline-none focus:ring-1"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label={t("common.close", language)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-secondary"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div
              className="flex h-8 shrink-0 items-center rounded-md border bg-input p-0.5"
              style={{ borderColor: "var(--border)" }}
            >
              {filters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatusFilter(filter.value)}
                  className="h-7 rounded px-2.5 text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor:
                      statusFilter === filter.value ? "var(--secondary)" : undefined,
                    color:
                      statusFilter === filter.value
                        ? "var(--foreground)"
                        : "var(--muted-foreground)",
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className="mb-1 flex items-center gap-2.5 rounded-lg px-2 py-2"
                >
                  <div
                    className="size-10 shrink-0 animate-pulse rounded-md"
                    style={{ backgroundColor: "var(--muted)" }}
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div
                      className="h-3 w-3/4 animate-pulse rounded"
                      style={{ backgroundColor: "var(--muted)" }}
                    />
                    <div
                      className="h-2 w-1/2 animate-pulse rounded"
                      style={{ backgroundColor: "var(--muted)" }}
                    />
                  </div>
                </div>
              ))
            ) : friends.length === 0 ? (
              <div className="flex flex-col items-center gap-3 p-6 text-center">
                <span
                  className="flex size-12 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "var(--muted)" }}
                >
                  <Link2
                    size={20}
                    style={{ color: "var(--muted-foreground)" }}
                  />
                </span>
                <p
                  className="text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {t("admin.friends_empty", language)}
                </p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                >
                  <Plus size={14} />
                  {t("admin.friends_create_first", language)}
                </button>
              </div>
            ) : filteredFriends.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <p
                  className="text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {t("admin.friends_no_match", language)}
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs underline-offset-2 hover:underline"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {t("admin.clear_filters", language)}
                </button>
              </div>
            ) : (
              <div className="space-y-0.5">
                {creating && (
                  <div
                    className="flex items-center gap-2.5 rounded-lg border border-dashed px-2 py-2"
                    style={{
                      borderColor: "var(--border)",
                      backgroundColor: "var(--accent)",
                    }}
                  >
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-md"
                      style={{ backgroundColor: "var(--muted)" }}
                    >
                      <Plus
                        size={16}
                        style={{ color: "var(--muted-foreground)" }}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium">
                        {form.name.trim() || t("admin.friends_new", language)}
                      </span>
                      <span
                        className="mt-0.5 block text-[10px]"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {t("admin.friends_unsaved", language)}
                      </span>
                    </span>
                  </div>
                )}
                {filteredFriends.map((friend) => (
                  <FriendRow
                    key={friend.id}
                    friend={friend}
                    selected={!creating && selectedId === friend.id}
                    language={language}
                    canReorder={canReorder}
                    dragging={draggedId === friend.id}
                    onSelect={() => openEdit(friend)}
                    onToggleActive={() =>
                      void patchFriend(friend, { isActive: !friend.isActive })
                    }
                    onToggleFeatured={() =>
                      void patchFriend(friend, { featured: !friend.featured })
                    }
                    onDelete={() => setPendingDelete(friend)}
                    onDragStart={() => {
                      setDraggedId(friend.id);
                      setPreviewOrder([...friends]);
                    }}
                    onDragEnter={() => handleDragEnter(friend.id)}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setPreviewOrder(null);
                    }}
                    onDrop={() => void handleDrop()}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!editorOpen ? (
            <div
              className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6"
              style={{ color: "var(--muted-foreground)" }}
            >
              <span
                className="flex size-14 items-center justify-center rounded-lg"
                style={{ backgroundColor: "var(--muted)" }}
              >
                <Link2 size={24} />
              </span>
              <p className="max-w-sm text-center text-sm">
                {t("admin.friends_select_hint", language)}
              </p>
              <button
                type="button"
                onClick={openCreate}
                className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              >
                <Plus size={14} />
                {t("admin.friends_add", language)}
              </button>
            </div>
          ) : (
            <>
              <header
                className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-5"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-serif text-base font-medium">
                      {creating
                        ? t("admin.friends_new", language)
                        : form.name.trim() ||
                          t("admin.friends_edit", language)}
                    </h2>
                    {isDirty && (
                      <span
                        className="shrink-0 text-[10px] uppercase tracking-wider"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {t("admin.friends_unsaved", language)}
                      </span>
                    )}
                  </div>
                  <p
                    className="mt-0.5 truncate text-[11px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {creating
                      ? t("admin.friends_add", language)
                      : form.url
                        ? hostOf(form.url)
                        : t("admin.friends_edit", language)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!creating && selectedFriend && (
                    <a
                      href={selectedFriend.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs transition-colors hover:bg-secondary"
                      style={{
                        borderColor: "var(--border)",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      <ArrowUpRight size={13} />
                      {t("admin.friends_open", language)}
                    </a>
                  )}
                  {(creating || isDirty) && (
                    <button
                      type="button"
                      onClick={closeEditor}
                      disabled={saving}
                      className="flex h-8 items-center rounded-md border px-3 text-xs transition-colors hover:bg-secondary disabled:opacity-50"
                      style={{
                        borderColor: "var(--border)",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      {t("common.cancel", language)}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
                    style={{
                      backgroundColor: "var(--primary)",
                      color: "var(--primary-foreground)",
                    }}
                  >
                    {saving ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Save size={14} />
                    )}
                    {creating
                      ? t("admin.friends_add", language)
                      : t("common.save", language)}
                  </button>
                </div>
              </header>

              <div className="custom-scrollbar min-h-0 flex-1 overflow-auto p-5">
                <div className="mx-auto max-w-xl space-y-5">
                  <section
                    className="space-y-4 rounded-lg border p-5"
                    style={{
                      borderColor: "var(--border)",
                      backgroundColor: "var(--card)",
                    }}
                  >
                    <Field
                      label={t("admin.friends_name", language)}
                      required
                      error={
                        nameTouched && nameEmpty
                          ? t("admin.friends_name_required", language)
                          : undefined
                      }
                    >
                      <input
                        ref={nameInputRef}
                        value={form.name}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        onBlur={() => setNameTouched(true)}
                        placeholder={t(
                          "admin.friends_name_placeholder",
                          language,
                        )}
                        maxLength={80}
                        className={formInputClass}
                        style={{
                          borderColor:
                            nameTouched && nameEmpty
                              ? "var(--destructive)"
                              : "var(--border)",
                        }}
                      />
                    </Field>
                    <Field
                      label={t("admin.friends_url", language)}
                      required
                      error={
                        urlTouched && urlEmpty
                          ? t("admin.friends_url_required", language)
                          : urlTouched && urlInvalid
                            ? t("admin.friends_url_invalid", language)
                            : undefined
                      }
                    >
                      <input
                        type="url"
                        value={form.url}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            url: event.target.value,
                          }))
                        }
                        onBlur={() => {
                          setUrlTouched(true);
                          setForm((current) => ({
                            ...current,
                            url: normalizeUrl(current.url),
                          }));
                        }}
                        placeholder="https://example.com"
                        className={formInputClass}
                        style={{
                          borderColor:
                            urlTouched && (urlEmpty || urlInvalid)
                              ? "var(--destructive)"
                              : "var(--border)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void handleFetchInfo()}
                        disabled={fetchingInfo || !form.url.trim()}
                        title={`${t("admin.friends_fetch", language)} · ${t(
                          "admin.friends_fetch_hint",
                          language,
                        )}`}
                        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors hover:bg-secondary disabled:cursor-wait disabled:opacity-50"
                        style={{
                          borderColor: "var(--border)",
                          color: "var(--muted-foreground)",
                        }}
                      >
                        {fetchingInfo ? (
                          <RefreshCw size={13} className="animate-spin" />
                        ) : (
                          <Wand2 size={13} />
                        )}
                        {fetchingInfo
                          ? t("admin.friends_fetching", language)
                          : t("admin.friends_fetch", language)}
                      </button>
                    </Field>
                    <Field
                      label={t("admin.friends_description", language)}
                    >
                      <textarea
                        value={form.description}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        placeholder={t(
                          "admin.friends_description_placeholder",
                          language,
                        )}
                        rows={3}
                        maxLength={200}
                        className={`${formInputClass} resize-none`}
                        style={{ borderColor: "var(--border)" }}
                      />
                      <p
                        className="mt-1 text-right text-[10px] tabular-nums"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {form.description.length}/200
                      </p>
                    </Field>
                    <Field label={t("admin.friends_avatar", language)}>
                      <div className="flex items-start gap-3">
                        <AvatarMark
                          name={form.name}
                          src={form.avatar}
                          size={48}
                        />
                        <input
                          type="url"
                          value={form.avatar}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              avatar: event.target.value,
                            }))
                          }
                          placeholder={t(
                            "admin.friends_avatar",
                            language,
                          )}
                          className={formInputClass}
                          style={{ borderColor: "var(--border)" }}
                        />
                      </div>
                    </Field>
                  </section>

                  <section
                    className="space-y-3 rounded-lg border p-5"
                    style={{
                      borderColor: "var(--border)",
                      backgroundColor: "var(--card)",
                    }}
                  >
                    <Toggle
                      checked={form.isActive}
                      label={t("admin.friends_show_public", language)}
                      onChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          isActive: checked,
                        }))
                      }
                    />
                    <Toggle
                      checked={form.featured}
                      label={t("admin.friends_mark_featured", language)}
                      onChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          featured: checked,
                        }))
                      }
                    />
                  </section>

                  {!creating && selectedFriend && (
                    <button
                      type="button"
                      onClick={() => setPendingDelete(selectedFriend)}
                      className="flex items-center gap-1.5 text-xs transition-colors hover:underline"
                      style={{ color: "var(--destructive)" }}
                    >
                      <Trash2 size={13} />
                      {t("common.delete", language)}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div
        className="flex min-h-10 shrink-0 items-center gap-3 border-t px-4"
        style={{
          borderColor: "var(--border)",
          backgroundColor: "var(--card)",
        }}
      >
        <div
          className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap text-[11px]"
          style={{ color: "var(--muted-foreground)" }}
        >
          <span>
            {friends.length} {t("admin.friends_unit", language)}
          </span>
          <span className="opacity-60">·</span>
          <span>
            {activeCount} {t("admin.friends_active", language)}
          </span>
          <span className="opacity-60">·</span>
          <span>
            {featuredCount} {t("admin.friends_featured", language)}
          </span>
          {isFiltering && filteredFriends.length !== friends.length && (
            <>
              <span className="opacity-60">·</span>
              <span>
                {filteredFriends.length}/{friends.length}
              </span>
            </>
          )}
          {isFiltering && (
            <>
              <span className="opacity-60">·</span>
              <span>{t("admin.friends_reorder_locked", language)}</span>
            </>
          )}
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void fetchFriends(true)}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] hover:bg-secondary disabled:cursor-wait disabled:opacity-50"
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          {t("common.refresh", language)}
        </button>
      </div>

      <SimpleDeleteDialog
        isOpen={!!pendingDelete}
        title={t("common.delete", language)}
        message={
          pendingDelete
            ? `${t("admin.friends_delete_confirm", language)} ${pendingDelete.name}`
            : ""
        }
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
        t={(key) => t(key, language)}
      />
    </>
  );
}

function FriendRow({
  friend,
  selected,
  language,
  canReorder,
  dragging,
  onSelect,
  onToggleActive,
  onToggleFeatured,
  onDelete,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: {
  friend: FriendLink;
  selected: boolean;
  language: Locale;
  canReorder: boolean;
  dragging: boolean;
  onSelect: () => void;
  onToggleActive: () => void;
  onToggleFeatured: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const muted = selected
    ? "color-mix(in srgb, var(--accent-foreground) 70%, transparent)"
    : "var(--muted-foreground)";

  return (
    <div
      onDragOver={(event) => {
        if (canReorder) event.preventDefault();
      }}
      onDragEnter={onDragEnter}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      className={`group relative flex w-full items-center gap-1 rounded-lg border border-transparent px-1 py-1.5 transition-colors ${
        dragging ? "opacity-45" : ""
      } ${!friend.isActive && !selected ? "opacity-70" : ""}`}
      style={{ backgroundColor: selected ? "var(--accent)" : undefined }}
    >
      <button
        type="button"
        draggable={canReorder}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        aria-label={t("admin.friends_drag", language)}
        title={
          canReorder
            ? t("admin.friends_drag", language)
            : t("admin.friends_reorder_locked", language)
        }
        className={`shrink-0 rounded p-1 ${
          canReorder ? "cursor-grab active:cursor-grabbing" : "cursor-default"
        }`}
        style={{ color: muted }}
      >
        <GripVertical size={14} />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <AvatarMark name={friend.name} src={friend.avatar} size={40} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span
              className="truncate text-xs font-medium"
              style={{
                color: selected ? "var(--accent-foreground)" : "var(--foreground)",
              }}
            >
              {friend.name}
            </span>
            {friend.featured && (
              <Star
                size={11}
                fill="currentColor"
                className="shrink-0"
                style={{ color: "var(--primary)" }}
              />
            )}
            {!friend.isActive && (
              <span
                className="shrink-0 text-[10px] uppercase tracking-wider"
                style={{ color: muted }}
              >
                {t("admin.friends_inactive", language)}
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[10px]" style={{ color: muted }}>
            {hostOf(friend.url)}
          </span>
        </span>
      </button>
      <div
        className={`flex shrink-0 items-center ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }`}
      >
        <IconAction
          label={
            friend.isActive
              ? t("admin.friends_disable", language)
              : t("admin.friends_enable", language)
          }
          onClick={onToggleActive}
        >
          {friend.isActive ? <Eye size={13} /> : <EyeOff size={13} />}
        </IconAction>
        <IconAction
          label={
            friend.featured
              ? t("admin.friends_unfeature", language)
              : t("admin.friends_feature", language)
          }
          onClick={onToggleFeatured}
        >
          <Star
            size={13}
            fill={friend.featured ? "currentColor" : "none"}
          />
        </IconAction>
        <IconAction label={t("common.delete", language)} onClick={onDelete} danger>
          <Trash2 size={13} />
        </IconAction>
      </div>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="rounded-md p-1.5 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      style={{ color: danger ? "var(--destructive)" : "var(--muted-foreground)" }}
    >
      {children}
    </button>
  );
}

function AvatarMark({
  name,
  src,
  size,
}: {
  name: string;
  src?: string;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-md"
      style={{
        width: size,
        height: size,
        backgroundColor: "var(--muted)",
        color: "var(--muted-foreground)",
      }}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="font-serif text-sm">
          {(name.trim().charAt(0) || "?").toUpperCase()}
        </span>
      )}
    </span>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="mb-1.5 block text-xs font-medium"
        style={{ color: "var(--muted-foreground)" }}
      >
        {label}
        {required && (
          <span className="ml-0.5" style={{ color: "var(--destructive)" }}>
            *
          </span>
        )}
      </span>
      {children}
      {error && (
        <p className="mt-1.5 text-xs" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
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
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="leading-none">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        style={{ backgroundColor: checked ? "var(--primary)" : "var(--muted)" }}
      >
        <span
          className="block h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
          style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }}
        />
      </button>
    </div>
  );
}
