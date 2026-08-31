import Image from '@tiptap/extension-image';
import Bold from '@tiptap/extension-bold';
import TextStyle from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import { Extension, mergeAttributes } from '@tiptap/core';

// 装飾文字の末尾で入力を始めたとき、直前の色・太字・下線などを
// 意図せず次の文字へ引き継がないようにする。
export const NonInclusiveBold = Bold.extend({ inclusive: true });
export const NonInclusiveUnderline = Underline.extend({ inclusive: true });
// 色とサイズは、ユーザーが明示的に変更した後の連続入力では維持する。
// 装飾境界と改行時のリセットはエディタ側のイベントで制御する。
export const NonInclusiveTextStyle = TextStyle.extend({ inclusive: true });

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{ types: ['textStyle'], attributes: { fontSize: {
      default: null,
      parseHTML: (element) => element.style.fontSize || null,
      renderHTML: (attributes) => attributes.fontSize
        ? { style: `font-size: ${attributes.fontSize}; line-height: 1.4;` } : {},
    } } }];
  },
  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }) => chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

export const NoteImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: '100%', parseHTML: (element) => element.style.width || element.getAttribute('width') || '100%' },
      align: {
        default: 'left',
        parseHTML: (element) => {
          if (element.style.marginLeft === 'auto' && element.style.marginRight === 'auto') return 'center';
          if (element.style.marginLeft === 'auto' && element.style.marginRight === '0px') return 'right';
          return element.dataset.align || 'left';
        },
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const align = HTMLAttributes.align as string;
    const margin = align === 'center' ? '8px auto' : align === 'right' ? '8px 0 8px auto' : '8px auto 8px 0';
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
      draggable: 'true', 'data-align': align,
      style: `width:${HTMLAttributes.width};max-width:100%;height:auto;display:block;margin:${margin};border:1px solid #e5e7eb;border-radius:12px;`,
    })];
  },
}).configure({ inline: false, allowBase64: false });

export function normalizeStudentNoteHtml(html: string): string {
  if (!html || typeof window === 'undefined') return html;
  const container = document.createElement('div');
  container.innerHTML = html;
  const legacySizes: Record<string, string> = {
    'xx-small': '12px', 'x-small': '12px', small: '12px', medium: '14px',
    large: '18px', 'x-large': '24px', 'xx-large': '24px', '-webkit-xxx-large': '24px',
  };
  container.querySelectorAll<HTMLElement>('[style*="font-size"]').forEach((element) => {
    const size = element.style.fontSize.toLowerCase();
    const pixels = size.endsWith('px') ? Number.parseFloat(size) : Number.NaN;
    element.style.fontSize = legacySizes[size] || (Number.isFinite(pixels)
      ? pixels <= 12 ? '12px' : pixels <= 15 ? '14px' : pixels <= 20 ? '18px' : '24px' : '14px');
    element.style.lineHeight = '1.4';
  });
  container.querySelectorAll<HTMLFontElement>('font[size]').forEach((font) => {
    const span = document.createElement('span');
    const value = Number(font.getAttribute('size'));
    span.style.fontSize = value <= 2 ? '12px' : value <= 3 ? '14px' : value <= 5 ? '18px' : '24px';
    span.style.lineHeight = '1.4'; span.innerHTML = font.innerHTML; font.replaceWith(span);
  });
  return container.innerHTML;
}
