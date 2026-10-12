/**
 * 右键菜单相对指针的间隙与落点。
 *
 * 此前各处菜单都是把指针坐标直接当菜单左上角（`left: clientX, top: clientY`），
 * 指针正好压在第一项上、每次右击都像是「黏」着指针弹出来。这里统一让出一段间隙，
 * 数值与桌面端保持一致（emulsion-desktop-v3 `components/ui/ContextMenu.tsx`：
 * 右移 8px、下移 6px）。
 */
export const CONTEXT_MENU_OFFSET_X = 8
export const CONTEXT_MENU_OFFSET_Y = 6

const VIEWPORT_MARGIN = 8

/** 菜单落点：指针右下方、夹取在视口内（视口边距与偏移量同宽）。 */
export function placeContextMenu(
  clientX: number,
  clientY: number,
  menuWidth: number,
  menuHeight: number,
) {
  return {
    x: Math.max(
      VIEWPORT_MARGIN,
      Math.min(clientX + CONTEXT_MENU_OFFSET_X, window.innerWidth - menuWidth - VIEWPORT_MARGIN),
    ),
    y: Math.max(
      VIEWPORT_MARGIN,
      Math.min(clientY + CONTEXT_MENU_OFFSET_Y, window.innerHeight - menuHeight - VIEWPORT_MARGIN),
    ),
  }
}
