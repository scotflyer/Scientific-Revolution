const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('publicationDesktop', {
  bootstrap: () => ipcRenderer.invoke('publication:bootstrap'),
  saveReader: reader => ipcRenderer.invoke('publication:save-reader', reader),
  rediscover: () => ipcRenderer.invoke('publication:rediscover'),
  chooseContent: () => ipcRenderer.invoke('publication:choose-content'),
  onBeforeClose: callback => {
    const handler = () => callback();
    ipcRenderer.on('publication:before-close', handler);
    return () => ipcRenderer.removeListener('publication:before-close', handler);
  },
  finishClose: reader => ipcRenderer.invoke('publication:finish-close', reader),
});
