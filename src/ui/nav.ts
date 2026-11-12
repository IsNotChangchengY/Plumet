export function openOptions(): void {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
    void chrome.runtime.openOptionsPage()
    return
  }
  window.open('/options/index.html', '_blank')
}

export function openLearning(): void {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create && chrome.runtime?.getURL) {
    void chrome.tabs.create({ url: chrome.runtime.getURL('learning/index.html') })
    return
  }
  window.open('/learning/index.html', '_blank')
}
