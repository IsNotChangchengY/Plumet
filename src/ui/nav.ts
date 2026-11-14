function optionsUrl(hash?: string): string {
  const suffix = hash ? `#${hash}` : ''
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    return chrome.runtime.getURL(`options/index.html${suffix}`)
  }
  return `/options/index.html${suffix}`
}

export function openOptions(hash?: string): void {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
    void chrome.tabs.create({ url: optionsUrl(hash) })
    return
  }
  window.open(optionsUrl(hash), '_blank')
}

export function openLearning(): void {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create && chrome.runtime?.getURL) {
    void chrome.tabs.create({ url: chrome.runtime.getURL('learning/index.html') })
    return
  }
  window.open('/learning/index.html', '_blank')
}
