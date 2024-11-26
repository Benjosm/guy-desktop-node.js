// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Recording Controls
  getDesktopSources: (opts) => ipcRenderer.invoke('get-desktop-sources', opts),
  
  // Video Handling
  saveVideo: (arrayBuffer) => ipcRenderer.invoke('save-video', arrayBuffer),
  sendVideoToGeminiAPI: (filePath) => ipcRenderer.invoke('send-video-to-gemini-api', filePath),
  
  // Chat Handling
  initializeChat: (transcriptionText) => ipcRenderer.invoke('initialize-chat', transcriptionText),
  sendMessageToGPT4All: (userInput) => ipcRenderer.invoke('send-message', userInput),
  
  // Logging (optional, using console.log for simplicity)
  log: {
    info: (...args) => ipcRenderer.send('log-info', ...args),
    error: (...args) => ipcRenderer.send('log-error', ...args),
  },
});
