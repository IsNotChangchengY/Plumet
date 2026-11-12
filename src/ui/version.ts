export function extensionVersion(): string {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
      return chrome.runtime.getManifest().version
    }
  } catch {
    // 非扩展环境（例如预览页）里取不到，回退到占位
  }
  return '0.0.0'
}
