const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('xilankapuDesktopApi', {
  submitGeneration(request) {
    return ipcRenderer.invoke('generation:submit', request);
  },
  checkGenerationStatus(generationId) {
    return ipcRenderer.invoke('generation:status', generationId);
  },
  getGeneration(generationId) {
    return ipcRenderer.invoke('generation:get', generationId);
  },
});
