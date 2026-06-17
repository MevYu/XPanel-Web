import {
  Folder,
  File,
  FileCode,
  FileCog,
  FileImage,
  FileArchive,
  FileText,
  FileAudio,
  FileVideo,
  FileJson,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// 按扩展名归类的图标 + 配色,贴近 aaPanel 的彩色友好图标:
// 文件夹=暖金、代码=蓝、网页=橙、配置=中性灰、文档/文本=灰蓝、图片=绿、压缩=琥珀。
const CODE = new Set([
  'js', 'jsx', 'ts', 'tsx', 'go', 'py', 'rb', 'rs', 'java', 'c', 'h', 'cpp', 'cc',
  'php', 'sh', 'bash', 'zsh', 'vue', 'sql', 'lua', 'pl', 'swift', 'kt',
])
const WEB = new Set(['html', 'htm', 'css', 'scss', 'sass', 'less'])
const CONFIG = new Set(['yml', 'yaml', 'toml', 'ini', 'conf', 'xml', 'env'])
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff', 'avif'])
const ARCHIVE = new Set(['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'rar', '7z', 'zst'])
const TEXT = new Set(['txt', 'md', 'log', 'rst', 'csv', 'lock', 'pem', 'crt', 'key'])
const AUDIO = new Set(['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'opus'])
const VIDEO = new Set(['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv'])

interface IconSpec {
  Icon: LucideIcon
  color: string
}

function ext(name: string): string {
  const i = name.lastIndexOf('.')
  return i <= 0 ? '' : name.slice(i + 1).toLowerCase()
}

function specFor(name: string, isDir: boolean): IconSpec {
  if (isDir) return { Icon: Folder, color: 'text-gold' }
  const e = ext(name)
  if (e === 'json') return { Icon: FileJson, color: 'text-amber-300' }
  if (CODE.has(e)) return { Icon: FileCode, color: 'text-sky-400' }
  if (WEB.has(e)) return { Icon: FileCode, color: 'text-orange-400' }
  if (CONFIG.has(e)) return { Icon: FileCog, color: 'text-slate-400' }
  if (IMAGE.has(e)) return { Icon: FileImage, color: 'text-emerald-400' }
  if (ARCHIVE.has(e)) return { Icon: FileArchive, color: 'text-amber-400' }
  if (TEXT.has(e)) return { Icon: FileText, color: 'text-indigo-300' }
  if (AUDIO.has(e)) return { Icon: FileAudio, color: 'text-pink-400' }
  if (VIDEO.has(e)) return { Icon: FileVideo, color: 'text-rose-400' }
  return { Icon: File, color: 'text-muted' }
}

/** isArchive 判断文件名是否为受支持的压缩包(用于"解压"操作可见性)。 */
export function isArchive(name: string): boolean {
  return ARCHIVE.has(ext(name))
}

/** FileIcon 按文件名/是否目录渲染带配色的类型图标。 */
export function FileIcon({ name, isDir, size = 18 }: { name: string; isDir: boolean; size?: number }) {
  const { Icon, color } = specFor(name, isDir)
  return <Icon size={size} className={`shrink-0 ${color}`} />
}
