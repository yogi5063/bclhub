// fsapi.js — File System Access API integration
// Allows the dashboard to read files from the user's local drive
// without sending any data to the server.

/* global saveHandle, loadHandle, clearHandle */

const ROOT_KEY = 'uploadRoot';

/** Check if the browser supports the File System Access API */
function hasFSAPI() {
  return 'showDirectoryPicker' in window;
}

/** Let the user pick their Upload/ folder. Saves the handle to IndexedDB. */
async function pickFolder() {
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'read', id: 'fip-upload' });
    await saveHandle(ROOT_KEY, dirHandle);
    return dirHandle;
  } catch (err) {
    if (err.name === 'AbortError') return null; // user cancelled
    throw err;
  }
}

/** Re-connect to the previously saved folder (one-click re-permission). */
async function restoreFolder() {
  try {
    const dirHandle = await loadHandle(ROOT_KEY);
    if (!dirHandle) return null;

    const perm = await dirHandle.queryPermission({ mode: 'read' });
    if (perm === 'granted') return dirHandle;

    const requested = await dirHandle.requestPermission({ mode: 'read' });
    return requested === 'granted' ? dirHandle : null;
  } catch {
    return null;
  }
}

/** Disconnect — clears the saved handle so the user must pick again. */
async function disconnectFolder() {
  await clearHandle(ROOT_KEY);
}

/**
 * Recursively walk a FileSystemDirectoryHandle and collect all
 * .xlsx and .csv files, attaching a relative path string to each File object.
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @returns {Promise<File[]>} Files with .relativePath attached
 */
async function loadAllFiles(dirHandle) {
  const files = [];
  await _walkDir(dirHandle, [], files);
  return files;
}

async function _walkDir(handle, pathParts, accumulator) {
  try {
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind === 'directory') {
        await _walkDir(entry, [...pathParts, name], accumulator);
      } else if (entry.kind === 'file') {
        const lower = name.toLowerCase();
        if (lower.endsWith('.xlsx') || lower.endsWith('.csv')) {
          const file = await entry.getFile();
          // Attach relative path metadata (read-only property)
          Object.defineProperty(file, 'relativePath', {
            value: [...pathParts, name].join('/'),
            writable: false,
            configurable: false,
          });
          accumulator.push(file);
        }
      }
    }
  } catch (err) {
    console.warn('FSAPI: Cannot read directory', pathParts.join('/'), err.message);
  }
}

/**
 * Show folder connection UI in the sidebar upload panel.
 * Called from app.js during init.
 */
async function initFolderConnection() {
  const panel  = document.getElementById('upload-panel');
  const list   = document.getElementById('upload-list');
  if (!panel) return;

  if (!hasFSAPI()) {
    // Fallback: classic file input for Firefox/Safari
    panel.innerHTML = `
      <div id="drop-area">
        <span class="drop-icon">📁</span>
        <strong>Select data files</strong><br/>
        <span style="font-size:11px">Drop .xlsx &amp; .csv files, or click to browse</span>
      </div>
      <input type="file" id="file-input" accept=".xlsx,.csv" multiple style="display:none"/>
      <div id="upload-list"></div>`;

    const dropArea  = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');

    dropArea.addEventListener('click', () => fileInput.click());
    dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('drag-over'); });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag-over'));
    dropArea.addEventListener('drop', e => {
      e.preventDefault();
      dropArea.classList.remove('drag-over');
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', e => {
      if (e.target.files.length) handleFiles(e.target.files);
      fileInput.value = '';
    });
    return;
  }

  // File System Access API — render folder connect UI
  panel.innerHTML = `
    <div id="folder-panel">
      <div id="folder-status" class="folder-status grey">Not connected</div>
      <div class="folder-btn-row">
        <button class="btn btn-primary" id="connect-folder-btn">📂 Connect Data Folder</button>
        <button class="btn btn-ghost btn-sm" id="refresh-folder-btn" title="Reload files" style="display:none">↻</button>
        <button class="btn btn-ghost btn-sm" id="disconnect-folder-btn" title="Disconnect" style="display:none">✕</button>
      </div>
      <div id="folder-path" class="folder-path grey" style="display:none"></div>
    </div>
    <div id="upload-list"></div>`;

  const connectBtn    = document.getElementById('connect-folder-btn');
  const refreshBtn    = document.getElementById('refresh-folder-btn');
  const disconnectBtn = document.getElementById('disconnect-folder-btn');
  const statusEl      = document.getElementById('folder-status');
  const pathEl        = document.getElementById('folder-path');

  let currentHandle = null;

  function setConnected(handle) {
    currentHandle = handle;
    statusEl.textContent = '● Connected';
    statusEl.className = 'folder-status green';
    connectBtn.style.display    = 'none';
    refreshBtn.style.display    = '';
    disconnectBtn.style.display = '';
    pathEl.textContent = handle.name;
    pathEl.style.display = '';
  }

  function setDisconnected() {
    currentHandle = null;
    statusEl.textContent = 'Not connected';
    statusEl.className = 'folder-status grey';
    connectBtn.style.display    = '';
    refreshBtn.style.display    = 'none';
    disconnectBtn.style.display = 'none';
    pathEl.style.display = 'none';
  }

  function setLoading(msg) {
    statusEl.textContent = '⏳ ' + msg;
    statusEl.className = 'folder-status grey';
  }

  // Try to restore saved handle on load
  setLoading('Reconnecting…');
  const saved = await restoreFolder();
  if (saved) {
    setLoading('Loading files…');
    const files = await loadAllFiles(saved);
    await handleFiles(files);
    setConnected(saved);
  } else {
    setDisconnected();
  }

  connectBtn.addEventListener('click', async () => {
    const handle = await pickFolder();
    if (!handle) return;
    setLoading('Loading files…');
    const files = await loadAllFiles(handle);
    await handleFiles(files);
    setConnected(handle);
  });

  refreshBtn.addEventListener('click', async () => {
    if (!currentHandle) return;
    setLoading('Refreshing…');
    const files = await loadAllFiles(currentHandle);
    await handleFiles(files);
    setConnected(currentHandle);
  });

  disconnectBtn.addEventListener('click', async () => {
    await disconnectFolder();
    setDisconnected();
  });
}
