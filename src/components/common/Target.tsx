import { type App, type FrontMatterCache } from 'obsidian';
import React, {
  forwardRef, useEffect, useRef, useState, useImperativeHandle, useMemo,
} from 'react';
import { type WatermarkProps, Watermark } from '@pansy/react-watermark';
import Metadata from './Metadata';
import { lowerCase } from 'lodash';
import clsx from 'clsx';
import { getRemoteImageUrl } from 'src/utils/capture';

const alignMap = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
};

export interface TargetRef {
  element: HTMLElement;
  contentElement: HTMLElement;
  setClip: (startY: number, height: number) => void;
  resetClip: () => void;
}

// Función para ajustar el texto al contenedor
const fitTextToContainer = (textElement: HTMLElement, containerElement: HTMLElement, aspectRatio: number) => {
  if (!textElement || !containerElement) return;

  const containerWidth = containerElement.clientWidth;
  const containerHeight = containerElement.clientHeight;
  
  // Ajustamos el padding vertical según la proporción
  const horizontalPadding = 80; // 40px en cada lado
  let verticalPadding;
  if (aspectRatio >= 16/9) { // 16:9
    verticalPadding = 60;
  } else if (aspectRatio === 1) { // 1:1
    verticalPadding = 140; // Aumentamos el padding vertical para 1:1
  } else { // 9:16
    verticalPadding = 120;
  }
  
  const availableWidth = containerWidth - horizontalPadding;
  const availableHeight = containerHeight - verticalPadding;

  // Empezamos con un tamaño base
  let fontSize = aspectRatio >= 16/9 ? 40 : 50;
  textElement.style.fontSize = `${fontSize}px`;

  // Ajustamos el tamaño hasta que el texto quepa en el contenedor
  while (
    (textElement.scrollWidth > availableWidth || textElement.scrollHeight > availableHeight) 
    && fontSize > 8
  ) {
    fontSize -= 1;
    textElement.style.fontSize = `${fontSize}px`;
  }

  // Si el texto es muy pequeño, intentamos aumentarlo
  while (
    textElement.scrollWidth < availableWidth * 0.95 
    && textElement.scrollHeight < availableHeight * 0.95 
    && fontSize < 200
  ) {
    fontSize += 1;
    textElement.style.fontSize = `${fontSize}px`;
    if (textElement.scrollWidth > availableWidth || textElement.scrollHeight > availableHeight) {
      fontSize -= 1;
      textElement.style.fontSize = `${fontSize}px`;
      break;
    }
  }

  // Actualizamos la variable CSS
  textElement.style.setProperty('--calculated-font-size', `${fontSize}px`);
};

const Target = forwardRef<
  TargetRef,
  {
    frontmatter: FrontMatterCache | undefined;
    setting: ISettings;
    title: string;
    metadataMap: Record<string, { type: MetadataType }>;
    markdownEl: Node;
    app: App;
    scale?: number;
    isProcessing: boolean;
  }
>(({ frontmatter, setting, title, metadataMap, markdownEl, scale = 1, isProcessing }, ref) => {
  const [watermarkProps, setWatermarkProps] = useState<WatermarkProps>({});
  const contentRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const [rootHeight, setRootHeight] = useState(0);

  // Efecto para ajustar el texto cuando cambia el contenido o el tamaño
  useEffect(() => {
    if (!contentRef.current) return;
    
    // Limpiamos y agregamos el nuevo contenido
    contentRef.current.innerHTML = '';
    contentRef.current.append(markdownEl.cloneNode(true));
    
    // Calculamos la proporción actual
    const aspectRatio = setting.width / setting.height;
    
    // Buscamos todos los párrafos para ajustar su tamaño
    const paragraphs = contentRef.current.querySelectorAll('p');
    const container = contentRef.current.closest('.markdown-preview-view');
    
    if (container) {
      paragraphs.forEach(p => {
        // Creamos un div contenedor para alinear el texto
        const textContainer = document.createElement('div');
        textContainer.style.width = '100%';
        textContainer.style.display = 'flex';
        textContainer.style.flexDirection = 'column';
        textContainer.style.alignItems = 'flex-start';
        p.parentNode?.insertBefore(textContainer, p);
        textContainer.appendChild(p);
        
        // Dividimos el texto en palabras
        const text = p.textContent || '';
        const words = text.split(' ');
        p.innerHTML = ''; // Limpiamos el contenido actual
        
        let currentLine = document.createElement('span');
        currentLine.className = 'highlight-line';
        
        // Creamos un span temporal para medir el ancho
        const tempSpan = document.createElement('span');
        tempSpan.style.visibility = 'hidden';
        tempSpan.style.position = 'absolute';
        p.appendChild(tempSpan);
        
        words.forEach((word, i) => {
          const prevContent = currentLine.textContent || '';
          const testContent = prevContent ? prevContent + ' ' + word : word;
          tempSpan.textContent = testContent;
          
          // Si la palabra hace que la línea sea demasiado larga, creamos una nueva línea
          if (tempSpan.offsetWidth > container.clientWidth * 0.75 && prevContent) {
            p.appendChild(currentLine);
            p.appendChild(document.createElement('br'));
            currentLine = document.createElement('span');
            currentLine.className = 'highlight-line';
            currentLine.textContent = word;
          } else {
            currentLine.textContent = testContent;
          }
          
          // Si es la última palabra, agregamos la línea actual
          if (i === words.length - 1) {
            p.appendChild(currentLine);
          }
        });
        
        // Removemos el span temporal
        tempSpan.remove();
        
        fitTextToContainer(p as HTMLElement, container as HTMLElement, aspectRatio);
      });
    }

    // Observador para ajustar el texto cuando cambie el tamaño del contenedor
    const resizeObserver = new ResizeObserver(() => {
      if (container) {
        paragraphs.forEach(p => {
          fitTextToContainer(p as HTMLElement, container as HTMLElement, aspectRatio);
        });
      }
    });

    if (container) {
      resizeObserver.observe(container);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [markdownEl, setting.width, setting.height]);

  useEffect(() => {
    if (!rootRef.current) return;
    const observer = new ResizeObserver(() => {
      if (rootRef.current) {
        setRootHeight(rootRef.current.clientHeight);
      }
    });
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);

  const splitLines = useMemo(() => {
    if (!setting.split.enable || !rootHeight) return [];
    // 计算最小分割高度：重叠高度 + 50px
    const minSplitHeight = setting.split.overlap + 50;
    // 使用设置的高度和最小高度中的较大值
    const effectiveHeight = Math.max(setting.split.height, minSplitHeight);

    const lines: number[] = [];
    const firstPageHeight = effectiveHeight;
    let currentY = firstPageHeight;

    while (currentY < rootHeight) {
      lines.push(currentY);
      currentY += effectiveHeight - setting.split.overlap;
    }
    return lines;
  }, [setting.split.enable, setting.split.height, setting.split.overlap, rootHeight]);

  const splitLineStyle = useMemo(() => ({
    position: 'absolute',
    left: 0,
    right: 0,
    height: `${2 / scale}px`,
    borderTop: `${2 / scale}px dashed var(--interactive-accent)`,
    opacity: 0.7,
    pointerEvents: 'none',
  } as const), [scale]);

  useEffect(() => {
    (async () => {
      const props: WatermarkProps = {
        monitor: false,
        mode: 'interval',
        visible: setting.watermark.enable,
        rotate: setting.watermark.rotate ?? -30,
        opacity: setting.watermark.opacity ?? 0.2,
        height: setting.watermark.height ?? 64,
        width: setting.watermark.width ?? 120,
        gapX: setting.watermark.x ?? 100,
        gapY: setting.watermark.y ?? 100,
      };

      if (setting.watermark.type === 'text') {
        props.text = setting.watermark.text.content;
        props.fontSize = setting.watermark.text.fontSize || 16;
        props.fontColor = setting.watermark.text.color || '#cccccc';
        props.image = undefined;
      } else {
        props.image = await getRemoteImageUrl(setting.watermark.image.src);
      }

      setWatermarkProps(props);
    })();
  }, [setting]);

  useImperativeHandle(ref, () => ({
    element: clipRef.current!,
    contentElement: rootRef.current!,
    setClip: (startY: number, height: number) => {
      if (!clipRef.current || !rootRef.current) return;
      clipRef.current.style.height = `${height}px`;
      clipRef.current.style.overflow = 'hidden';
      rootRef.current.style.transform = `translateY(-${startY}px)`;
    },
    resetClip: () => {
      if (!clipRef.current || !rootRef.current) return;
      clipRef.current.style.height = '';
      clipRef.current.style.overflow = '';
      rootRef.current.style.transform = '';
    }
  }), [clipRef.current, rootRef.current]);

  return (
    <div ref={clipRef}>
      <div
        className={clsx('export-image-root markdown-reading-view', frontmatter?.cssclasses || frontmatter?.cssclass)}
        ref={rootRef}
        style={{
          display: 'flex',
          flexDirection:
            setting.authorInfo.position === 'bottom'
              ? 'column'
              : 'column-reverse',
          backgroundColor:
            setting.format === 'png1' ? 'unset' : '#ffffff',
          position: 'relative',
          ['--highlight-color' as string]: setting.highlightColor || '#FFEBC2',
          fontFamily: setting.fontFamily || 'sans-serif',
          color: '#000000',
        }}
      >
        <Watermark {...watermarkProps}>
          <div
            className='markdown-preview-view markdown-rendered export-image-preview-container'
            style={{
              width: `${setting.width}px`,
              height: `${setting.height}px`,
              transition: 'width 0.25s, height 0.25s',
              fontFamily: 'inherit',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {setting.showFilename && (
              <div className='inline-title' autoCapitalize='on'>
                {title}
              </div>
            )}
            {setting.showMetadata
              && frontmatter
              && Object.keys(frontmatter).length > 0 && (
                <div className='metadata-container' style={{ display: 'block' }}>
                  <div className='metadata-content'>
                    {Object.keys(frontmatter).map(name => (
                      <Metadata
                        name={name}
                        key={name}
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                        value={frontmatter[name]}
                        type={metadataMap[lowerCase(name)]?.type || 'text'}
                      ></Metadata>
                    ))}
                  </div>
                </div>
              )}
            <div ref={contentRef}></div>
          </div>
        </Watermark>
        {setting.authorInfo.show
          && (setting.authorInfo.avatar || setting.authorInfo.name) && (
            <div
              className='user-info-container'
              style={{
                [setting.authorInfo.position === 'top'
                  ? 'borderBottom'
                  : 'borderTop']: '1px solid var(--background-modifier-border)',

                justifyContent: alignMap[setting.authorInfo.align || 'right'],
                background:
                  setting.format === 'png1'
                    ? 'unset'
                    : 'var(--background-primary)',
              }}
            >
              {setting.authorInfo.avatar && (
                <div
                  className='user-info-avatar'
                  style={{
                    backgroundImage: `url(${setting.authorInfo.avatar})`,
                  }}
                ></div>
              )}
              {setting.authorInfo.name && (
                <div>
                  <div className='user-info-name'>{setting.authorInfo.name}</div>
                  {setting.authorInfo.remark && (
                    <div className='user-info-remark'>
                      {setting.authorInfo.remark}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        }
        {!isProcessing && splitLines.map((y, index) => (
          <div
            key={index}
            style={{
              ...splitLineStyle,
              top: y,
              zIndex: 10,
            }}
          />
        ))}
      </div>
    </div>
  );
});

export default Target;
