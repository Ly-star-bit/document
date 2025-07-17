import { isSafari } from 'ranuts/utils';

export interface BaseReturn<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
}

export interface RenderOptions {
  dom: HTMLElement;
  onLoad?: (msg: BaseReturn) => void;
  onError?: (msg: BaseReturn) => void;
  baseUrl?: string;
}

export const renderPdf = async (file: File | string, options: RenderOptions): Promise<void> => {
  try {
    const { dom, onLoad, onError, baseUrl = '/document' } = options;
    
    if (!dom) {
      throw new Error('DOM element not provided');
    }
    
    // 设置容器样式
    dom.style.setProperty('display', 'flex');
    dom.style.setProperty('flex-direction', 'column');
    dom.style.setProperty('width', '100%');
    dom.style.setProperty('height', '100%');
    dom.style.setProperty('position', 'relative');

    // 创建 iframe
    const iframe = document.createElement('iframe');
    iframe.style.setProperty('position', 'absolute');
    iframe.style.setProperty('top', '0');
    iframe.style.setProperty('left', '0');
    iframe.style.setProperty('width', '100%');
    iframe.style.setProperty('height', '100%');
    iframe.style.setProperty('border', 'none');

    // 获取文件 URL
    let fileUrl: string;
    if (typeof file === 'string') {
      fileUrl = file;
    } else {
      fileUrl = URL.createObjectURL(file);
    }

    // 设置 viewer URL，使用 baseUrl
    const viewerPath = '/web-apps/apps/pdfjs-5.3.93/web/viewer.html';
    const viewerUrl = `${baseUrl}${viewerPath}?file=${encodeURIComponent(fileUrl)}`;
    iframe.src = viewerUrl;

    // 清空容器并添加 iframe
    dom.innerHTML = '';
    dom.appendChild(iframe);

    // 监听 iframe 加载完成事件
    iframe.onload = () => {
      if (onLoad) {
        onLoad({ success: true, data: null });
      }
    };

    // 监听 iframe 加载错误事件
    iframe.onerror = (error) => {
      console.error('Failed to load PDF viewer:', error);
      if (onError) {
        onError({ 
          success: false, 
          data: null, 
          message: error instanceof Error ? error.message : 'Failed to load PDF viewer' 
        });
      }
    };
    
  } catch (error) {
    console.error('Failed to render PDF:', error);
    if (options.onError) {
      options.onError({ 
        success: false, 
        data: null, 
        message: error instanceof Error ? error.message : 'Failed to render PDF' 
      });
    }
  }
};

// 清理函数
export const destroyPdf = (dom: HTMLElement): void => {
  const iframe = dom.querySelector('iframe');
  if (iframe) {
    // 如果是 Blob URL，需要释放
    if (iframe.src.startsWith('blob:')) {
      URL.revokeObjectURL(iframe.src);
    }
  }
  dom.innerHTML = '';
};