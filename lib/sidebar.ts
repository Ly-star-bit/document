import type { S3File } from './s3';
import { downloadFromS3, deleteFromS3 } from './s3';

// A callback function type for when a file is clicked in the sidebar
type FileClickHandler = (fileKey: string) => void;

// A callback function type for when the file list needs to be refreshed
type RefreshHandler = () => void;

// Add a declaration for the SweetAlert2 library
declare const Swal: any;

let onFileClick: FileClickHandler | null = null;
let onRefresh: RefreshHandler | null = null;

// Sets the handler that will be executed when a file item is clicked
export function setOnFileClickHandler(handler: FileClickHandler) {
  onFileClick = handler;
}

// Sets the handler that will be executed when the file list needs to be refreshed
export function setOnRefreshHandler(handler: RefreshHandler) {
  onRefresh = handler;
}

// Helper function to inject the SweetAlert2 library for custom dialogs
function addSweetAlert2() {
  if (document.getElementById('sweetalert2-script')) return;

  const script = document.createElement('script');
  script.id = 'sweetalert2-script';
  script.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
  document.head.appendChild(script);

  const style = document.createElement('style');
  style.textContent = `
    .swal2-popup {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
      border-radius: 12px !important;
      box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1) !important;
    }
    .swal2-title {
      font-size: 18px !important;
      font-weight: 600 !important;
      color: #111827 !important;
    }
    .swal2-html-container {
      font-size: 14px !important;
      color: #4b5563 !important;
    }
    .swal2-confirm {
      background-color: #dc2626 !important;
      border-radius: 6px !important;
      font-weight: 500 !important;
      transition: background-color 0.2s ease !important;
    }
    .swal2-confirm:hover {
      background-color: #b91c1c !important;
    }
    .swal2-confirm:focus {
      box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.4) !important;
    }
    .swal2-cancel {
      border-radius: 6px !important;
      font-weight: 500 !important;
    }
    .swal2-icon.swal2-warning {
        border-color: #f97316 !important;
        color: #f97316 !important;
    }
  `;
  document.head.appendChild(style);
}


// Helper function to format file size
function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return 'N/A';

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

// Helper function to download a file
async function handleDownload(fileKey: string, event: Event) {
  event.stopPropagation(); // Prevent file click event

  try {
    const file = await downloadFromS3(fileKey);
    if (file) {
      // Create a download link and trigger download
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('Download failed:', error);
  }
}

// Helper function to delete a file with a custom confirmation dialog
async function handleDelete(fileKey: string, event: Event) {
  event.stopPropagation(); // Prevent file click event

  const fileName = fileKey.split('/').pop() || fileKey;
  
  // Use SweetAlert2 for a better confirmation dialog
  Swal.fire({
    title: 'Delete File?',
    html: `Are you sure you want to delete <strong>"${fileName}"</strong>?<br/>This action cannot be undone.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, delete it',
    cancelButtonText: 'Cancel',
  }).then(async (result: any) => {
    if (result.isConfirmed) {
      try {
        const deleteResult = await deleteFromS3(fileKey);
        if (deleteResult.success) {
          Swal.fire({
            title: 'Deleted!',
            text: `"${fileName}" has been successfully deleted.`,
            icon: 'success',
            timer: 2000,
            showConfirmButton: false,
          });
          onRefresh?.();
        } else {
            throw new Error(deleteResult.error || 'Failed to delete file from S3.');
        }
      } catch (error) {
        console.error('Delete failed:', error);
        Swal.fire({
          title: 'Error!',
          text: 'An unexpected error occurred while deleting the file.',
          icon: 'error',
        });
      }
    }
  });
}

// Creates the sidebar element and adds it to the document
export function createSidebar() {
  if (document.getElementById('s3-sidebar')) {
    // Sidebar already exists
    return;
  }

  // Inject the SweetAlert2 library for custom dialogs
  addSweetAlert2();

  const sidebar = document.createElement('div');
  sidebar.id = 's3-sidebar';
  sidebar.style.cssText = `
    position: fixed;
    top: 0;
    left: -320px; /* Start hidden off-screen */
    width: 300px;
    height: 100%;
    background: #ffffff;
    border-right: 1px solid #e5e7eb;
    box-shadow: 4px 0 12px rgba(0,0,0,0.05);
    z-index: 1500;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    padding-top: 80px; /* 为顶部工具栏留出空间 */
  `;

  // 添加侧边栏触发器
  const sidebarHandle = document.createElement('div');
  sidebarHandle.id = 's3-sidebar-handle';
  sidebarHandle.style.cssText = `
    position: fixed;
    top: 50%;
    left: 0;
    transform: translateY(-50%);
    width: 24px;
    height: 48px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-left: none;
    border-radius: 0 6px 6px 0;
    box-shadow: 4px 0 12px rgba(0,0,0,0.05);
    cursor: pointer;
    z-index: 1499;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  `;
  
  // 添加图标
  sidebarHandle.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 18l6-6-6-6"/>
    </svg>
  `;

  // 添加悬停效果
  sidebarHandle.addEventListener('mouseenter', () => {
    sidebarHandle.style.backgroundColor = '#f8fafc';
  });
  sidebarHandle.addEventListener('mouseleave', () => {
    sidebarHandle.style.backgroundColor = '#ffffff';
  });

  // 点击时显示侧边栏
  sidebarHandle.addEventListener('click', () => {
    showSidebar();
    sidebarHandle.style.display = 'none';
  });

  document.body.appendChild(sidebarHandle);

  // 添加标题和文件列表
  const sidebarContent = document.createElement('div');
  sidebarContent.style.cssText = `
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: #f8fafc;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    padding: 16px 20px;
    border-bottom: 1px solid #e5e7eb;
    margin-bottom: 8px;
    background: #ffffff;
    display: flex;
    flex-direction: column; /* Changed to column */
    gap: 12px; /* Added gap */
  `;

  const headerTopRow = document.createElement('div');
  headerTopRow.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  const titleContainer = document.createElement('div');
  titleContainer.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  const title = document.createElement('h3');
  title.style.cssText = `
    margin: 0;
    color: #111827;
    font-size: 16px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  // 添加文件图标到标题
  title.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 3h18v18H3zM9 3v18"/>
    </svg>
    S3 Files
  `;

  titleContainer.appendChild(title);
  headerTopRow.appendChild(titleContainer);

  // 添加关闭按钮
  const closeButton = document.createElement('button');
  closeButton.style.cssText = `
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
    border-radius: 4px;
    transition: all 0.2s ease;
  `;
  closeButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  `;
  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.backgroundColor = '#f1f5f9';
    closeButton.style.color = '#0f172a';
  });
  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.backgroundColor = 'transparent';
    closeButton.style.color = '#64748b';
  });
  closeButton.addEventListener('click', () => {
    const sidebar = document.getElementById('s3-sidebar');
    const handle = document.getElementById('s3-sidebar-handle');
    if (sidebar) {
      sidebar.style.left = '-320px';
      if (handle) {
        handle.style.display = 'flex';
      }
    }
  });

  headerTopRow.appendChild(closeButton);
  header.appendChild(headerTopRow);

  // Add Search Input
  const searchInput = document.createElement('input');
  searchInput.id = 's3-search-input';
  searchInput.placeholder = 'Search files...';
  searchInput.style.cssText = `
    width: 100%;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    font-size: 14px;
    box-sizing: border-box;
    transition: all 0.2s ease;
  `;
  searchInput.addEventListener('focus', () => {
    searchInput.style.borderColor = '#2563eb';
    searchInput.style.boxShadow = '0 0 0 2px rgba(37, 99, 235, 0.2)';
  });
  searchInput.addEventListener('blur', () => {
    searchInput.style.borderColor = '#e5e7eb';
    searchInput.style.boxShadow = 'none';
  });

  header.appendChild(searchInput);

  sidebarContent.appendChild(header);

  const fileList = document.createElement('ul');
  fileList.id = 's3-file-list';
  fileList.style.cssText = `
    list-style: none;
    padding: 8px;
    margin: 0;
    overflow-y: auto;
    flex-grow: 1;
    scrollbar-width: thin;
    scrollbar-color: #94a3b8 #f1f5f9;
  `;

  // 添加自定义滚动条样式
  const scrollbarStyles = document.createElement('style');
  scrollbarStyles.textContent = `
    #s3-file-list::-webkit-scrollbar {
      width: 4px;
    }
    #s3-file-list::-webkit-scrollbar-track {
      background: transparent;
    }
    #s3-file-list::-webkit-scrollbar-thumb {
      background-color: #cbd5e1;
      border-radius: 2px;
    }
    #s3-file-list:hover::-webkit-scrollbar-thumb {
      background-color: #94a3b8;
    }
  `;
  document.head.appendChild(scrollbarStyles);

  sidebarContent.appendChild(fileList);
  sidebar.appendChild(sidebarContent);
  document.body.appendChild(sidebar);

  // 使用事件委托处理文件点击
  fileList.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const listItem = target.closest('li');
    if (listItem && listItem.dataset.fileKey) {
      // 移除其他项目的选中状态
      fileList.querySelectorAll('li').forEach(item => {
        item.classList.remove('selected');
        item.style.backgroundColor = '#ffffff'; // Revert background
      });
      // 添加选中状态
      listItem.classList.add('selected');
      listItem.style.backgroundColor = '#f1f5f9'; // Use a selection color
      onFileClick?.(listItem.dataset.fileKey);
    }
  });
}

// Populates the sidebar with a list of file keys
export function populateSidebar(files: S3File[], append = false) {
  const fileList = document.getElementById('s3-file-list');
  if (!fileList) return;

  if (!append) {
    fileList.innerHTML = ''; // Clear only if not appending
  }

  // Remove existing "load more" button before adding new items
  const existingLoadMoreButton = fileList.querySelector('.load-more-button');
  if (existingLoadMoreButton) {
    existingLoadMoreButton.remove();
  }

  if (files.length === 0 && !append) {
    const emptyState = document.createElement('div');
    emptyState.style.cssText = `
      padding: 32px 20px;
      text-align: center;
      color: #64748b;
      font-size: 14px;
      background: #ffffff;
      border-radius: 8px;
      margin: 16px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    `;
    emptyState.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 16px; display: block;">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
        <polyline points="13 2 13 9 20 9"></polyline>
      </svg>
      <div style="font-weight: 500; margin-bottom: 4px;">No files found</div>
      <div style="color: #94a3b8; font-size: 13px;">Upload files to your S3 bucket to see them here</div>
    `;
    fileList.appendChild(emptyState);
    return;
  }

  files.forEach(file => {
    const listItem = document.createElement('li');
    const fileName = file.key.split('/').pop() || file.key;
    
    const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
    let iconColor = '#6b7280';
    
    switch(fileExtension) {
      case 'docx': case 'doc': iconColor = '#2563eb'; break;
      case 'xlsx': case 'xls': iconColor = '#059669'; break;
      case 'pptx': case 'ppt': iconColor = '#dc2626'; break;
    }

    const fileIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;

    const lastModifiedString = file.lastModified
      ? new Date(file.lastModified).toLocaleString()
      : 'N/A';

    const fileSizeString = formatFileSize(file.size);

    // **** CHANGED: Reworked HTML to prevent UI overlap ****
    listItem.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
        ${fileIcon}
        <div style="flex: 1; overflow: hidden;">
          <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${fileName}">${fileName}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
            <span>${fileSizeString}</span>
          </div>
        </div>
      </div>
      <div class="meta-and-actions" style="position: relative; display: flex; align-items: center; flex-shrink: 0;">
        <span class="file-last-modified" style="font-size: 12px; color: #64748b; transition: opacity 0.2s ease; opacity: 1;">${lastModifiedString}</span>
        <div class="file-actions" style="position: absolute; right: 0; display: flex; gap: 4px; transition: opacity 0.2s ease; opacity: 0; pointer-events: none;">
          <button class="download-btn" title="Download file" style="background: transparent; border: none; cursor: pointer; padding: 4px; border-radius: 4px; display: flex; color: #059669; transition: all 0.2s ease;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </button>
          <button class="delete-btn" title="Delete file" style="background: transparent; border: none; cursor: pointer; padding: 4px; border-radius: 4px; display: flex; color: #dc2626; transition: all 0.2s ease;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="m10 11 0 6"></path><path d="m14 11 0 6"></path></svg>
          </button>
        </div>
      </div>
    `;

    listItem.title = `${file.key}\nSize: ${fileSizeString}\nLast Modified: ${new Date(file.lastModified!).toLocaleString()}`;
    listItem.dataset.fileKey = file.key;
    listItem.style.cssText = `
      padding: 10px 12px;
      cursor: pointer;
      font-size: 14px;
      color: #374151;
      transition: all 0.15s ease;
      border-radius: 6px;
      background: #ffffff;
      margin-bottom: 4px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    // **** CHANGED: Updated hover logic to fade between timestamp and actions ****
    const lastModified = listItem.querySelector('.file-last-modified') as HTMLElement;
    const fileActions = listItem.querySelector('.file-actions') as HTMLElement;
    const downloadBtn = listItem.querySelector('.download-btn') as HTMLButtonElement;
    const deleteBtn = listItem.querySelector('.delete-btn') as HTMLButtonElement;

    listItem.addEventListener('mouseenter', () => {
      if (!listItem.classList.contains('selected')) {
        listItem.style.transform = 'translateY(-1px)';
        listItem.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
      }
      lastModified.style.opacity = '0';
      fileActions.style.opacity = '1';
      fileActions.style.pointerEvents = 'auto';
    });

    listItem.addEventListener('mouseleave', () => {
      if (!listItem.classList.contains('selected')) {
        listItem.style.transform = 'none';
        listItem.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
      }
       lastModified.style.opacity = '1';
       fileActions.style.opacity = '0';
       fileActions.style.pointerEvents = 'none';
    });

    downloadBtn.addEventListener('mouseenter', () => downloadBtn.style.backgroundColor = '#f0fdf4');
    downloadBtn.addEventListener('mouseleave', () => downloadBtn.style.backgroundColor = 'transparent');
    downloadBtn.addEventListener('click', (event) => handleDownload(file.key, event));
    
    deleteBtn.addEventListener('mouseenter', () => deleteBtn.style.backgroundColor = '#fef2f2');
    deleteBtn.addEventListener('mouseleave', () => deleteBtn.style.backgroundColor = 'transparent');
    deleteBtn.addEventListener('click', (event) => handleDelete(file.key, event));

    fileList.appendChild(listItem);
  });
}


export function addLoadMoreButton(onClick: () => void) {
  const fileList = document.getElementById('s3-file-list');
  if (!fileList) return;

  const existingButton = fileList.querySelector('.load-more-button');
  if (existingButton) existingButton.remove();

  const loadMoreItem = document.createElement('li');
  loadMoreItem.className = 'load-more-button';
  loadMoreItem.style.cssText = 'padding: 0 8px;';
  const button = document.createElement('button');
  button.textContent = 'Load More';
  button.style.cssText = `
    width: 100%;
    padding: 10px;
    border: none;
    background: #e5e7eb;
    color: #111827;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.2s ease;
  `;
  button.addEventListener('mouseenter', () => button.style.backgroundColor = '#d1d5db');
  button.addEventListener('mouseleave', () => button.style.backgroundColor = '#e5e7eb');
  button.addEventListener('click', onClick);

  loadMoreItem.appendChild(button);
  fileList.appendChild(loadMoreItem);
}

export function showSidebar() {
  const sidebar = document.getElementById('s3-sidebar');
  const handle = document.getElementById('s3-sidebar-handle');
  if (sidebar) {
    sidebar.style.left = '0';
    if (handle) {
      handle.style.display = 'none';
    }
  }
}

export function toggleSidebar() {
  const sidebar = document.getElementById('s3-sidebar');
  const handle = document.getElementById('s3-sidebar-handle');
  if (sidebar) {
    const isVisible = sidebar.style.left === '0px';
    sidebar.style.left = isVisible ? '-320px' : '0';
    if (handle) {
      handle.style.display = isVisible ? 'flex' : 'none';
    }
  }
}