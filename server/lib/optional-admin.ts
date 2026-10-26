import 'server-only'
import { Context } from 'hono'
import { verifyToken, JwtPayload } from '~/server/lib/jwt'
import { isAdminGateVersionCurrent } from '~/server/lib/admin-login-gate'

/**
 * 公开读接口的「可选所有者视角」。
 *
 * 与 `authMiddleware` 的差别在于**失败一律降级为访客、绝不返回 401**：这些端点本身
 * 就向访客开放，作者/所有者带着有效管理员会话访问时，才额外获得查看自己不可见文章
 * （`isPublished: false`）的权限。
 *
 * 之所以不能复用 `authMiddleware`：前端的 api-client 在收到 401 时会触发全局登出并
 * 把访客重定向到登录页，因此公开页面绝不能用 401 表达「你没有额外权限」。
 */
export function readOwnerViewer(c: Context): JwtPayload | null {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null

  let payload: JwtPayload
  try {
    payload = verifyToken(authHeader.substring(7))
  } catch {
    return null
  }

  if (payload.isAdmin !== true) return null
  if (!isAdminGateVersionCurrent(payload.adminGateVersion)) return null

  return payload
}
