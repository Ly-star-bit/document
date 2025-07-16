import { MessageCodec, Platform, getAllQueryString } from 'ranuts/utils';
import type { MessageHandler } from 'ranuts/utils';
import { downloadFromS3, listS3Files, uploadToS3 } from './lib/s3';
import { getS3Settings, showSettingsModal } from './lib/settings';
import {
  createSidebar,
  populateSidebar,
  setOnFileClickHandler,
  setOnRefreshHandler,
  showSidebar,
  toggleSidebar,
  addLoadMoreButton,
} from './lib/sidebar';
import { handleDocumentOperation, initX2T, loadEditorApi, loadScript } from './lib/x2t';
import { getDocmentObj, setDocmentObj } from './store';
import { showLoading } from './lib/loading';
import { renderPdf } from './lib/pdf';
import 'ranui/button';
import 'viewerjs/dist/viewer.css';
import Viewer from 'viewerjs';
import './styles/base.css';

interface RenderOfficeData {
  chunkIndex: number;
  data: string;
  lastModified: number;
  name: string;
  size: number;
  totalChunks: number;
  type: string;
}

interface RenderBufferData {
  buffer: ArrayBuffer;
  fileName: string;
}

declare global {
  interface Window {
    onCreateNew: (ext: string) => Promise<void>;
    DocsAPI: {
      DocEditor: new (elementId: string, config: any) => any;
    };
  }
}

let fileChunks: RenderOfficeData[] = [];

const events: Record<string, MessageHandler<any, unknown>> = {
  RENDER_BUFFER: async (data: RenderBufferData) => {
    // Hide the control panel when rendering office
    const controlPanel = document.getElementById('control-panel');
    if (controlPanel) {
      controlPanel.style.display = 'none';
    }
    const { removeLoading } = showLoading();
    
    // 创建File对象
    const file = new File([data.buffer], data.fileName, {
      type: 'application/octet-stream'
    });
    
    setDocmentObj({
      fileName: data.fileName,
      file: file,
      url: window.URL.createObjectURL(file),
    });
    
    await initX2T();
    await handleDocumentOperation({ file, fileName: data.fileName, isNew: false });
    removeLoading();
  },
  RENDER_OFFICE: async (data: RenderOfficeData) => {
    // Hide the control panel when rendering office
    const controlPanel = document.getElementById('control-panel');
    if (controlPanel) {
      controlPanel.style.display = 'none';
    }
    fileChunks.push(data);
    if (fileChunks.length >= data.totalChunks) {
      const { removeLoading } = showLoading();
      const file = await MessageCodec.decodeFileChunked(fileChunks);
      setDocmentObj({
        fileName: file.name,
        file: file,
        url: window.URL.createObjectURL(file),
      });
      await initX2T();
      const { fileName, file: fileBlob } = getDocmentObj();
      await handleDocumentOperation({ file: fileBlob, fileName, isNew: !fileBlob });
      fileChunks = [];
      removeLoading();
    }
  },
  CLOSE_EDITOR: () => {
    fileChunks = [];
    if (window.editor && typeof window.editor.destroyEditor === 'function') {
      window.editor.destroyEditor();
    }
  },
};

Platform.init(events);

const { file } = getAllQueryString();

// 添加隐藏 header 的函数
function hideHeader() {
  const container = document.getElementById('header-container');
  const toggleButton = document.getElementById('header-toggle');
  const spacer = document.getElementById('header-spacer');
  
  if (container && toggleButton) {
    const headerHeight = container.offsetHeight;
    container.style.top = `-${headerHeight}px`;
    toggleButton.style.top = '0';
    
    // 旋转箭头图标
    const arrow = toggleButton.querySelector('svg');
    if (arrow) {
      arrow.style.transform = 'rotate(180deg)';
    }
    
    // 更新占位符的高度
    if (spacer) {
      spacer.style.height = '0';
    }
  }
}

const onCreateNew = async (ext: string) => {
  const { removeLoading } = showLoading();
  setDocmentObj({
    fileName: 'New_Document' + ext,
    file: undefined,
    s3Key: undefined, // Ensure s3Key is cleared for new files
  });
  updateSaveButtonVisibility();
  await loadScript();
  await loadEditorApi();
  await initX2T();
  const { fileName, file: fileBlob } = getDocmentObj();
  await handleDocumentOperation({ file: fileBlob, fileName, isNew: !fileBlob });
  removeLoading();
  hideHeader(); // 创建新文件后隐藏 header
};
// example: window.onCreateNew('.docx')
// example: window.onCreateNew('.xlsx')
// example: window.onCreateNew('.pptx')
window.onCreateNew = onCreateNew;

// Create a single file input element
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.docx,.xlsx,.pptx,.doc,.xls,.ppt,.pdf';
fileInput.style.setProperty('visibility', 'hidden');
document.body.appendChild(fileInput);

// 初始化图片预览功能
function initImageViewer(file: File) {
  const placeholder = document.getElementById('placeholder');
  if (!placeholder) return;

  // 清空占位符，为新内容做准备
  placeholder.innerHTML = '';
  placeholder.style.display = 'flex';
  placeholder.style.justifyContent = 'center';
  placeholder.style.alignItems = 'center';
  placeholder.style.minHeight = '100vh';
  placeholder.style.padding = '20px';
  placeholder.style.boxSizing = 'border-box';

  // 创建图片容器
  const imgContainer = document.createElement('div');
  imgContainer.style.display = 'flex';
  imgContainer.style.justifyContent = 'center';
  imgContainer.style.alignItems = 'center';
  imgContainer.style.maxWidth = '100%';
  imgContainer.style.maxHeight = '100vh';

  // 创建图片元素
  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  img.style.maxWidth = '100%';
  img.style.maxHeight = 'calc(100vh - 40px)'; // 减去padding的高度
  img.style.objectFit = 'contain';

  imgContainer.appendChild(img);
  placeholder.appendChild(imgContainer);

  // 初始化 Viewer
  const viewer = new Viewer(img, {
    inline: false,
    viewed() {
      viewer.zoomTo(1);
    },
    toolbar: {
      zoomIn: true,
      zoomOut: true,
      oneToOne: true,
      reset: true,
      prev: false,
      play: false,
      next: false,
      rotateLeft: true,
      rotateRight: true,
      flipHorizontal: true,
      flipVertical: true,
    },
    title: false, // 隐藏标题
    transition: true, // 启用过渡效果
    loading: true, // 显示加载指示器
    keyboard: true, // 启用键盘支持
  });
}

const openFile = async (file: File) => {
  if (!file) return;

  // 统一销毁旧的编辑器实例
  if (window.editor && typeof window.editor.destroyEditor === 'function') {
    window.editor.destroyEditor();
  }
  const placeholder = document.getElementById('placeholder');
  if (placeholder) {
    // 清空占位符，为新内容做准备
    placeholder.innerHTML = '';
    placeholder.style.display = 'block';
  }

  const { removeLoading } = showLoading();
  const extension = file.name.split('.').pop()?.toLowerCase();

  // 处理图片文件
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension || '')) {
    initImageViewer(file);
    removeLoading();
    hideHeader();
    return;
  }

  // 处理 PDF 文件
  if (extension === 'pdf') {
    if (placeholder) {
      // 调整样式以适应 PDF 查看器
      placeholder.style.height = '100vh';
      placeholder.style.overflowY = 'auto';
      await renderPdf(file, { dom: placeholder });
    }
    removeLoading();
    hideHeader();
    return;
  }

  // 处理 Office 文档
  const currentDoc = getDocmentObj();
  setDocmentObj({
    ...currentDoc,
    fileName: file.name,
    file: file,
    url: window.URL.createObjectURL(file),
  });
  updateSaveButtonVisibility();
  await initX2T();
  const { fileName, file: fileBlob } = getDocmentObj();
  await handleDocumentOperation({ file: fileBlob, fileName, isNew: !fileBlob });
  removeLoading();
  hideHeader();
};

const onOpenDocument = async () => {
  return new Promise((resolve) => {
    // 触发文件选择器的点击事件
    fileInput.click();
    fileInput.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        await openFile(file);
        // 清空文件选择，这样同一个文件可以重复选择
        fileInput.value = '';
        resolve(true);
      } else {
        resolve(false);
      }
    };
  });
};

// Create and append the control panel
const createControlPanel = () => {
  // 创建控制面板容器
  const container = document.createElement('div');
  container.id = 'header-container';
  container.style.cssText = `
    width: 100%;
    background: linear-gradient(to right, #f8f9fa, #ffffff);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    border-bottom: 1px solid #eaeaea;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1000;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  `;

  // 添加一个切换按钮
  const toggleButton = document.createElement('div');
  toggleButton.id = 'header-toggle';
  toggleButton.style.cssText = `
    position: fixed;
    top: 0;
    right: 20px;
    width: 32px;
    height: 20px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-top: none;
    border-radius: 0 0 6px 6px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    cursor: pointer;
    z-index: 1001;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  `;
  
  // 添加切换按钮图标
  toggleButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 15l-6-6-6 6"/>
    </svg>
  `;

  // 添加切换按钮的悬停效果
  toggleButton.addEventListener('mouseenter', () => {
    toggleButton.style.backgroundColor = '#f8fafc';
  });
  toggleButton.addEventListener('mouseleave', () => {
    toggleButton.style.backgroundColor = '#ffffff';
  });

  // 添加切换按钮的点击事件
  toggleButton.addEventListener('click', () => {
    const isVisible = container.style.top === '0px';
    const headerHeight = container.offsetHeight;
    
    container.style.top = isVisible ? `-${headerHeight}px` : '0';
    toggleButton.style.top = isVisible ? '0' : `${headerHeight}px`;
    
    // 旋转箭头图标
    const arrow = toggleButton.querySelector('svg');
    if (arrow) {
      arrow.style.transform = isVisible ? 'rotate(180deg)' : 'rotate(0deg)';
    }
    
    // 更新占位符的高度
    const spacer = document.getElementById('header-spacer');
    if (spacer) {
      spacer.style.height = isVisible ? '0' : '80px';
    }
  });

  document.body.appendChild(toggleButton);

  const controlPanel = document.createElement('div');
  controlPanel.id = 'control-panel';
  controlPanel.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    padding: 16px 24px;
    max-width: 1200px;
    margin: 0 auto;
    align-items: center;
  `;

  // 创建标题区域
  const titleSection = document.createElement('div');
  titleSection.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    margin-right: auto;
  `;

  const logo = document.createElement('div');
  logo.style.cssText = `
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 18px;
    box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);
  `;
  logo.textContent = 'W';
  titleSection.appendChild(logo);

  const title = document.createElement('div');
  title.style.cssText = `
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    letter-spacing: -0.5px;
  `;
  title.textContent = 'Web Office';
  titleSection.appendChild(title);

  controlPanel.appendChild(titleSection);

  // 创建按钮组
  const buttonGroup = document.createElement('div');
  buttonGroup.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
  `;

  // 创建分隔的按钮组
  const actionButtonGroup = document.createElement('div');
  actionButtonGroup.style.cssText = `
    display: flex;
    gap: 8px;
    padding-right: 16px;
    border-right: 1px solid #e5e7eb;
  `;

  // Create new document buttons with updated styles
  const createDocxButton = document.createElement('r-button');
  createDocxButton.textContent = 'New Word';
  createDocxButton.style.cssText = `
    --r-button-hover-bg: #f3f4f6;
  `;
  createDocxButton.addEventListener('click', () => onCreateNew('.docx'));
  actionButtonGroup.appendChild(createDocxButton);

  const createXlsxButton = document.createElement('r-button');
  createXlsxButton.textContent = 'New Excel';
  createXlsxButton.style.cssText = `
    --r-button-hover-bg: #f3f4f6;
  `;
  createXlsxButton.addEventListener('click', () => onCreateNew('.xlsx'));
  actionButtonGroup.appendChild(createXlsxButton);

  const createPptxButton = document.createElement('r-button');
  createPptxButton.textContent = 'New PowerPoint';
  createPptxButton.style.cssText = `
    --r-button-hover-bg: #f3f4f6;
  `;
  createPptxButton.addEventListener('click', () => onCreateNew('.pptx'));
  actionButtonGroup.appendChild(createPptxButton);

  buttonGroup.appendChild(actionButtonGroup);

  // 创建上传和设置按钮组
  const utilityButtonGroup = document.createElement('div');
  utilityButtonGroup.style.cssText = `
    display: flex;
    gap: 8px;
  `;

  // Create upload button with primary style
  const uploadButton = document.createElement('r-button');
  uploadButton.setAttribute('type', 'primary');
  uploadButton.textContent = 'Upload Document';
  uploadButton.style.cssText = `
    --r-button-primary-bg: #2563eb;
    --r-button-primary-hover-bg: #1d4ed8;
  `;
  uploadButton.addEventListener('click', onOpenDocument);
  utilityButtonGroup.appendChild(uploadButton);

  // Save to S3 Button

  // 实现saveToS3函数
  async function saveToS3() {
    const { fileName, file } = getDocmentObj() || {};
    if (!file || !fileName) {
      alert('没有可保存的文件');
      return;
    }

    try {
      // 生成S3文件路径
      const s3Key = `documents/${fileName}`;
      
      // 将文件转换为Uint8Array
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      
      // 上传到S3
      const result = await uploadToS3(s3Key, data);
      if (result.success) {
        // 更新文档对象，添加s3Key
        setDocmentObj({
          fileName,
          file,
          url: window.URL.createObjectURL(file),
          s3Key,
        });
        window?.message?.success?.(`文件已保存到S3：${fileName}`);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('保存到S3失败:', error);
      alert(`保存到S3失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

 

  // Settings button with icon
  const settingsButton = document.createElement('r-button');
  settingsButton.setAttribute('type', 'secondary');
  settingsButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  `;
  settingsButton.style.cssText = `
    --r-button-hover-bg: #f3f4f6;
  `;
  settingsButton.addEventListener('click', showSettingsModal);
  utilityButtonGroup.appendChild(settingsButton);

  buttonGroup.appendChild(utilityButtonGroup);
  controlPanel.appendChild(buttonGroup);

  // 将控制面板添加到容器中
  container.appendChild(controlPanel);

  // 在 body 的最前面插入容器
  document.body.insertBefore(container, document.body.firstChild);

  // 添加一个占位 div 来防止内容被固定定位的控制面板遮挡
  const spacer = document.createElement('div');
  spacer.id = 'header-spacer';
  spacer.style.height = '80px';
  spacer.style.transition = 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
  document.body.insertBefore(spacer, container.nextSibling);
};

// Initialize the containers and sidebar
createControlPanel();
createSidebar();

// --- Sidebar and S3 Integration ---

let s3NextContinuationToken: string | undefined;
let s3SearchPrefix = '';
let s3IsLoading = false;

// Debounce function
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<F>): Promise<ReturnType<F>> =>
    new Promise((resolve) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => resolve(func(...args)), waitFor);
    });
}

// This function loads files from S3 and populates the sidebar
async function refreshS3FileList(append = false) {
  if (s3IsLoading) return;
  s3IsLoading = true;

  try {
    const { files, nextContinuationToken } = await listS3Files({
      prefix: s3SearchPrefix,
      continuationToken: append ? s3NextContinuationToken : undefined,
    });

    populateSidebar(files, append);
    s3NextContinuationToken = nextContinuationToken;

    if (nextContinuationToken) {
      addLoadMoreButton(() => refreshS3FileList(true));
    }
  } catch (error) {
    console.error('Failed to refresh S3 file list:', error);
  } finally {
    s3IsLoading = false;
  }
}

// Handler for the search input
const handleSearch = debounce(async (event: Event) => {
  const input = event.target as HTMLInputElement;
  s3SearchPrefix = input.value;
  s3NextContinuationToken = undefined; // Reset pagination
  await refreshS3FileList(false); // Fetch new search results
}, 300);

const searchInput = document.getElementById('s3-search-input');
if (searchInput) {
  searchInput.addEventListener('input', handleSearch);
}

// Set the handler for what happens when a file in the sidebar is clicked
setOnFileClickHandler(async (fileKey) => {
  try {
    const file = await downloadFromS3(fileKey);
    if (file) {
      // When opening from S3, set the s3Key
      setDocmentObj({
        fileName: file.name,
        file: file,
        url: window.URL.createObjectURL(file),
        s3Key: fileKey,
      });
      updateSaveButtonVisibility(); // Update button visibility
      await openFile(file);
      hideHeader(); // 从 S3 加载文件后隐藏 header
    }
  } catch (error) {
    // Error is already handled in downloadFromS3
    console.error(`Failed to open file ${fileKey} from S3.`);
  }
});

// Set the handler for refreshing the file list
setOnRefreshHandler(() => {
  s3NextContinuationToken = undefined; // Reset pagination
  refreshS3FileList(false); // Refresh the file list
});

function updateSaveButtonVisibility() {
  // 这个函数不再需要了
}

// Listen for the custom event dispatched when S3 settings are saved
document.addEventListener('s3-settings-saved', () => {
  refreshS3FileList();
});

// On initial page load, check if S3 settings exist and load the file list
if (getS3Settings()) {
  refreshS3FileList().then(() => {
    // Automatically show the sidebar if there are files
    const fileList = document.getElementById('s3-file-list');
    if (fileList && fileList.children.length > 0) {
      // We need to check if it's not just the "no files" message
      const firstChild = fileList.firstChild as HTMLElement;
      if (firstChild.tagName === 'LI') {
         showSidebar();
      }
    }
  });
}

if (!file) {
  // Don't automatically open document dialog, let user choose
  // onOpenDocument();
} else {
  setDocmentObj({
    fileName: Math.random().toString(36).substring(2, 15),
    url: file,
  });
}
