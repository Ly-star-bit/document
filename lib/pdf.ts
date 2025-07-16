import { isSafari } from 'ranuts/utils';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocumentProxy as _PDFDocumentProxy, PDFPageProxy as _PDFPageProxy } from 'pdfjs-dist';

export interface BaseReturn<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
}

export interface RenderOptions {
  dom: HTMLElement;
  onLoad?: (msg: BaseReturn) => void;
  onError?: (msg: BaseReturn) => void;
}

export interface Viewport {
  width: number;
  height: number;
  viewBox: Array<number>;
}

export interface RenderContext {
  canvasContext: CanvasRenderingContext2D;
  viewport: Viewport;
  transform: Array<number>;
}

type PDFDocumentProxy = _PDFDocumentProxy;
type PDFPageProxy = _PDFPageProxy;

export class PdfPreview {
  private pdfDoc: PDFDocumentProxy | undefined;
  pageNumber: number;
  total: number;
  dom: HTMLElement;
  pdf: string | ArrayBuffer;
  onError: ((msg: BaseReturn) => void) | undefined;
  onLoad: ((msg: BaseReturn) => void) | undefined;
  private pageContainer: HTMLDivElement;
  private controlsContainer: HTMLDivElement;
  private pageIndicator: HTMLDivElement;
  private tocContainer: HTMLDivElement;
  private tocButton: HTMLButtonElement;
  private tocSearchInput: HTMLInputElement;
  private tocListContainer: HTMLDivElement;
  private loadingIndicator: HTMLDivElement;
  private isLoading: boolean;
  private intersectionObserver: IntersectionObserver;
  private visiblePages: Set<number>;

  constructor(pdf: string | ArrayBuffer, options: RenderOptions) {
    const { dom, onError, onLoad } = options;
    this.pageNumber = 0;
    this.total = 0;
    this.pdfDoc = undefined;
    this.pdf = pdf;
    this.dom = dom;
    this.onError = onError;
    this.onLoad = onLoad;
    this.isLoading = false;
    this.visiblePages = new Set();

    // 创建一个容器来包含页面和目录
    const container = document.createElement('div');
    container.style.setProperty('display', 'flex');
    container.style.setProperty('width', '100%');
    container.style.setProperty('height', '100%');
    container.style.setProperty('position', 'relative');
    this.dom.appendChild(container);

    // 创建页面容器
    this.pageContainer = document.createElement('div');
    this.pageContainer.style.setProperty('flex', '1');
    this.pageContainer.style.setProperty('height', '100%');
    this.pageContainer.style.setProperty('overflow-y', 'auto');
    this.pageContainer.style.setProperty('display', 'flex');
    this.pageContainer.style.setProperty('flex-direction', 'column');
    this.pageContainer.style.setProperty('align-items', 'center');
    this.pageContainer.style.setProperty('gap', '10px');
    container.appendChild(this.pageContainer);

    // 创建控制栏容器
    this.controlsContainer = document.createElement('div');
    this.controlsContainer.style.setProperty('position', 'fixed');
    this.controlsContainer.style.setProperty('top', '10px');
    this.controlsContainer.style.setProperty('left', '10px');
    this.controlsContainer.style.setProperty('display', 'flex');
    this.controlsContainer.style.setProperty('gap', '10px');
    this.controlsContainer.style.setProperty('z-index', '1');
    container.appendChild(this.controlsContainer);

    this.pageIndicator = document.createElement('div');
    this.pageIndicator.style.setProperty('background-color', 'rgba(0, 0, 0, 0.5)');
    this.pageIndicator.style.setProperty('color', 'white');
    this.pageIndicator.style.setProperty('padding', '5px 10px');
    this.pageIndicator.style.setProperty('border-radius', '5px');
    this.controlsContainer.appendChild(this.pageIndicator);

    this.tocButton = document.createElement('button');
    this.tocButton.textContent = '目录';
    this.tocButton.style.setProperty('display', 'none');
    this.tocButton.style.setProperty('padding', '5px 10px');
    this.tocButton.style.setProperty('border-radius', '5px');
    this.tocButton.style.setProperty('border', 'none');
    this.tocButton.style.setProperty('background-color', 'rgba(0, 0, 0, 0.5)');
    this.tocButton.style.setProperty('color', 'white');
    this.tocButton.style.setProperty('cursor', 'pointer');
    this.tocButton.onclick = this.toggleToc;
    this.controlsContainer.appendChild(this.tocButton);

    // 创建目录容器
    this.tocContainer = document.createElement('div');
    this.tocContainer.style.setProperty('display', 'block'); // 改为始终显示
    this.tocContainer.style.setProperty('position', 'fixed');
    this.tocContainer.style.setProperty('top', '0');
    this.tocContainer.style.setProperty('right', '0');
    this.tocContainer.style.setProperty('width', '300px');
    this.tocContainer.style.setProperty('height', '100%');
    this.tocContainer.style.setProperty('background', 'white');
    this.tocContainer.style.setProperty('box-shadow', '-2px 0 5px rgba(0, 0, 0, 0.1)');
    this.tocContainer.style.setProperty('z-index', '100');
    this.tocContainer.style.setProperty('transition', 'transform 0.3s ease');
    this.tocContainer.style.setProperty('transform', 'translateX(100%)');
    container.appendChild(this.tocContainer);

    // 创建目录搜索框
    this.tocSearchInput = document.createElement('input');
    this.tocSearchInput.type = 'text';
    this.tocSearchInput.placeholder = '搜索目录...';
    this.tocSearchInput.style.setProperty('position', 'sticky');
    this.tocSearchInput.style.setProperty('top', '0');
    this.tocSearchInput.style.setProperty('width', 'calc(100% - 20px)');
    this.tocSearchInput.style.setProperty('padding', '10px');
    this.tocSearchInput.style.setProperty('margin', '10px');
    this.tocSearchInput.style.setProperty('box-sizing', 'border-box');
    this.tocSearchInput.style.setProperty('border', '1px solid #ccc');
    this.tocSearchInput.style.setProperty('border-radius', '5px');
    this.tocSearchInput.oninput = this.handleTocSearch;
    this.tocContainer.appendChild(this.tocSearchInput);

    // 创建目录列表容器
    this.tocListContainer = document.createElement('div');
    this.tocListContainer.style.setProperty('padding', '0 10px');
    this.tocListContainer.style.setProperty('height', 'calc(100% - 60px)');
    this.tocListContainer.style.setProperty('overflow-y', 'auto');
    this.tocContainer.appendChild(this.tocListContainer);

    // 创建加载指示器
    this.loadingIndicator = document.createElement('div');
    this.loadingIndicator.style.setProperty('position', 'fixed');
    this.loadingIndicator.style.setProperty('top', '50%');
    this.loadingIndicator.style.setProperty('left', '50%');
    this.loadingIndicator.style.setProperty('transform', 'translate(-50%, -50%)');
    this.loadingIndicator.style.setProperty('background', 'rgba(0, 0, 0, 0.7)');
    this.loadingIndicator.style.setProperty('color', 'white');
    this.loadingIndicator.style.setProperty('padding', '15px 30px');
    this.loadingIndicator.style.setProperty('border-radius', '5px');
    this.loadingIndicator.style.setProperty('display', 'none');
    this.loadingIndicator.style.setProperty('z-index', '1000');
    this.loadingIndicator.textContent = '加载中...';
    container.appendChild(this.loadingIndicator);

    this.pageContainer.addEventListener('scroll', this.handleScroll);

    this.intersectionObserver = new IntersectionObserver(this.handlePageIntersection, {
      root: this.pageContainer,
      threshold: 0.1,
    });
  }

  private toggleToc = (): void => {
    const isHidden = this.tocContainer.style.transform === 'translateX(100%)';
    this.tocContainer.style.transform = isHidden ? 'translateX(0)' : 'translateX(100%)';
    
    // 更新按钮状态
    this.tocButton.style.backgroundColor = isHidden ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)';
    
    if (isHidden) {
      this.tocSearchInput.value = '';
      this.handleTocSearch();
      // 当目录打开时，让搜索框获得焦点
      this.tocSearchInput.focus();
    }
  };

  public destroy = () => {
    this.pageContainer.removeEventListener('scroll', this.handleScroll);
    this.intersectionObserver.disconnect();
    this.dom.innerHTML = '';
    if (this.pdfDoc) {
      this.pdfDoc.destroy();
    }
  };

  private handlePageIntersection = (entries: IntersectionObserverEntry[]): void => {
    entries.forEach((entry) => {
      const pageNum = parseInt(entry.target.getAttribute('data-page-number') || '0', 10);
      if (!pageNum) return;

      if (entry.isIntersecting) {
        this.visiblePages.add(pageNum);
      } else {
        this.visiblePages.delete(pageNum);
      }
    });

    if (this.visiblePages.size > 0) {
      const currentPage = Math.max(...Array.from(this.visiblePages));
      this.updatePageIndicator(currentPage);
    }
  };

  private updatePageIndicator = (currentPage: number): void => {
    if (this.total > 0) {
      this.pageIndicator.textContent = `${currentPage} / ${this.total}`;
    }
  };

  private showLoading = () => {
    this.loadingIndicator.style.display = 'block';
    this.isLoading = true;
  };

  private hideLoading = () => {
    this.loadingIndicator.style.display = 'none';
    this.isLoading = false;
  };

  // 添加一个延迟函数，让主线程有机会更新UI
  private delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // 分批渲染页面
  private async renderPagesBatch(startPage: number, endPage: number): Promise<void> {
    for (let i = startPage; i <= endPage && i <= this.total; i++) {
      await this.getPdfPage(i);
      // 每渲染一页后给UI一个更新的机会
      await this.delay(10);
    }
  }

  private navigateToPage = async (pageNumber: number): Promise<void> => {
    if (pageNumber < 1 || pageNumber > this.total || !this.pdfDoc || this.isLoading) {
      return;
    }

    try {
      this.showLoading();

      // 清空现有页面并停止观察
      this.pageContainer.innerHTML = '';
      this.intersectionObserver.disconnect();
      this.visiblePages.clear();

      // 设置起始页码
      this.pageNumber = pageNumber - 1;
      this.dom.scrollTop = 0;

      // 先渲染目标页面及其后的2页
      const initialBatchSize = 3;
      await this.renderPagesBatch(pageNumber, pageNumber + initialBatchSize - 1);

      // 如果第一批页面没有填满视口，继续渲染
      if (this.pageContainer.scrollHeight < this.dom.clientHeight) {
        const remainingPages = Math.min(
          this.total - (pageNumber + initialBatchSize),
          Math.ceil((this.dom.clientHeight - this.pageContainer.scrollHeight) / (this.pageContainer.scrollHeight / initialBatchSize))
        );
        if (remainingPages > 0) {
          await this.renderPagesBatch(pageNumber + initialBatchSize, pageNumber + initialBatchSize + remainingPages - 1);
        }
      }
    } catch (error) {
      console.error('Navigation failed:', error);
      if (this.onError) {
        this.onError({ success: false, data: null, message: String(error) });
      }
    } finally {
      this.hideLoading();
    }
  };

  private handleScroll = () => {
    if (this.isLoading || this.pageNumber >= this.total) {
      return;
    }

    // 在滚动到底部附近时加载下一页
    if (this.dom.scrollTop + this.dom.clientHeight >= this.dom.scrollHeight - 200) {
      this.renderNextPage();
    }
  };

  private renderNextPage = async () => {
    if (this.isLoading || this.pageNumber >= this.total) {
      return;
    }

    this.isLoading = true;
    const nextPageToRender = this.pageNumber + 1;
    console.log(`Loading page ${nextPageToRender}`);
    await this.getPdfPage(nextPageToRender);
    this.pageNumber = nextPageToRender;
    this.isLoading = false;
    console.log(`Page ${this.pageNumber} loaded`);
  };

  private getPdfPage = async (number: number): Promise<BaseReturn> => {
    console.log('Getting PDF page:', number);
    if (!this.pdfDoc) {
      const error = new Error('pdfDoc is undefined');
      console.error(error);
      return { success: false, data: null, message: error.message };
    }

    try {
      const page: PDFPageProxy = await this.pdfDoc.getPage(number);
      console.log('Page retrieved successfully:', number);

      const deviceScale = isSafari() ? Math.min(window.devicePixelRatio, 2) : window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: deviceScale });

      const canvas = document.createElement('canvas');
      canvas.setAttribute('data-page-number', String(number));
      canvas.style.setProperty('display', 'block');
      canvas.style.setProperty('max-width', '100%');

      // 创建一个容器来包装 canvas 和分割线
      const pageWrapper = document.createElement('div');
      pageWrapper.style.setProperty('width', '100%');
      pageWrapper.style.setProperty('display', 'flex');
      pageWrapper.style.setProperty('flex-direction', 'column');
      pageWrapper.style.setProperty('align-items', 'center');
      
      // 添加 canvas 到容器
      pageWrapper.appendChild(canvas);
      
      // 如果不是最后一页，添加分割线
      if (number < this.total) {
        const divider = document.createElement('hr');
        divider.style.setProperty('width', '80%');
        divider.style.setProperty('margin', '20px 0');
        divider.style.setProperty('border', 'none');
        divider.style.setProperty('height', '1px');
        divider.style.setProperty('background-color', '#e0e0e0');
        pageWrapper.appendChild(divider);
      }

      this.pageContainer.appendChild(pageWrapper);
      this.intersectionObserver.observe(canvas);
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Failed to get canvas context');
      }

      // 设置 canvas 绘图表面的真实像素大小
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      console.log('Canvas setup complete. Size:', {
        width: canvas.width,
        height: canvas.height,
        styleWidth: canvas.style.width,
        styleHeight: canvas.style.height,
      });

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      console.log('Starting page render');
      await page.render(renderContext).promise;
      console.log('Page rendered successfully');
      return { success: true, data: page };
    } catch (error: unknown) {
      console.error('Failed to get or render page:', error);
      const message = error instanceof Error ? error.message : String(error);
      if (this.onError) {
        this.onError({ success: false, data: null, message });
      }
      return { success: false, data: null, message };
    }
  };

  private handleTocSearch = (): void => {
    const searchText = this.tocSearchInput.value.toLowerCase().trim();
    const list = this.tocListContainer.querySelector('ul');
    if (!list) return;

    const items = list.children;
    for (let i = 0; i < items.length; i++) {
      if (items[i].tagName === 'LI') {
        this.filterTocItem(items[i] as HTMLLIElement, searchText);
      }
    }
  };

  private filterTocItem = (item: HTMLLIElement, searchText: string): boolean => {
    const titleSpan = item.querySelector('span');
    let ownTextMatch = false;
    if (titleSpan) {
      ownTextMatch = titleSpan.textContent?.toLowerCase().includes(searchText) ?? false;
    }

    const sublist = item.querySelector('ul');
    let childMatch = false;
    if (sublist) {
      const subItems = sublist.children;
      for (let i = 0; i < subItems.length; i++) {
        if (subItems[i].tagName === 'LI') {
          if (this.filterTocItem(subItems[i] as HTMLLIElement, searchText)) {
            childMatch = true;
          }
        }
      }
    }

    const shouldBeVisible = ownTextMatch || childMatch;
    item.style.display = shouldBeVisible ? '' : 'none';
    return shouldBeVisible;
  };

  private renderOutline = async (): Promise<void> => {
    if (!this.pdfDoc) return;
    const outline = await this.pdfDoc.getOutline();
    console.log('PDF Outline:', outline);
    if (!outline || outline.length === 0) {
      console.log('No outline found in PDF, hiding TOC button.');
      this.tocButton.style.display = 'none';
      return;
    }
    this.tocButton.style.display = 'block';  // 确保目录按钮显示

    const createOutlineItem = (item: any): HTMLLIElement => {
      const li = document.createElement('li');
      li.style.setProperty('margin', '5px 0 5px 20px');
      const title = document.createElement('span');
      title.textContent = item.title;
      title.style.cursor = 'pointer';  // 修复语法错误
      title.style.setProperty('display', 'block');
      title.style.setProperty('padding', '5px 0');  // 增加点击区域
      title.onclick = async () => {
        if (!this.pdfDoc || this.isLoading) return;
        
        try {
          const dest = typeof item.dest === 'string' ? await this.pdfDoc.getDestination(item.dest) : item.dest;
          if (!dest) return;
          const pageIndex = await this.pdfDoc.getPageIndex(dest[0]);
          await this.navigateToPage(pageIndex + 1);
          this.toggleToc();  // 跳转后关闭目录
        } catch (error) {
          console.error('Failed to navigate to destination:', error);
          this.hideLoading();
        }
      };
      li.appendChild(title);

      if (item.items && item.items.length > 0) {
        const sublist = document.createElement('ul');
        sublist.style.setProperty('padding-left', '20px');
        sublist.style.setProperty('list-style', 'none');  // 移除默认的列表样式
        item.items.forEach((subItem: any) => {
          sublist.appendChild(createOutlineItem(subItem));
        });
        li.appendChild(sublist);
      }
      return li;
    };

    const outlineList = document.createElement('ul');
    outlineList.style.setProperty('list-style-type', 'none');
    outlineList.style.setProperty('padding-left', '10px');
    outlineList.style.setProperty('margin', '0');  // 移除默认外边距
    outline.forEach((item) => {
      outlineList.appendChild(createOutlineItem(item));
    });
    this.tocListContainer.innerHTML = '';
    this.tocListContainer.appendChild(outlineList);
  };

  pdfPreview = (): Promise<BaseReturn> => {
    return new Promise((resolve, reject) => {
      console.log('Starting PDF preview...');

      try {
        console.log('Initializing PDF.js worker...');
        // 注意: 这里的路径需要根据你的项目构建配置进行调整
        const workerUrl = new URL('@/assets/pdf.worker.min.mjs', import.meta.url).href;
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
        console.log('Worker configured with URL:', workerUrl);

        console.log('Loading PDF document...');
        pdfjsLib
          .getDocument(this.pdf)
          .promise.then(async (doc: PDFDocumentProxy) => {
            console.log('PDF document loaded. Pages:', doc.numPages);
            this.pdfDoc = doc;
            this.total = doc.numPages;

            if (this.onLoad) {
              this.onLoad({ success: true, data: this.pdfDoc });
            }

            this.updatePageIndicator(1); // 初始显示第一页
            this.renderOutline();

            // [优化] 初始渲染，并持续渲染直到填满视口
            console.log('Starting initial page render...');
            while (this.pageNumber < this.total && (this.pageContainer.scrollHeight < this.dom.clientHeight || this.pageNumber === 0)) {
               if (this.pageNumber > 0) {
                 console.log('Rendering additional initial page to fill viewport');
               }
               await this.renderNextPage();
            }
            
            console.log('Initial pages rendered successfully');
            resolve({ success: true, data: this.pdfDoc });
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            console.error('Failed to load PDF document:', error);
            if(this.onError) {
              this.onError({ success: false, data: null, message });
            }
            reject({ success: false, data: null, message });
          });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error in PDF preview';
        console.error('Error in PDF preview:', error);
        if(this.onError) {
          this.onError({ success: false, data: null, message });
        }
        reject({ success: false, data: null, message });
      }
    });
  };
}

const createReader = (file: File): Promise<string | ArrayBuffer | null> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.onabort = (abort) => {
      reject(abort);
    };
  });
};

export const renderPdf = async (file: File, options: RenderOptions): Promise<void> => {
  console.log('renderPdf called with file:', file.name);
  try {
    if (typeof window === 'undefined') {
      throw new Error('Window is undefined');
    }

    console.log('Reading PDF file...');
    const pdf = await createReader(file);
    if (!pdf) {
      throw new Error('Failed to read PDF file');
    }
    console.log('PDF file read successfully');

    const { dom } = options;
    if (!dom) {
      throw new Error('DOM element not provided');
    }
    
    // 设置容器样式
    dom.style.setProperty('display', 'flex');
    dom.style.setProperty('flex-direction', 'column');
    dom.style.setProperty('align-items', 'center');
    dom.style.setProperty('width', '100%');
    dom.style.setProperty('height', '100%');
    dom.style.setProperty('overflow', 'auto');
    
    console.log('Creating PdfPreview instance...');
    const PDF = new PdfPreview(pdf, options);
    
    console.log('Starting PDF preview...');
    await PDF.pdfPreview();
    console.log('PDF preview completed');
    
  } catch (error) {
    console.error('Failed to render PDF:', error);
    const { onError } = options;
    if (onError) {
      onError({ 
        success: false, 
        data: null, 
        message: error instanceof Error ? error.message : 'Failed to render PDF' 
      });
    }
  }
};