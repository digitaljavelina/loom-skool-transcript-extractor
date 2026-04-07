// When the user clicks the toolbar button, inject the content script into the active tab
browser.action.onClicked.addListener(async (tab) => {
  try {
    await browser.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['content.js']
    });
    console.log('[LTE] Content script injected into tab:', tab.id);
  } catch (e) {
    console.error('[LTE] Failed to inject content script:', e.message);
  }
});
