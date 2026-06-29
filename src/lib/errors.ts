// 把后端/浏览器返回的英文错误串本地化为中文,用于红色错误横幅。
// 有界的已知集合:命中返回中文,未命中原样返回(刻意不做完整 i18n 框架)。

// 各模块依赖软件缺失/未运行时,加载接口统一返回 "<x> unavailable"(后端 http.Error)。
// 用后缀规则覆盖整族,免去逐个枚举。
const UNAVAILABLE = /\sunavailable$/

const EXACT: Record<string, string> = {
  // 网络层:fetch 在不可达/CORS 失败时抛出的原生消息(各浏览器措辞不同)。
  'Failed to fetch': '无法连接服务器,请检查网络或后端服务是否运行',
  'NetworkError when attempting to fetch resource.': '无法连接服务器,请检查网络或后端服务是否运行',
  'Load failed': '无法连接服务器,请检查网络或后端服务是否运行',

  // 鉴权 / 授权
  unauthorized: '登录已失效,请重新登录',
  forbidden: '无权限执行此操作',
  'forbidden: requires admin role': '此操作需要管理员权限',
  'forbidden: requires operator role': '此操作需要操作员权限',

  // 通用 HTTP
  'bad request': '请求无效',
  'not found': '资源不存在',
  'rate limit exceeded': '请求过于频繁,请稍后再试',

  // 数据库
  'database connection failed': '数据库连接失败',
  'database operation failed': '数据库操作失败',
}

/** localizeError 命中已知英文错误串返回中文,否则原样返回。 */
export function localizeError(msg: string): string {
  const key = msg.trim()
  const hit = EXACT[key]
  if (hit) return hit
  if (UNAVAILABLE.test(key)) return '服务暂时不可用,请确认相关组件已安装并正在运行'
  return msg
}
