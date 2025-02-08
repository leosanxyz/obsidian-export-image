import { type App, type FrontMatterCache, Notice, Platform } from 'obsidian';
import React, {
  useState, useRef, type FC, useEffect, useCallback,
} from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { isCopiable } from 'src/imageFormatTester';
import { copy, save, saveAll } from '../../utils/capture';
import L from '../../L';
import Target, { type TargetRef } from '../common/Target';
import FormItems from '../common/form/FormItems';
import { HIGHLIGHT_COLORS, FONT_FAMILIES } from '../../formConfig';

const ASPECT_RATIOS = [
  { width: 1920, height: 1080, label: '16:9', icon: '⬜' },
  { width: 1080, height: 1920, label: '9:16', icon: '⬛' },
  { width: 1080, height: 1080, label: '1:1', icon: '🟥' },
];

const formSchema: FormSchema<ISettings> = [
  {
    label: L.includingFilename(),
    path: 'showFilename',
    type: 'boolean',
  },
  {
    path: 'split.enable',
    label: L.setting.split.enable.label(),
    type: 'boolean',
  },
  {
    path: 'split.height',
    label: L.setting.split.height.label(),
    type: 'number',
    when: { flag: true, path: 'split.enable' },
  },
  {
    path: 'split.overlap',
    label: L.setting.split.overlap.label(),
    type: 'number',
    when: { flag: true, path: 'split.enable' },
  },
  {
    label: L.setting.userInfo.show(),
    path: 'authorInfo.show',
    type: 'boolean',
  },
  {
    label: L.setting.userInfo.name(),
    path: 'authorInfo.name',
    type: 'string',
    when: { flag: true, path: 'authorInfo.show' },
  },
  {
    label: L.setting.userInfo.remark(),
    path: 'authorInfo.remark',
    type: 'string',
    when: { flag: true, path: 'authorInfo.show' },
  },
  {
    label: L.setting.userInfo.avatar.title(),
    desc: L.setting.userInfo.avatar.description(),
    path: 'authorInfo.avatar',
    type: 'file',
    when: { flag: true, path: 'authorInfo.show' },
  },
  {
    label: L.setting.userInfo.align(),
    path: 'authorInfo.align',
    type: 'select',
    options: [
      { text: 'Left', value: 'left' },
      { text: 'Center', value: 'center' },
      { text: 'Right', value: 'right' },
    ],
    when: { flag: true, path: 'authorInfo.show' },
  },
  {
    label: L.setting.userInfo.position(),
    path: 'authorInfo.position',
    type: 'select',
    options: [
      { text: 'Top', value: 'top' },
      { text: 'Bottom', value: 'bottom' },
    ],
    when: { flag: true, path: 'authorInfo.show' },
  },
  {
    label: L.setting.watermark.enable.label(),
    path: 'watermark.enable',
    type: 'boolean',
  },
  {
    label: L.setting.watermark.type.label(),
    path: 'watermark.type',
    type: 'select',
    options: [
      { text: L.setting.watermark.type.text(), value: 'text' },
      { text: L.setting.watermark.type.image(), value: 'image' },
    ],
    when: { flag: true, path: 'watermark.enable' },
  },
  {
    label: L.setting.watermark.text.content(),
    path: 'watermark.text.content',
    type: 'string',
    when: settings =>
      settings.watermark.enable && settings.watermark.type === 'text',
  },
  {
    label: L.setting.watermark.image.src.label(),
    path: 'watermark.image.src',
    type: 'file',
    when: settings =>
      settings.watermark.enable && settings.watermark.type === 'image',
  },
  {
    label: L.setting.watermark.opacity(),
    path: 'watermark.opacity',
    type: 'number',
    when: { flag: true, path: 'watermark.enable' },
  },
  {
    label: L.setting.watermark.rotate(),
    path: 'watermark.rotate',
    type: 'number',
    when: { flag: true, path: 'watermark.enable' },
  },
  {
    label: L.setting.watermark.width(),
    path: 'watermark.width',
    type: 'number',
    when: { flag: true, path: 'watermark.enable' },
  },
  {
    label: L.setting.watermark.height(),
    path: 'watermark.height',
    type: 'number',
    when: { flag: true, path: 'watermark.enable' },
  },
];

const ColorPicker: FC<{
  value: string;
  onChange: (color: string) => void;
}> = ({ value, onChange }) => {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
      {HIGHLIGHT_COLORS.map(color => (
        <div
          key={color.value}
          title={color.text}
          onClick={() => onChange(color.value)}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '4px',
            backgroundColor: color.value,
            cursor: 'pointer',
            border: value === color.value ? '2px solid var(--interactive-accent)' : '1px solid var(--background-modifier-border)',
          }}
        />
      ))}
    </div>
  );
};

const FontFamilyPicker: FC<{
  value: 'serif' | 'sans-serif';
  onChange: (font: 'serif' | 'sans-serif') => void;
}> = ({ value, onChange }) => {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', marginBottom: '8px' }}>Font Style</label>
      <div style={{ display: 'flex', gap: '8px' }}>
        {FONT_FAMILIES.map(font => (
          <div
            key={font.value}
            title={font.text}
            onClick={() => onChange(font.value as 'serif' | 'sans-serif')}
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: value === font.value ? 'var(--interactive-accent)' : 'var(--background-modifier-border)',
              color: value === font.value ? 'var(--text-on-accent)' : 'var(--text-normal)',
              fontFamily: font.value,
            }}
          >
            {font.text}
          </div>
        ))}
      </div>
    </div>
  );
};

const FontSizeSlider: FC<{
  value: number;
  onChange: (size: number) => void;
}> = ({ value, onChange }) => {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', marginBottom: '8px' }}>Font Size Base: {value}px</label>
      <input
        type="range"
        min="8"
        max="48"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  );
};

const SettingsGroup: FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ 
    border: '1px solid var(--background-modifier-border)',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    backgroundColor: 'var(--background-primary)',
  }}>
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '16px'
    }}>
      {children}
    </div>
  </div>
);

const AspectRatioPicker: FC<{
  value: { width: number; height: number };
  onChange: (dimensions: { width: number; height: number }) => void;
}> = ({ value, onChange }) => {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', marginBottom: '8px' }}>Image Size</label>
      <div style={{ display: 'flex', gap: '8px' }}>
        {ASPECT_RATIOS.map(ratio => (
          <div
            key={ratio.label}
            title={`${ratio.width}x${ratio.height}`}
            onClick={() => onChange(ratio)}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: 
                value.width === ratio.width && value.height === ratio.height 
                  ? 'var(--interactive-accent)' 
                  : 'var(--background-modifier-border)',
              color: 
                value.width === ratio.width && value.height === ratio.height
                  ? 'var(--text-on-accent)' 
                  : 'var(--text-normal)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>{ratio.icon}</span>
            <span>{ratio.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ModalContent: FC<{
  markdownEl: Node;
  settings: ISettings;
  frontmatter: FrontMatterCache | undefined;
  title: string;
  app: App;
  metadataMap: Record<string, { type: MetadataType }>;
}> = ({ markdownEl, settings, app, frontmatter, title, metadataMap }) => {
  const [formData, setFormData] = useState<ISettings>({
    ...settings,
    width: settings.width || 1920,
    height: settings.height || 1080,
  });
  const [isGrabbing, setIsGrabbing] = useState(false);
  const previewOutRef = useRef<HTMLDivElement>(null);
  const mainHeight = Math.min(764, (window.innerHeight * 0.85) - 225);
  const root = useRef<TargetRef>(null);
  const [processing, setProcessing] = useState(false);
  const [allowCopy, setAllowCopy] = useState(true);
  const [rootHeight, setRootHeight] = useState(0);
  const [pages, setPages] = useState(1);
  const [scale, setScale] = useState(1);

  const calculateScale = useCallback(() => {
    if (!root.current?.element || !previewOutRef.current) return 1;
    const contentHeight = root.current.element.clientHeight;
    const contentWidth = root.current.element.clientWidth;
    const previewWidth = previewOutRef.current.clientWidth;

    return Math.min(
      1,
      mainHeight / (contentHeight || 100),
      previewWidth / ((contentWidth || 0) + 2),
    ) / 2;
  }, [mainHeight]);

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  useEffect(() => {
    if (!root.current?.element || processing) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (root.current?.element) {
        if (!processing) {
          setRootHeight(root.current.element.clientHeight);
        }
      }
    });
    observer.observe(root.current.element);
    return () => {
      observer.disconnect();
    };
  }, [root.current?.element, processing]);

  useEffect(() => {
    if (formData.split.enable) {
      const firstPage = formData.split.height;
      const remainingHeight = rootHeight - firstPage;
      const additionalPages = Math.max(0, Math.ceil(remainingHeight / (formData.split.height - formData.split.overlap)));
      setPages(1 + additionalPages);
    } else {
      setPages(1);
    }
  }, [rootHeight, formData.split.enable, formData.split.height, formData.split.overlap]);
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    isCopiable(formData.format).then(result => {
      setAllowCopy(Boolean(result));
    });
  }, [formData.format]);

  const handleSave = useCallback(async () => {
    if ((formData.width || 640) <= 20) {
      new Notice(L.invalidWidth());
      return;
    }
    if (!root.current) return;

    setProcessing(true);
    try {
      await save(
        app,
        root.current.contentElement,
        title,
        formData['2x'],
        formData.format,
        Platform.isMobile,
      );
    } catch {
      new Notice(L.saveFail());
    }
    setProcessing(false);
  }, [root, formData['2x'], formData.format, title, formData.width]);
  const handleCopy = useCallback(async () => {
    if ((formData.width || 640) <= 20) {
      new Notice(L.invalidWidth());
      return;
    }
    if (!root.current) return;

    setProcessing(true);
    try {
      await copy(root.current.contentElement, formData['2x'], formData.format);
    } catch {
      new Notice(L.copyFail());
    }

    setProcessing(false);
  }, [root, formData['2x'], formData.format, title, formData.width]);

  const handleSaveAll = useCallback(async () => {
    if ((formData.width || 640) <= 20) {
      new Notice(L.invalidWidth());
      return;
    }
    if (!root.current) return;

    setProcessing(true);
    try {
      await saveAll(
        root.current,
        formData.format,
        formData['2x'],
        formData.split.height,
        formData.split.overlap,
        app,
        title,
        previewOutRef.current!,
      );
    } catch {
      new Notice(L.copyFail());
    }
    setProcessing(false);
  }, [root, formData.format, formData['2x'], formData.split, app, title, previewOutRef]);

  return (
    <div className='export-image-preview-root'>
      <div className='export-image-preview-main'>
        <div className='export-image-preview-left'>
          <SettingsGroup>
            <ColorPicker
              value={formData.highlightColor}
              onChange={(color) => setFormData({ ...formData, highlightColor: color })}
            />
            <FontFamilyPicker
              value={formData.fontFamily}
              onChange={(font) => setFormData({ ...formData, fontFamily: font })}
            />
            <AspectRatioPicker
              value={{ width: formData.width, height: formData.height }}
              onChange={({ width, height }) => setFormData({ ...formData, width, height })}
            />
          </SettingsGroup>
          <SettingsGroup>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <FormItems
                formSchema={formSchema}
                update={setFormData}
                settings={formData}
                app={app}
              />
            </div>
          </SettingsGroup>
          {formData.split.enable && <div className='info-text'>
            {L.splitInfo({ rootHeight, splitHeight: formData.split.height, pages })}
          </div>}
          <div className='info-text'>{L.moreSetting()}</div>
        </div>
        <div className='export-image-preview-right'>
          <div
            className='export-image-preview-out'
            ref={previewOutRef}
            style={{
              height: mainHeight,
              cursor: isGrabbing ? 'grabbing' : 'grab',
            }}
          >
            <TransformWrapper
              minScale={calculateScale()}
              maxScale={4}
              pinch={{ step: 20 }}
              doubleClick={{ mode: 'reset' }}
              centerZoomedOut={false}
              onPanning={() => {
                setIsGrabbing(true);
              }}
              onPanningStop={() => {
                setIsGrabbing(false);
              }}
              onTransformed={(e) => {
                setScale(e.state.scale);
              }}
              initialScale={1}
            >
              <TransformComponent
                wrapperStyle={{
                  width: '100%',
                  height: mainHeight,
                }}
                contentStyle={{
                  border: '1px var(--divider-color) solid',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  boxShadow: '0 0 10px 10px rgba(0,0,0,0.15)',
                }}
              >
                <Target
                  ref={root}
                  frontmatter={frontmatter}
                  markdownEl={markdownEl}
                  setting={formData}
                  metadataMap={metadataMap}
                  app={app}
                  title={title}
                  scale={scale}
                  isProcessing={processing}
                ></Target>
              </TransformComponent>
            </TransformWrapper>
          </div>
          <div className='info-text'>{L.guide()}</div>
        </div>
      </div>
      <div className='export-image-preview-actions'>
        {pages === 1 && (
          <div>
            <button onClick={handleCopy} disabled={processing || !allowCopy}>
              {L.copy()}
            </button>
            {allowCopy || <p>{L.notAllowCopy({ format: formData.format.replace(/\d$/, '').toUpperCase() })}</p>}
          </div>
        )}

        <button onClick={() => pages === 1 ? handleSave() : handleSaveAll()} disabled={processing}>
          {Platform.isMobile ? L.saveVault() : L.save()}
        </button>
      </div>
    </div>
  );
};

export default ModalContent;
